-- GodHealth KCA — Canonical "today" Daily Seven reads
-- The coach can change standards for today. Therefore every read path must
-- first select the newest standard for the date/foundation, even when that
-- newest standard is switched off or not prescribed for that weekday.
-- Only after selecting the canonical row do we decide whether it appears to
-- the client or counts in weekly execution.

create or replace function public.kca_refresh_weekly_execution_summary(
  p_client_user_id uuid,
  p_week_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_week_start date := public.kca_execution_week_start(coalesce(p_week_start, current_date));
  v_week_end date := public.kca_execution_week_start(coalesce(p_week_start, current_date)) + 6;
  v_count_until date;
  v_program_start date;
  v_program_week integer;
  v_completed integer := 0;
  v_total integer := 0;
  v_percentage numeric(5,2) := 0;
  v_status text := 'Not Started';
  v_breakdown jsonb := '[]'::jsonb;
  v_heatmap jsonb := '[]'::jsonb;
  v_reflection_submitted boolean := false;
  v_summary jsonb;
  v_protocol_keys text[] := public.kca_protocol_keys();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_can_access_client(p_client_user_id) then
    raise exception 'not_authorized';
  end if;

  perform public.kca_seed_default_foundations(p_client_user_id);

  v_count_until := least(v_week_end, current_date);
  v_program_start := public.kca_client_program_start(p_client_user_id);
  v_program_week := greatest(1, floor((v_week_start - v_program_start)::numeric / 7)::int + 1);

  with raw_candidates as (
    select
      p.id as prescription_id,
      p.foundation_key,
      p.foundation_label,
      p.target_label,
      p.is_prescribed,
      p.prescribed_days,
      coalesce((p.metadata->>'order')::int, 99) as foundation_order,
      d::date as log_date,
      coalesce(l.status, 'incomplete') as status,
      row_number() over (
        partition by p.foundation_key, d::date
        order by p.active_from desc, p.updated_at desc, p.created_at desc, p.id desc
      ) as rn
    from public.client_foundation_prescriptions p
    join generate_series(v_week_start, v_count_until, interval '1 day') d on true
    left join public.daily_foundation_logs l
      on l.prescription_id = p.id
      and l.client_user_id = p.client_user_id
      and l.log_date = d::date
    where p.client_user_id = p_client_user_id
      and p.foundation_key = any(v_protocol_keys)
      and d::date >= p.active_from
      and (p.active_until is null or d::date <= p.active_until)
  ),
  opportunities as (
    select *
    from raw_candidates
    where rn = 1
      and is_prescribed = true
      and extract(isodow from log_date)::int = any(prescribed_days)
  ),
  totals as (
    select
      count(*) filter (where status <> 'not_applicable')::int as total_count,
      count(*) filter (where status = 'complete')::int as complete_count
    from opportunities
  ),
  breakdown as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'foundation_key', foundation_key,
        'foundation_label', foundation_label,
        'label', foundation_label,
        'target_label', max_target_label,
        'completed', completed,
        'total', total,
        'percentage', case when total > 0 then round((completed::numeric / total::numeric) * 100, 2) else 0 end
      )
      order by foundation_order, foundation_label
    ), '[]'::jsonb) as items
    from (
      select
        foundation_key,
        foundation_label,
        min(target_label) as max_target_label,
        min(foundation_order) as foundation_order,
        count(*) filter (where status <> 'not_applicable')::int as total,
        count(*) filter (where status = 'complete')::int as completed
      from opportunities
      group by foundation_key, foundation_label
    ) b
  ),
  heat as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'date', log_date,
        'weekday', trim(to_char(log_date, 'Dy')),
        'completed', completed,
        'total', total,
        'percentage', case when total > 0 then round((completed::numeric / total::numeric) * 100, 2) else 0 end
      )
      order by log_date
    ), '[]'::jsonb) as items
    from (
      select
        log_date,
        count(*) filter (where status <> 'not_applicable')::int as total,
        count(*) filter (where status = 'complete')::int as completed
      from opportunities
      group by log_date
    ) h
  )
  select
    coalesce(t.complete_count, 0),
    coalesce(t.total_count, 0),
    coalesce(b.items, '[]'::jsonb),
    coalesce(h.items, '[]'::jsonb)
  into v_completed, v_total, v_breakdown, v_heatmap
  from totals t
  cross join breakdown b
  cross join heat h;

  if v_total > 0 then
    v_percentage := round((v_completed::numeric / v_total::numeric) * 100, 2);
  end if;
  v_status := public.kca_execution_status(v_percentage, v_total);

  select exists (
    select 1 from public.weekly_reflections r
    where r.client_user_id = p_client_user_id
      and r.program_week = v_program_week
      and r.week_start = v_week_start
  ) into v_reflection_submitted;

  insert into public.weekly_execution_summaries (
    client_user_id,
    program_week,
    week_start,
    week_end,
    completed_opportunities,
    total_opportunities,
    execution_percentage,
    execution_status,
    reflection_submitted,
    foundation_breakdown,
    heatmap,
    calculated_at
  )
  values (
    p_client_user_id,
    v_program_week,
    v_week_start,
    v_week_end,
    v_completed,
    v_total,
    v_percentage,
    v_status,
    v_reflection_submitted,
    v_breakdown,
    v_heatmap,
    now()
  )
  on conflict (client_user_id, program_week, week_start)
  do update set
    week_end = excluded.week_end,
    completed_opportunities = excluded.completed_opportunities,
    total_opportunities = excluded.total_opportunities,
    execution_percentage = excluded.execution_percentage,
    execution_status = excluded.execution_status,
    reflection_submitted = excluded.reflection_submitted,
    foundation_breakdown = excluded.foundation_breakdown,
    heatmap = excluded.heatmap,
    calculated_at = now(),
    updated_at = now()
  returning to_jsonb(weekly_execution_summaries.*) into v_summary;

  return v_summary;
end;
$$;

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
        order by p.active_from desc, p.updated_at desc, p.created_at desc, p.id desc
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
          p.active_from desc,
          p.updated_at desc,
          p.created_at desc,
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

grant execute on function public.kca_refresh_weekly_execution_summary(uuid, date) to authenticated;
grant execute on function public.kca_get_today_dashboard(date) to authenticated;
grant execute on function public.kca_coach_execution_detail(uuid, date) to authenticated;
