-- GodHealth KCA — prioritize same-day coach standards everywhere
-- This does not rewrite client history.
-- It only makes the client app and coach dashboard read the newest canonical
-- coach-saved standard first when multiple active rows exist for the same day.

create or replace function public.kca_get_today_dashboard(p_local_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_date date := coalesce(p_local_date, current_date);
  v_week_start date := public.kca_execution_week_start(coalesce(p_local_date, current_date));
  v_week_end date := public.kca_execution_week_start(coalesce(p_local_date, current_date)) + 6;
  v_program_start date;
  v_program_week integer;
  v_program_day integer;
  v_summary jsonb;
  v_today_items jsonb;
  v_reflection jsonb;
  v_email text;
  v_name text;
  v_questions jsonb;
  v_daily_feel jsonb;
  v_weekly_progress jsonb;
  v_protocol_keys text[] := public.kca_protocol_keys();
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then
    raise exception 'premium_entitlement_required';
  end if;

  perform public.kca_seed_default_foundations(v_user_id);

  v_program_start := public.kca_client_program_start(v_user_id);
  v_program_week := greatest(1, floor((v_week_start - v_program_start)::numeric / 7)::int + 1);
  v_program_day := greatest(1, (v_date - v_week_start)::int + 1);
  v_summary := public.kca_refresh_weekly_execution_summary(v_user_id, v_week_start);
  v_questions := public.kca_weekly_reflection_questions(v_program_week);
  v_weekly_progress := public.kca_week_progress_for_client(v_user_id, v_week_start);

  select u.email, coalesce(nullif(u.raw_user_meta_data->>'first_name',''), split_part(u.email, '@', 1))
  into v_email, v_name
  from auth.users u
  where u.id = v_user_id;

  with ranked_today as (
    select
      p.*,
      coalesce(l.status, 'incomplete') as log_status,
      l.completed_at as log_completed_at,
      l.id as log_id,
      row_number() over (
        partition by p.foundation_key
        order by
          case when p.metadata->>'canonical_today_standard' = 'true' then 0 else 1 end,
          case
            when nullif(p.metadata->>'coach_revision','') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (p.metadata->>'coach_revision')::numeric
            else 0
          end desc,
          p.active_from desc,
          p.updated_at desc nulls last,
          p.created_at desc nulls last,
          p.id desc
      ) as rn
    from public.client_foundation_prescriptions p
    left join public.daily_foundation_logs l
      on l.prescription_id = p.id
      and l.client_user_id = v_user_id
      and l.log_date = v_date
    where p.client_user_id = v_user_id
      and p.foundation_key = any(v_protocol_keys)
      and v_date >= p.active_from
      and (p.active_until is null or v_date <= p.active_until)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'prescription_id', p.id,
      'foundation_key', p.foundation_key,
      'foundation_label', p.foundation_label,
      'foundation_description', coalesce(nullif(p.metadata->>'client_instruction',''), p.foundation_description),
      'target_label', p.target_label,
      'target_value', p.target_value,
      'target_unit', p.target_unit,
      'prescribed_days', p.prescribed_days,
      'allow_not_applicable', p.allow_not_applicable,
      'metadata', p.metadata,
      'status', p.log_status,
      'completed_at', p.log_completed_at,
      'saved', p.log_id is not null
    )
    order by coalesce((p.metadata->>'order')::int, 99), p.foundation_label
  ), '[]'::jsonb)
  into v_today_items
  from ranked_today p
  where p.rn = 1
    and p.is_prescribed = true
    and extract(isodow from v_date)::int = any(p.prescribed_days);

  select to_jsonb(f.*)
  into v_daily_feel
  from public.daily_feel_checkins f
  where f.client_user_id = v_user_id
    and f.local_date = v_date;

  select to_jsonb(r.*)
  into v_reflection
  from public.weekly_reflections r
  where r.client_user_id = v_user_id
    and r.program_week = v_program_week
    and r.week_start = v_week_start
  limit 1;

  return jsonb_build_object(
    'client', jsonb_build_object('user_id', v_user_id, 'email', v_email, 'first_name', v_name),
    'program', jsonb_build_object(
      'week', v_program_week,
      'day', v_program_day,
      'local_date', v_date,
      'week_start', v_week_start,
      'week_end', v_week_end
    ),
    'weekly_summary', v_summary,
    'weekly_progress', v_weekly_progress,
    'daily_feel', coalesce(v_daily_feel, '{}'::jsonb),
    'today_items', v_today_items,
    'weekly_reflection', v_reflection,
    'reflection_questions', v_questions
  );
