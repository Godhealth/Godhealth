-- GodHealth KCA coach dashboard visibility repair.
-- Any authenticated GodHealth coach should see submitted KCA assessments in the
-- coach dashboard, even if a coach-client assignment row is missing.

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
      'client_name', coalesce(intake.intake->>'client_name', run.context->>'client_name', auth_user.raw_user_meta_data->>'full_name'),
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
    left join public.kca_personal_intakes intake on intake.run_id = run.id
    left join public.kca_plan_engine_runs engine on engine.run_id = run.id
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
      'name', coalesce(intake.intake->>'client_name', run.context->>'client_name', auth_user.raw_user_meta_data->>'full_name')
    ),
    'definition', def.definition,
    'intake', to_jsonb(intake),
    'energy_profile', (select to_jsonb(e) from public.kca_energy_profiles e where e.run_id = run.id limit 1),
    'engine_run', (select to_jsonb(e) from public.kca_plan_engine_runs e where e.run_id = run.id limit 1),
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
  left join public.kca_personal_intakes intake on intake.run_id = run.id
  left join public.kca_assessment_definitions def on def.definition_version = run.definition_version
  where run.id = p_run_id;

  return v_detail;
end;
$$;

grant execute on function public.kca_coach_dashboard_run_detail(uuid) to authenticated;
