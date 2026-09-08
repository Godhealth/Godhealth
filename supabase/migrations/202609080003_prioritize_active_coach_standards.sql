-- GodHealth KCA — Prioritize active prescribed standards in the coach dashboard
-- Fixes a refresh issue where an old same-day inactive duplicate prescription
-- could be selected above the newly saved active standard.

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
  v_week_start date := public.kca_execution_week_start(coalesce(p_week_start, current_date));
  v_week_end date := public.kca_execution_week_start(coalesce(p_week_start, current_date)) + 6;
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
            when p.is_prescribed = true
              and current_date >= p.active_from
              and (p.active_until is null or current_date <= p.active_until) then 0
            when p.is_prescribed = true then 1
            when current_date >= p.active_from
              and (p.active_until is null or current_date <= p.active_until) then 2
            else 3
          end,
          p.active_from desc,
          p.updated_at desc,
          p.created_at desc,
          p.id desc
      ) as rn
    from public.client_foundation_prescriptions p
    where p.client_user_id = p_client_user_id
      and p.foundation_key = any(v_protocol_keys)
      and p.active_from <= v_week_end
      and (p.active_until is null or p.active_until >= v_week_start)
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
      'week_end', v_week_end
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

grant execute on function public.kca_coach_execution_detail(uuid, date) to authenticated;
