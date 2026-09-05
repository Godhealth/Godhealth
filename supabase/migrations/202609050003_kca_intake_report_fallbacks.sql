-- GodHealth KCA V3 intake report fallback repair.
-- Ensures both coach and client reports can show the exact personal intake
-- answers even when an older run is missing a linked kca_personal_intakes row.

insert into public.kca_personal_intakes (
  user_id,
  run_id,
  assessment_version,
  completion_status,
  consent,
  safety_answers,
  intake,
  created_at,
  updated_at
)
select
  run.user_id,
  run.id,
  coalesce(run.definition_version, engine.assessment_version, '3.0.0'),
  'submitted',
  '{}'::jsonb,
  coalesce(run.safety_flags, '{}'::jsonb),
  coalesce(engine.input_snapshot->'intake', run.context, '{}'::jsonb),
  coalesce(run.submitted_at, run.created_at, now()),
  now()
from public.kca_assessment_runs run
left join lateral (
  select *
  from public.kca_plan_engine_runs e
  where e.run_id = run.id
  order by e.created_at desc
  limit 1
) engine on true
where run.definition_version = '3.0.0'
  and not exists (
    select 1
    from public.kca_personal_intakes existing
    where existing.run_id = run.id
  )
  and coalesce(engine.input_snapshot->'intake', run.context, '{}'::jsonb) <> '{}'::jsonb;

create or replace function public.kca_v3_my_latest()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.kca_assessment_runs;
  v_plan jsonb;
  v_weeks jsonb;
  v_intake jsonb;
  v_engine jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then raise exception 'premium_entitlement_required'; end if;

  select * into v_run
  from public.kca_assessment_runs
  where user_id = v_user_id and definition_version = '3.0.0'
  order by coalesce(submitted_at, created_at) desc
  limit 1;

  if v_run.id is null then
    return jsonb_build_object('ok', true, 'run', null, 'draft', (
      select to_jsonb(d) from public.kca_personal_intakes d
      where d.user_id = v_user_id and d.assessment_version='3.0.0' and d.completion_status='draft' and d.run_id is null
      order by d.updated_at desc limit 1
    ));
  end if;

  select to_jsonb(p) into v_plan from public.kca_plans p where p.run_id = v_run.id limit 1;
  select to_jsonb(e) into v_engine from public.kca_plan_engine_runs e where e.run_id = v_run.id order by e.created_at desc limit 1;
  select coalesce(jsonb_agg(to_jsonb(w) order by w.week_number), '[]'::jsonb) into v_weeks
  from public.kca_plan_weeks w join public.kca_plans p on p.id = w.plan_id where p.run_id = v_run.id;

  select to_jsonb(i) into v_intake
  from public.kca_personal_intakes i
  where i.run_id = v_run.id
  order by i.updated_at desc
  limit 1;

  if v_intake is null then
    v_intake := jsonb_build_object(
      'id', null,
      'user_id', v_run.user_id,
      'run_id', v_run.id,
      'assessment_version', v_run.definition_version,
      'completion_status', 'submitted',
      'consent', '{}'::jsonb,
      'safety_answers', coalesce(v_run.safety_flags, '{}'::jsonb),
      'intake', coalesce(v_engine->'input_snapshot'->'intake', v_run.context, '{}'::jsonb),
      'created_at', coalesce(v_run.submitted_at, v_run.created_at),
      'updated_at', v_run.updated_at
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'run', to_jsonb(v_run),
    'intake', v_intake,
    'approved_plan', v_plan,
    'approved_weeks', v_weeks,
    'engine_run', v_engine
  );
end;
$$;

grant execute on function public.kca_v3_my_latest() to authenticated;

