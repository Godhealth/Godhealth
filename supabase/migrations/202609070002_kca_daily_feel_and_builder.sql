-- GodHealth KCA — Daily Feel + Coach Check-In Builder Refinement
-- Keeps the Daily Seven taxonomy fixed, adds optional FASTING, and separates
-- assessment/reporting from the client execution app.

create table if not exists public.daily_feel_checkins (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  morning_readiness integer check (morning_readiness between 1 and 10),
  daytime_energy integer check (daytime_energy between 1 and 10),
  mental_clarity integer check (mental_clarity between 1 and 10),
  inner_calm integer check (inner_calm between 1 and 10),
  sleep_ease integer check (sleep_ease between 1 and 10),
  daily_feel_score numeric(4,2) generated always as (
    round((
      coalesce(morning_readiness, 0) +
      coalesce(daytime_energy, 0) +
      coalesce(mental_clarity, 0) +
      coalesce(inner_calm, 0) +
      coalesce(sleep_ease, 0)
    )::numeric / nullif(
      (case when morning_readiness is null then 0 else 1 end) +
      (case when daytime_energy is null then 0 else 1 end) +
      (case when mental_clarity is null then 0 else 1 end) +
      (case when inner_calm is null then 0 else 1 end) +
      (case when sleep_ease is null then 0 else 1 end),
      0
    ), 2)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_user_id, local_date)
);

create index if not exists daily_feel_checkins_client_date_idx
on public.daily_feel_checkins (client_user_id, local_date);

drop trigger if exists daily_feel_checkins_touch_updated_at on public.daily_feel_checkins;
create trigger daily_feel_checkins_touch_updated_at
before update on public.daily_feel_checkins
for each row execute function public.kca_touch_updated_at();

alter table public.daily_feel_checkins enable row level security;

drop policy if exists daily_feel_checkins_client_select on public.daily_feel_checkins;
create policy daily_feel_checkins_client_select
on public.daily_feel_checkins
for select
to authenticated
using (client_user_id = auth.uid() or public.kca_can_access_client(client_user_id));

drop policy if exists daily_feel_checkins_client_insert on public.daily_feel_checkins;
create policy daily_feel_checkins_client_insert
on public.daily_feel_checkins
for insert
to authenticated
with check (client_user_id = auth.uid());

drop policy if exists daily_feel_checkins_client_update on public.daily_feel_checkins;
create policy daily_feel_checkins_client_update
on public.daily_feel_checkins
for update
to authenticated
using (client_user_id = auth.uid())
with check (client_user_id = auth.uid());

create or replace function public.kca_protocol_keys()
returns text[]
language sql
immutable
as $$
  select array['seek','hydrate','eat','move','recover','renew','serve','fasting']::text[];
$$;

create or replace function public.kca_protocol_defaults()
returns jsonb
language sql
stable
as $$
  select public.kca_daily_seven_defaults() || '[
    {
      "foundation_key":"fasting",
      "foundation_label":"FASTING",
      "foundation_description":"Follow only the fasting protocol your coach has prescribed for today. This is optional and personalized.",
      "target_label":"Only when prescribed",
      "prescribed_days":[],
      "is_prescribed":false,
      "allow_not_applicable":true,
      "metadata":{"system":"coach_protocol","order":8,"tab":"food","theme":"body","is_required":false,"client_instruction":"Do not fast aggressively. Follow Robin’s personalized instruction only."}
    }
  ]'::jsonb;
$$;

create or replace function public.kca_foundation_defaults()
returns jsonb
language sql
stable
as $$
  select public.kca_protocol_defaults();
$$;

