-- GodHealth KCA v3 latest result repair.
-- The client result screen needs the submitted personal intake as part of the
-- latest-result payload, so participants can review the exact intake answers
-- they gave and coaches/client reports stay aligned.

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
  select to_jsonb(i) into v_intake from public.kca_personal_intakes i where i.run_id = v_run.id limit 1;
  select coalesce(jsonb_agg(to_jsonb(w) order by w.week_number), '[]'::jsonb) into v_weeks
  from public.kca_plan_weeks w join public.kca_plans p on p.id = w.plan_id where p.run_id = v_run.id;

  return jsonb_build_object(
    'ok', true,
    'run', to_jsonb(v_run),
    'intake', v_intake,
    'approved_plan', v_plan,
    'approved_weeks', v_weeks,
    'engine_run', (select to_jsonb(e) from public.kca_plan_engine_runs e where e.run_id = v_run.id limit 1)
  );
end;
$$;

grant execute on function public.kca_v3_my_latest() to authenticated;
