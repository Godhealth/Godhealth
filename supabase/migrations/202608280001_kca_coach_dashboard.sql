-- GodHealth KCA v2 Coach Dashboard access layer.
-- Keeps report access behind authenticated coach accounts without exposing secrets.

create table if not exists public.kca_coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'coach' check (role in ('owner','coach')),
  created_at timestamptz not null default now()
);

alter table public.kca_coaches enable row level security;

drop policy if exists "KCA coaches can read own coach role" on public.kca_coaches;
create policy "KCA coaches can read own coach role"
on public.kca_coaches
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.kca_is_coach()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.kca_coaches coach
    where coach.user_id = auth.uid()
  );
$$;

grant execute on function public.kca_is_coach() to authenticated;

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
    select jsonb_agg(
      jsonb_build_object(
        'id', run.id,
        'user_id', run.user_id,
        'client_email', auth_user.email,
        'definition_version', run.definition_version,
        'assessment_type', run.assessment_type,
        'status', run.status,
        'context', run.context,
        'safety_flags', run.safety_flags,
        'score_snapshot', run.score_snapshot,
        'big3_candidates', run.big3_candidates,
        'submitted_at', run.submitted_at,
        'created_at', run.created_at,
        'updated_at', run.updated_at
      )
      order by coalesce(run.submitted_at, run.created_at) desc
    )
    from public.kca_assessment_runs run
    join auth.users auth_user on auth_user.id = run.user_id
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
  detail jsonb;
begin
  if not public.kca_is_coach() then
    raise exception 'not_authorized';
  end if;

  select jsonb_build_object(
    'run', to_jsonb(run),
    'client', jsonb_build_object(
      'user_id', run.user_id,
      'email', auth_user.email
    ),
    'responses', coalesce((
      select jsonb_agg(to_jsonb(response_row) order by response_row.created_at)
      from (
        select
          response.question_id,
          response.question_role,
          response.answer_value,
          response.answer_text,
          response.created_at
        from public.kca_responses response
        where response.run_id = run.id
      ) response_row
    ), '[]'::jsonb),
    'publication', (
      select to_jsonb(publication)
      from public.kca_big3_publications publication
      where publication.run_id = run.id
      limit 1
    )
  )
  into detail
  from public.kca_assessment_runs run
  join auth.users auth_user on auth_user.id = run.user_id
  where run.id = p_run_id;

  if detail is null then
    raise exception 'run_not_found';
  end if;

  return detail;
end;
$$;

grant execute on function public.kca_coach_dashboard_run_detail(uuid) to authenticated;

create or replace function public.kca_coach_publish_big3(
  p_run_id uuid,
  p_approved_big3 jsonb,
  p_coach_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  publication_row public.kca_big3_publications;
begin
  if not public.kca_is_coach() then
    raise exception 'not_authorized';
  end if;

  if p_approved_big3 is null or jsonb_typeof(p_approved_big3) <> 'array' then
    raise exception 'approved_big3_must_be_array';
  end if;

  if not exists (select 1 from public.kca_assessment_runs where id = p_run_id) then
    raise exception 'run_not_found';
  end if;

  insert into public.kca_big3_publications (
    run_id,
    coach_user_id,
    approved_big3,
    coach_reason,
    published_to_client
  ) values (
    p_run_id,
    auth.uid(),
    p_approved_big3,
    coalesce(nullif(trim(p_coach_reason), ''), 'Coach reviewed and approved inside the GodHealth KCA Coach Dashboard.'),
    true
  )
  on conflict (run_id)
  do update set
    coach_user_id = excluded.coach_user_id,
    approved_big3 = excluded.approved_big3,
    coach_reason = excluded.coach_reason,
    published_to_client = true,
    created_at = now()
  returning * into publication_row;

  update public.kca_assessment_runs
  set status = 'published'
  where id = p_run_id;

  insert into public.kca_audit_events (
    run_id,
    user_id,
    event_type,
    metadata
  ) values (
    p_run_id,
    auth.uid(),
    'coach_big3_published',
    jsonb_build_object('approved_count', jsonb_array_length(p_approved_big3))
  );

  return to_jsonb(publication_row);
end;
$$;

grant execute on function public.kca_coach_publish_big3(uuid, jsonb, text) to authenticated;