create or replace function public.kca_seed_default_foundations(p_client_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := coalesce(p_client_user_id, auth.uid());
  v_start date;
  v_item jsonb;
  v_daily_keys text[] := public.kca_daily_seven_keys();
  v_protocol_keys text[] := public.kca_protocol_keys();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_can_access_client(v_user_id) then
    raise exception 'not_authorized';
  end if;

  if auth.uid() = v_user_id and not public.kca_has_active_entitlement(v_user_id, '3.0.0') then
    raise exception 'premium_entitlement_required';
  end if;

  v_start := greatest(public.kca_client_program_start(v_user_id), current_date);

  update public.client_foundation_prescriptions p
  set active_until = case when p.active_from < v_start then v_start - 1 else p.active_from end,
      updated_at = now(),
      metadata = p.metadata || jsonb_build_object('superseded_by','daily_seven','superseded_at',now())
  where p.client_user_id = v_user_id
    and p.active_until is null
    and not (p.foundation_key = any(v_protocol_keys));

  for v_item in select * from jsonb_array_elements(public.kca_protocol_defaults())
  loop
    if not exists (
      select 1
      from public.client_foundation_prescriptions p
      where p.client_user_id = v_user_id
        and p.foundation_key = v_item->>'foundation_key'
        and p.active_until is null
    ) then
      insert into public.client_foundation_prescriptions (
        client_user_id,
        foundation_key,
        foundation_label,
        foundation_description,
        target_label,
        prescribed_days,
        is_prescribed,
        allow_not_applicable,
        active_from,
        created_by,
        metadata
      )
      values (
        v_user_id,
        v_item->>'foundation_key',
        v_item->>'foundation_label',
        coalesce(v_item->>'foundation_description', ''),
        coalesce(v_item->>'target_label', ''),
        array(select jsonb_array_elements_text(coalesce(v_item->'prescribed_days','[]'::jsonb))::int),
        coalesce((v_item->>'is_prescribed')::boolean, true),
        coalesce((v_item->>'allow_not_applicable')::boolean, false),
        v_start,
        auth.uid(),
        coalesce(v_item->'metadata', '{}'::jsonb) || jsonb_build_object('source','protocol_seed','seeded_at',now())
      );
    end if;
  end loop;

  insert into public.kca_audit_events (user_id, event_type, metadata)
  values (
    auth.uid(),
    'daily_seven_protocols_seeded',
    jsonb_build_object('client_user_id', v_user_id, 'active_from', v_start)
  );

  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by coalesce((p.metadata->>'order')::int, 99), p.foundation_label), '[]'::jsonb)
    from public.client_foundation_prescriptions p
    where p.client_user_id = v_user_id
      and p.foundation_key = any(v_protocol_keys)
      and p.active_until is null
  );
end;
$$;

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

  with opportunities as (
    select
      p.id as prescription_id,
      p.foundation_key,
      p.foundation_label,
      p.target_label,
      coalesce((p.metadata->>'order')::int, 99) as foundation_order,
      d::date as log_date,
      coalesce(l.status, 'incomplete') as status
    from public.client_foundation_prescriptions p
    join generate_series(v_week_start, v_count_until, interval '1 day') d on true
    left join public.daily_foundation_logs l
      on l.prescription_id = p.id
      and l.client_user_id = p.client_user_id
      and l.log_date = d::date
    where p.client_user_id = p_client_user_id
      and p.foundation_key = any(v_protocol_keys)
      and p.is_prescribed = true
      and d::date >= p.active_from
      and (p.active_until is null or d::date <= p.active_until)
      and extract(isodow from d)::int = any(p.prescribed_days)
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

create or replace function public.kca_week_progress_for_client(
  p_client_user_id uuid default auth.uid(),
  p_week_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := coalesce(p_client_user_id, auth.uid());
  v_week_start date := public.kca_execution_week_start(coalesce(p_week_start, current_date));
  v_week_end date := public.kca_execution_week_start(coalesce(p_week_start, current_date)) + 6;
  v_summary jsonb;
  v_days jsonb;
  v_average_feel numeric(4,2);
  v_breakdown jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_can_access_client(v_user_id) then
    raise exception 'not_authorized';
  end if;

  v_summary := public.kca_refresh_weekly_execution_summary(v_user_id, v_week_start);

  with dates as (
    select (v_week_start + day_offset)::date as local_date, day_offset
    from generate_series(0, 6) as day_offset
  ),
  heat as (
    select
      item->>'date' as date_text,
      (item->>'completed')::int as completed,
      (item->>'total')::int as total,
      (item->>'percentage')::numeric as percentage
    from jsonb_array_elements(coalesce(v_summary->'heatmap', '[]'::jsonb)) item
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', d.local_date,
      'weekday', trim(to_char(d.local_date, 'Dy')),
      'is_future', d.local_date > current_date,
      'completed', coalesce(h.completed, 0),
      'total', coalesce(h.total, 0),
      'execution_percentage', case
        when d.local_date > current_date then null
        else coalesce(h.percentage, 0)
      end,
      'feel_average', f.daily_feel_score,
      'feel_completed', f.daily_feel_score is not null
    )
    order by d.local_date
  ), '[]'::jsonb)
  into v_days
  from dates d
  left join heat h on h.date_text::date = d.local_date
  left join public.daily_feel_checkins f
    on f.client_user_id = v_user_id
    and f.local_date = d.local_date;

  select round(avg(daily_feel_score), 2)
  into v_average_feel
  from public.daily_feel_checkins
  where client_user_id = v_user_id
    and local_date between v_week_start and least(v_week_end, current_date)
    and daily_feel_score is not null;

  select jsonb_build_object(
    'morning_readiness', round(avg(morning_readiness), 2),
    'daytime_energy', round(avg(daytime_energy), 2),
    'mental_clarity', round(avg(mental_clarity), 2),
    'inner_calm', round(avg(inner_calm), 2),
    'sleep_ease', round(avg(sleep_ease), 2)
  )
  into v_breakdown
  from public.daily_feel_checkins
  where client_user_id = v_user_id
    and local_date between v_week_start and least(v_week_end, current_date);

  return jsonb_build_object(
    'week_start', v_week_start,
    'week_end', v_week_end,
    'average_feel', v_average_feel,
    'feel_breakdown', v_breakdown,
    'days', v_days
  );
