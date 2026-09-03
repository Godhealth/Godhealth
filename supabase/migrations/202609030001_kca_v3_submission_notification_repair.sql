-- GodHealth KCA V3 submission reliability + notification queue repair.
-- Keeps all sensitive work server-side and gives n8n/Supabase automations
-- a durable event to process after every successful assessment submission.

create extension if not exists pgcrypto;

create table if not exists public.kca_notification_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.kca_assessment_runs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  recipient_email text,
  recipient_name text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','skipped')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kca_notification_events_status_idx
  on public.kca_notification_events (status, created_at);

create index if not exists kca_notification_events_run_idx
  on public.kca_notification_events (run_id, created_at desc);

create unique index if not exists kca_notification_events_confirmation_once
  on public.kca_notification_events (run_id, event_type)
  where event_type = 'kca_v3_assessment_confirmation_requested';

alter table public.kca_notification_events enable row level security;

drop policy if exists "Authorized coaches can read KCA notification events" on public.kca_notification_events;
create policy "Authorized coaches can read KCA notification events"
on public.kca_notification_events
for select
to authenticated
using (public.kca_can_access_client(user_id));

revoke all on public.kca_notification_events from anon, authenticated;

create or replace function public.kca_v3_submit_assessment(
  p_intake jsonb,
  p_safety_answers jsonb,
  p_responses jsonb,
  p_consent jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_email text;
  v_client_name text;
  v_clean_intake jsonb;
  v_definition jsonb;
  v_score jsonb;
  v_safety jsonb;
  v_plan jsonb;
  v_run_id uuid;
  v_engine_run_id uuid;
  v_question jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then
    raise exception 'premium_entitlement_required';
  end if;

  select email
  into v_client_email
  from auth.users
  where id = v_user_id
  limit 1;

  v_client_name := coalesce(
    nullif(trim(coalesce(p_intake->>'client_name','')), ''),
    nullif(trim(coalesce(p_intake->>'full_name','')), ''),
    nullif(trim(coalesce(p_consent->>'full_name','')), ''),
    v_client_email,
    'GodHealth Client'
  );

  v_clean_intake := jsonb_set(coalesce(p_intake, '{}'::jsonb), '{client_name}', to_jsonb(v_client_name), true);

  select definition
  into v_definition
  from public.kca_assessment_definitions
  where definition_version = '3.0.0'
    and retired_at is null;

  if v_definition is null then
    raise exception 'definition_not_found';
  end if;

  v_score := public.kca_v3_score_snapshot(v_definition, coalesce(p_responses, '{}'::jsonb));
  v_safety := public.kca_v3_route_safety(v_definition, coalesce(p_safety_answers, '{}'::jsonb));
  v_plan := public.kca_v3_build_plan_draft(v_score, v_clean_intake, v_safety);

  insert into public.kca_assessment_runs (
    user_id,
    definition_version,
    assessment_type,
    status,
    context,
    safety_flags,
    adaptive_assignment,
    score_snapshot,
    big3_candidates,
    submitted_at
  )
  values (
    v_user_id,
    '3.0.0',
    'baseline',
    case
      when coalesce((v_safety->>'stop_normal_recommendation_flow')::boolean, false)
        then 'safety_paused'
      else 'submitted'
    end,
    jsonb_build_object(
      'client_name', v_client_name,
      'client_email', v_client_email,
      'primary_goal', v_clean_intake->>'GL1',
      'v3_intake_collected', true,
      'confirmation_event_required', true
    ),
    v_safety,
    '{"v3_no_automatic_deep_dive":true}'::jsonb,
    v_score,
    jsonb_build_object(
      'client_visible', false,
      'coach_approval_required', true,
      'priorities', v_plan->'big3'
    ),
    now()
  )
  returning id into v_run_id;

  for v_question in
    select value from jsonb_array_elements(v_definition->'capacity_core')
  loop
    insert into public.kca_responses (
      run_id,
      user_id,
      question_id,
      question_role,
      answer_value,
      answer_text
    )
    values (
      v_run_id,
      v_user_id,
      v_question->>'id',
      'core',
      (p_responses->>(v_question->>'id'))::integer,
      v_question->>'statement'
    );
  end loop;

  for v_question in
    select value from jsonb_array_elements(v_definition->'safety_gates')
  loop
    insert into public.kca_responses (
      run_id,
      user_id,
      question_id,
      question_role,
      answer_value,
      answer_text
    )
    values (
      v_run_id,
      v_user_id,
      v_question->>'id',
      'safety_gate',
      null,
      coalesce(p_safety_answers->>(v_question->>'id'), 'no') || ' — ' || (v_question->>'question')
    );
  end loop;

  insert into public.kca_personal_intakes (
    user_id,
    run_id,
    assessment_version,
    completion_status,
    consent,
    safety_answers,
    intake
  )
  values (
    v_user_id,
    v_run_id,
    '3.0.0',
    'submitted',
    coalesce(p_consent, '{}'::jsonb),
    coalesce(p_safety_answers, '{}'::jsonb),
    v_clean_intake
  );

  update public.kca_personal_intakes
  set completion_status = 'archived',
      updated_at = now()
  where user_id = v_user_id
    and assessment_version = '3.0.0'
    and completion_status = 'draft'
    and run_id is null;

  insert into public.kca_energy_profiles (
    run_id,
    user_id,
    assessment_version,
    profile
  )
  values (
    v_run_id,
    v_user_id,
    '3.0.0',
    v_plan->'energy_profile'
  );

  insert into public.kca_plan_engine_runs (
    run_id,
    user_id,
    assessment_version,
    input_snapshot,
    plan_draft
  )
  values (
    v_run_id,
    v_user_id,
    '3.0.0',
    jsonb_build_object(
      'score_snapshot', v_score,
      'safety', v_safety,
      'intake', v_clean_intake
    ),
    v_plan
  )
  returning id into v_engine_run_id;

  insert into public.kca_audit_events (
    run_id,
    user_id,
    event_type,
    metadata
  )
  values (
    v_run_id,
    v_user_id,
    'kca_v3_assessment_submitted',
    jsonb_build_object(
      'definition_version', '3.0.0',
      'response_count', 24,
      'engine_run_id', v_engine_run_id,
      'client_email', v_client_email
    )
  );

  insert into public.kca_notification_events (
    run_id,
    user_id,
    event_type,
    recipient_email,
    recipient_name,
    payload,
    status
  )
  values (
    v_run_id,
    v_user_id,
    'kca_v3_assessment_confirmation_requested',
    v_client_email,
    v_client_name,
    jsonb_build_object(
      'run_id', v_run_id,
      'engine_run_id', v_engine_run_id,
      'assessment_version', '3.0.0',
      'client_name', v_client_name,
      'client_email', v_client_email,
      'status', case
        when coalesce((v_safety->>'stop_normal_recommendation_flow')::boolean, false)
          then 'safety_paused'
        else 'submitted'
      end,
      'message_type', 'client_assessment_confirmation'
    ),
    'pending'
  )
  on conflict (run_id, event_type) where event_type = 'kca_v3_assessment_confirmation_requested'
  do update set
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    payload = excluded.payload,
    status = case
      when public.kca_notification_events.status = 'sent' then public.kca_notification_events.status
      else 'pending'
    end,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'engine_run_id', v_engine_run_id,
    'score_snapshot', v_score,
    'safety_flags', v_safety,
    'status', case
      when coalesce((v_safety->>'stop_normal_recommendation_flow')::boolean, false)
        then 'safety_paused'
      else 'submitted'
    end
  );
end;
$$;

grant execute on function public.kca_v3_submit_assessment(jsonb, jsonb, jsonb, jsonb) to authenticated;