create or replace function public.kca_coach_dashboard_runs()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.kca_is_coach() then
    raise exception 'not_authorized';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', run.id,
      'user_id', run.user_id,
      'client_email', auth_user.email,
      'client_name', coalesce(
        intake.intake->>'client_name',
        engine.input_snapshot->'intake'->>'client_name',
        run.context->>'client_name',
        auth_user.raw_user_meta_data->>'full_name'
      ),
      'definition_version', run.definition_version,
      'assessment_type', run.assessment_type,
      'status', run.status,
      'context', run.context,
      'safety_flags', run.safety_flags,
      'score_snapshot', run.score_snapshot,
      'big3_candidates', run.big3_candidates,
      'engine_run_id', engine.id,
      'engine_status', engine.status,
      'approved_plan_id', plan.id,
      'submitted_at', run.submitted_at,
      'created_at', run.created_at,
      'updated_at', run.updated_at
    ) order by coalesce(run.submitted_at, run.created_at) desc)
    from public.kca_assessment_runs run
    join auth.users auth_user on auth_user.id = run.user_id
    left join lateral (
      select *
      from public.kca_personal_intakes i
      where i.run_id = run.id
      order by i.updated_at desc
      limit 1
    ) intake on true
    left join lateral (
      select *
      from public.kca_plan_engine_runs e
      where e.run_id = run.id
      order by e.created_at desc
      limit 1
    ) engine on true
    left join public.kca_plans plan on plan.run_id = run.id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.kca_coach_dashboard_runs() to authenticated;

create or replace function public.kca_coach_dashboard_run_detail(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_run public.kca_assessment_runs;
  v_detail jsonb;
begin
  if not public.kca_is_coach() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_run
  from public.kca_assessment_runs
  where id = p_run_id;

  if v_run.id is null then
    raise exception 'run_not_found';
  end if;

  select jsonb_build_object(
    'run', to_jsonb(run),
    'client', jsonb_build_object(
      'user_id', run.user_id,
      'email', auth_user.email,
      'name', coalesce(
        intake.intake->>'client_name',
        engine.input_snapshot->'intake'->>'client_name',
        run.context->>'client_name',
        auth_user.raw_user_meta_data->>'full_name'
      )
    ),
    'definition', def.definition,
    'intake', coalesce(
      to_jsonb(intake),
      jsonb_build_object(
        'id', null,
        'user_id', run.user_id,
        'run_id', run.id,
        'assessment_version', run.definition_version,
        'completion_status', 'submitted',
        'consent', '{}'::jsonb,
        'safety_answers', coalesce(run.safety_flags, '{}'::jsonb),
        'intake', coalesce(engine.input_snapshot->'intake', run.context, '{}'::jsonb),
        'created_at', coalesce(run.submitted_at, run.created_at),
        'updated_at', run.updated_at
      )
    ),
    'energy_profile', (select to_jsonb(e) from public.kca_energy_profiles e where e.run_id = run.id limit 1),
    'engine_run', to_jsonb(engine),
    'review', (select to_jsonb(r) from public.kca_coach_plan_reviews r where r.run_id = run.id limit 1),
    'approved_plan', (select to_jsonb(p) from public.kca_plans p where p.run_id = run.id limit 1),
    'plan_weeks', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.week_number)
      from public.kca_plan_weeks w
      join public.kca_plans p on p.id = w.plan_id
      where p.run_id = run.id
    ), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', response.question_id,
        'question_role', response.question_role,
        'answer_value', response.answer_value,
        'answer_text', response.answer_text,
        'display_answer', case
          when response.question_role = 'core' then response.answer_value::text
          else split_part(coalesce(response.answer_text, ''), ' — ', 1)
        end,
        'question_text', case
          when response.question_role = 'core' then response.answer_text
          else substr(coalesce(response.answer_text, ''), strpos(coalesce(response.answer_text, ''), ' — ') + 3)
        end,
        'created_at', response.created_at
      ) order by response.created_at)
      from public.kca_responses response
      where response.run_id = run.id
    ), '[]'::jsonb),
    'publication', (
      select to_jsonb(publication)
      from public.kca_big3_publications publication
      where publication.run_id = run.id
      limit 1
    ),
    'coach_clarifiers', coalesce(def.definition->'coach_clarifiers', '[]'::jsonb)
  )
  into v_detail
  from public.kca_assessment_runs run
  join auth.users auth_user on auth_user.id = run.user_id
  left join lateral (
    select *
    from public.kca_personal_intakes i
    where i.run_id = run.id
    order by i.updated_at desc
    limit 1
  ) intake on true
  left join lateral (
    select *
    from public.kca_plan_engine_runs e
    where e.run_id = run.id
    order by e.created_at desc
    limit 1
  ) engine on true
  left join public.kca_assessment_definitions def on def.definition_version = run.definition_version
  where run.id = p_run_id;

  return v_detail;
end;
$$;

grant execute on function public.kca_coach_dashboard_run_detail(uuid) to authenticated;