end;
$$;

create or replace function public.kca_upsert_daily_feel_checkin(
  p_local_date date,
  p_morning_readiness integer default null,
  p_daytime_energy integer default null,
  p_mental_clarity integer default null,
  p_inner_calm integer default null,
  p_sleep_ease integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_date date := coalesce(p_local_date, current_date);
  v_checkin jsonb;
  v_progress jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then
    raise exception 'premium_entitlement_required';
  end if;

  insert into public.daily_feel_checkins (
    client_user_id,
    local_date,
    morning_readiness,
    daytime_energy,
    mental_clarity,
    inner_calm,
    sleep_ease
  )
  values (
    v_user_id,
    v_date,
    p_morning_readiness,
    p_daytime_energy,
    p_mental_clarity,
    p_inner_calm,
    p_sleep_ease
  )
  on conflict (client_user_id, local_date)
  do update set
    morning_readiness = excluded.morning_readiness,
    daytime_energy = excluded.daytime_energy,
    mental_clarity = excluded.mental_clarity,
    inner_calm = excluded.inner_calm,
    sleep_ease = excluded.sleep_ease,
    updated_at = now()
  returning to_jsonb(daily_feel_checkins.*) into v_checkin;

  v_progress := public.kca_week_progress_for_client(v_user_id, public.kca_execution_week_start(v_date));

  return jsonb_build_object(
    'daily_feel', v_checkin,
    'weekly_progress', v_progress
  );
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
      'status', coalesce(l.status, 'incomplete'),
      'completed_at', l.completed_at,
      'saved', l.id is not null
    )
    order by coalesce((p.metadata->>'order')::int, 99), p.foundation_label
  ), '[]'::jsonb)
  into v_today_items
  from public.client_foundation_prescriptions p
  left join public.daily_foundation_logs l
    on l.prescription_id = p.id
    and l.client_user_id = v_user_id
    and l.log_date = v_date
  where p.client_user_id = v_user_id
    and p.foundation_key = any(v_protocol_keys)
    and p.is_prescribed = true
    and v_date >= p.active_from
    and (p.active_until is null or v_date <= p.active_until)
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