end;
$$;

create or replace function public.kca_coach_execution_detail(
  p_client_user_id uuid,
  p_week_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_requested_date date := coalesce(p_week_start, current_date);
  v_week_start date := public.kca_execution_week_start(coalesce(p_week_start, current_date));
  v_week_end date := public.kca_execution_week_start(coalesce(p_week_start, current_date)) + 6;
  v_reference_date date;
  v_program_start date;
  v_program_week integer;
  v_summary jsonb;
  v_client jsonb;
  v_prescriptions jsonb;
  v_logs jsonb;
  v_reflection jsonb;
  v_weeks jsonb;
  v_week_progress jsonb;
  v_protocol_keys text[] := public.kca_protocol_keys();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_is_coach() or not public.kca_can_access_client(p_client_user_id) then
    raise exception 'not_authorized';
  end if;

  perform public.kca_seed_default_foundations(p_client_user_id);

  v_reference_date := case
    when current_date between v_week_start and v_week_end then current_date
    else v_requested_date
  end;

  v_program_start := public.kca_client_program_start(p_client_user_id);
  v_program_week := greatest(1, floor((v_week_start - v_program_start)::numeric / 7)::int + 1);
  v_summary := public.kca_refresh_weekly_execution_summary(p_client_user_id, v_week_start);
  v_week_progress := public.kca_week_progress_for_client(p_client_user_id, v_week_start);

  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'name', coalesce(nullif(i.intake->>'first_name',''), nullif(u.raw_user_meta_data->>'first_name',''), split_part(u.email, '@', 1))
  )
  into v_client
  from auth.users u
  left join lateral (
    select intake
    from public.kca_personal_intakes pi
    where pi.user_id = u.id
    order by pi.updated_at desc
    limit 1
  ) i on true
  where u.id = p_client_user_id;

  with ranked_prescriptions as (
    select
      p.*,
      row_number() over (
        partition by p.foundation_key
        order by
          case
            when v_reference_date >= p.active_from
              and (p.active_until is null or v_reference_date <= p.active_until) then 0
            else 1
          end,
          case when p.metadata->>'canonical_today_standard' = 'true' then 0 else 1 end,
          case
            when nullif(p.metadata->>'coach_revision','') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (p.metadata->>'coach_revision')::numeric
            else 0
          end desc,
          p.active_from desc,
          p.updated_at desc nulls last,
          p.created_at desc nulls last,
          p.id desc
      ) as rn
    from public.client_foundation_prescriptions p
    where p.client_user_id = p_client_user_id
      and p.foundation_key = any(v_protocol_keys)
      and p.active_from <= greatest(v_week_end, v_reference_date)
      and (p.active_until is null or p.active_until >= least(v_week_start, v_reference_date))
  )
  select coalesce(jsonb_agg(to_jsonb(p.*) order by coalesce((p.metadata->>'order')::int, 99), p.foundation_label), '[]'::jsonb)
  into v_prescriptions
  from ranked_prescriptions p
  where p.rn = 1;

  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.log_date, l.created_at), '[]'::jsonb)
  into v_logs
  from public.daily_foundation_logs l
  where l.client_user_id = p_client_user_id
    and l.log_date between v_week_start and v_week_end;

  select to_jsonb(r.*)
  into v_reflection
  from public.weekly_reflections r
  where r.client_user_id = p_client_user_id
    and r.program_week = v_program_week
    and r.week_start = v_week_start
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'program_week', s.program_week,
      'week_start', s.week_start,
      'week_end', s.week_end,
      'execution_percentage', s.execution_percentage,
      'execution_status', s.execution_status,
      'reflection_submitted', s.reflection_submitted
    )
    order by s.week_start desc
  ), '[]'::jsonb)
  into v_weeks
  from public.weekly_execution_summaries s
  where s.client_user_id = p_client_user_id;

  return jsonb_build_object(
    'client', v_client,
    'program', jsonb_build_object(
      'week', v_program_week,
      'week_start', v_week_start,
      'week_end', v_week_end,
      'reference_date', v_reference_date
    ),
    'weekly_summary', v_summary,
    'week_progress', v_week_progress,
    'prescriptions', v_prescriptions,
    'logs', v_logs,
    'weekly_reflection', v_reflection,
    'weeks', v_weeks
  );
end;
$$;

grant execute on function public.kca_get_today_dashboard(date) to authenticated;
grant execute on function public.kca_coach_execution_detail(uuid, date) to authenticated;