create or replace function public.kca_coach_execution_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_week_start date := public.kca_execution_week_start(current_date);
  v_week_end date := public.kca_execution_week_start(current_date) + 6;
  v_clients jsonb;
  v_client_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_is_coach() then
    raise exception 'not_authorized';
  end if;

  for v_client_id in
    select distinct user_id
    from (
      select r.user_id
      from public.kca_assessment_runs r
      where r.definition_version = '3.0.0'
        and r.status in ('submitted','coach_reviewed','published')
        and public.kca_can_access_client(r.user_id)
      union
      select e.user_id
      from public.kca_client_entitlements e
      where e.status = 'active'
        and public.kca_can_access_client(e.user_id)
    ) c
  loop
    perform public.kca_refresh_weekly_execution_summary(v_client_id, v_week_start);
  end loop;

  with clients as (
    select distinct r.user_id
    from public.kca_assessment_runs r
    where r.definition_version = '3.0.0'
      and r.status in ('submitted','coach_reviewed','published')
      and public.kca_can_access_client(r.user_id)
    union
    select distinct e.user_id
    from public.kca_client_entitlements e
    where e.status = 'active'
      and public.kca_can_access_client(e.user_id)
  ),
  latest_run as (
    select distinct on (r.user_id)
      r.user_id,
      r.id as latest_run_id,
      r.submitted_at,
      r.score_snapshot
    from public.kca_assessment_runs r
    join clients c on c.user_id = r.user_id
    where r.definition_version = '3.0.0'
    order by r.user_id, r.submitted_at desc nulls last, r.created_at desc
  ),
  latest_intake as (
    select distinct on (i.user_id)
      i.user_id,
      i.intake
    from public.kca_personal_intakes i
    join clients c on c.user_id = i.user_id
    order by i.user_id, i.updated_at desc
  ),
  summaries as (
    select s.*
    from public.weekly_execution_summaries s
    join clients c on c.user_id = s.client_user_id
    where s.week_start = v_week_start
  ),
  feel as (
    select
      client_user_id,
      round(avg(daily_feel_score), 2) as average_feel
    from public.daily_feel_checkins
    where local_date between v_week_start and least(v_week_end, current_date)
      and daily_feel_score is not null
    group by client_user_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'client_user_id', c.user_id,
      'email', u.email,
      'name', coalesce(nullif(li.intake->>'first_name',''), nullif(u.raw_user_meta_data->>'first_name',''), split_part(u.email, '@', 1)),
      'latest_run_id', lr.latest_run_id,
      'latest_submitted_at', lr.submitted_at,
      'current_week', greatest(1, floor((v_week_start - public.kca_client_program_start(c.user_id))::numeric / 7)::int + 1),
      'weekly_summary', to_jsonb(s.*),
      'execution_percentage', coalesce(s.execution_percentage, 0),
      'execution_status', coalesce(s.execution_status, 'Not Started'),
      'average_feel', f.average_feel,
      'reflection_submitted', coalesce(s.reflection_submitted, false),
      'needs_attention', coalesce(s.execution_status, 'Not Started') in ('Needs Attention','Not Started') or coalesce(f.average_feel, 10) < 5.5
    )
    order by
      case when coalesce(s.execution_status, 'Not Started') in ('Needs Attention','Not Started') or coalesce(f.average_feel, 10) < 5.5 then 0 else 1 end,
      coalesce(s.execution_percentage, 0),
      coalesce(f.average_feel, 10),
      coalesce(lr.submitted_at, '1900-01-01'::timestamptz) desc
  ), '[]'::jsonb)
  into v_clients
  from clients c
  join auth.users u on u.id = c.user_id
  left join latest_run lr on lr.user_id = c.user_id
  left join latest_intake li on li.user_id = c.user_id
  left join summaries s on s.client_user_id = c.user_id
  left join feel f on f.client_user_id = c.user_id;

  return jsonb_build_object(
    'week_start', v_week_start,
    'week_end', v_week_start + 6,
    'clients', v_clients
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

  select coalesce(jsonb_agg(to_jsonb(p.*) order by coalesce((p.metadata->>'order')::int, 99), p.foundation_label), '[]'::jsonb)
  into v_prescriptions
  from public.client_foundation_prescriptions p
  where p.client_user_id = p_client_user_id
    and p.foundation_key = any(v_protocol_keys)
    and p.active_from <= v_week_end
    and (p.active_until is null or p.active_until >= v_week_start);

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

create or replace function public.kca_coach_save_foundation_prescriptions(
  p_client_user_id uuid,
  p_effective_from date,
  p_prescriptions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_default_effective_from date := coalesce(p_effective_from, current_date);
  v_item jsonb;
  v_key text;
  v_label text;
  v_active_from date;
  v_active_until date;
  v_target_value numeric;
  v_program_week integer;
  v_days integer[];
  v_inserted integer := 0;
  v_protocol_keys text[] := public.kca_protocol_keys();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_is_coach() or not public.kca_can_access_client(p_client_user_id) then
    raise exception 'not_authorized';
  end if;

  if jsonb_typeof(coalesce(p_prescriptions, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_prescriptions_payload';
  end if;

  for v_item in select * from jsonb_array_elements(p_prescriptions)
  loop
    v_key := lower(nullif(trim(coalesce(v_item->>'foundation_key', '')), ''));
    if v_key is null or not v_key = any(v_protocol_keys) then
      continue;
    end if;

    v_label := case v_key
      when 'seek' then 'SEEK'
      when 'hydrate' then 'HYDRATE'
      when 'eat' then 'EAT'
      when 'move' then 'MOVE'
      when 'recover' then 'RECOVER'
      when 'renew' then 'RENEW'
      when 'serve' then 'SERVE'
      when 'fasting' then 'FASTING'
      else upper(v_key)
    end;

    v_active_from := coalesce(nullif(v_item->>'active_from', '')::date, v_default_effective_from);
    v_active_until := nullif(v_item->>'active_until', '')::date;
    v_target_value := case
      when nullif(trim(coalesce(v_item->>'target_value', '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then nullif(trim(v_item->>'target_value'), '')::numeric
      else null
    end;
    v_program_week := case
      when nullif(trim(coalesce(v_item->>'program_week', '')), '') ~ '^[0-9]+$'
        then nullif(trim(v_item->>'program_week'), '')::integer
      else null
    end;

    select coalesce(array_agg(day_value), array[]::integer[])
    into v_days
    from (
      select jsonb_array_elements_text(coalesce(v_item->'prescribed_days','[]'::jsonb))::int as day_value
    ) d
    where day_value between 1 and 7;

    if v_active_until is not null and v_active_until < v_active_from then
      v_active_until := null;
    end if;

    update public.client_foundation_prescriptions
    set active_until = v_active_from - 1,
        updated_at = now()
    where client_user_id = p_client_user_id
      and foundation_key = v_key
      and (active_until is null or active_until >= v_active_from)
      and active_from < v_active_from;

    delete from public.client_foundation_prescriptions
    where client_user_id = p_client_user_id
      and foundation_key = v_key
      and active_from = v_active_from
      and not exists (
        select 1 from public.daily_foundation_logs l
        where l.prescription_id = client_foundation_prescriptions.id
      );

    insert into public.client_foundation_prescriptions (
      client_user_id,
      foundation_key,
      foundation_label,
      foundation_description,
      target_label,
      target_value,
      target_unit,
      prescribed_days,
      is_prescribed,
      allow_not_applicable,
      program_week,
      active_from,
      active_until,
      created_by,
      metadata
    )
    values (
      p_client_user_id,
      v_key,
      v_label,
      coalesce(v_item->>'foundation_description', ''),
      coalesce(v_item->>'target_label', ''),
      v_target_value,
      nullif(trim(coalesce(v_item->>'target_unit', '')), ''),
      v_days,
      coalesce((v_item->>'is_prescribed')::boolean, true),
      coalesce((v_item->>'allow_not_applicable')::boolean, false),
      v_program_week,
      v_active_from,
      v_active_until,
      auth.uid(),
      coalesce(v_item->'metadata', '{}'::jsonb) || jsonb_build_object(
        'source','coach_builder_update',
        'updated_by',auth.uid(),
        'updated_at',now()
      )
    );

    v_inserted := v_inserted + 1;
  end loop;

  insert into public.kca_audit_events (user_id, event_type, metadata)
  values (
    auth.uid(),
    'coach_saved_checkin_builder',
    jsonb_build_object('client_user_id', p_client_user_id, 'effective_from', v_default_effective_from, 'count', v_inserted)
  );

  return public.kca_coach_execution_detail(p_client_user_id, v_default_effective_from);
end;
$$;

grant select, insert, update on public.daily_feel_checkins to authenticated;
grant execute on function public.kca_protocol_keys() to authenticated;
grant execute on function public.kca_protocol_defaults() to authenticated;
grant execute on function public.kca_foundation_defaults() to authenticated;
grant execute on function public.kca_seed_default_foundations(uuid) to authenticated;
grant execute on function public.kca_refresh_weekly_execution_summary(uuid, date) to authenticated;
grant execute on function public.kca_get_today_dashboard(date) to authenticated;
grant execute on function public.kca_week_progress_for_client(uuid, date) to authenticated;
grant execute on function public.kca_upsert_daily_feel_checkin(date, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.kca_coach_execution_overview() to authenticated;
grant execute on function public.kca_coach_execution_detail(uuid, date) to authenticated;
grant execute on function public.kca_coach_save_foundation_prescriptions(uuid, date, jsonb) to authenticated;
