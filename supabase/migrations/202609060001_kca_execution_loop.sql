-- GodHealth KCA Daily + Weekly Coaching Execution Loop
-- Extends the current KCA V3 architecture without changing assessment scoring.

create extension if not exists pgcrypto;

create table if not exists public.client_foundation_prescriptions (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  foundation_key text not null,
  foundation_label text not null,
  foundation_description text not null default '',
  target_label text not null default '',
  target_value numeric,
  target_unit text,
  prescribed_days integer[] not null default array[1,2,3,4,5,6,7],
  is_prescribed boolean not null default true,
  allow_not_applicable boolean not null default false,
  program_week integer,
  active_from date not null default current_date,
  active_until date,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_foundation_prescriptions_dates_check check (active_until is null or active_until >= active_from),
  constraint client_foundation_prescriptions_days_check check (prescribed_days <@ array[1,2,3,4,5,6,7])
);

create table if not exists public.daily_foundation_logs (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  prescription_id uuid not null references public.client_foundation_prescriptions(id) on delete cascade,
  log_date date not null,
  status text not null default 'incomplete' check (status in ('complete','incomplete','not_applicable')),
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_user_id, prescription_id, log_date)
);

create table if not exists public.weekly_reflections (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  program_week integer not null check (program_week > 0),
  week_start date not null,
  week_end date not null,
  question_version text not null default 'foundation_reflection_v1',
  body_question text not null default 'Where did your body feel supported or challenged this week?',
  body_answer text not null default '',
  soul_question text not null default 'What pattern in your thoughts, emotions or discipline did you notice this week?',
  soul_answer text not null default '',
  spirit_question text not null default 'Where did you sense God inviting you into deeper surrender this week?',
  spirit_answer text not null default '',
  coach_note_from_client text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_user_id, program_week, week_start)
);

create table if not exists public.weekly_execution_summaries (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  program_week integer not null check (program_week > 0),
  week_start date not null,
  week_end date not null,
  completed_opportunities integer not null default 0,
  total_opportunities integer not null default 0,
  execution_percentage numeric(5,2) not null default 0,
  execution_status text not null default 'Not Started',
  reflection_submitted boolean not null default false,
  foundation_breakdown jsonb not null default '[]'::jsonb,
  heatmap jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_user_id, program_week, week_start)
);

create index if not exists client_foundation_prescriptions_client_idx
on public.client_foundation_prescriptions (client_user_id, active_from, active_until);

create index if not exists daily_foundation_logs_client_date_idx
on public.daily_foundation_logs (client_user_id, log_date);

create index if not exists weekly_reflections_client_week_idx
on public.weekly_reflections (client_user_id, week_start);

create index if not exists weekly_execution_summaries_client_week_idx
on public.weekly_execution_summaries (client_user_id, week_start);

drop trigger if exists client_foundation_prescriptions_touch_updated_at on public.client_foundation_prescriptions;
create trigger client_foundation_prescriptions_touch_updated_at
before update on public.client_foundation_prescriptions
for each row execute function public.kca_touch_updated_at();

drop trigger if exists daily_foundation_logs_touch_updated_at on public.daily_foundation_logs;
create trigger daily_foundation_logs_touch_updated_at
before update on public.daily_foundation_logs
for each row execute function public.kca_touch_updated_at();

drop trigger if exists weekly_reflections_touch_updated_at on public.weekly_reflections;
create trigger weekly_reflections_touch_updated_at
before update on public.weekly_reflections
for each row execute function public.kca_touch_updated_at();

drop trigger if exists weekly_execution_summaries_touch_updated_at on public.weekly_execution_summaries;
create trigger weekly_execution_summaries_touch_updated_at
before update on public.weekly_execution_summaries
for each row execute function public.kca_touch_updated_at();

alter table public.client_foundation_prescriptions enable row level security;
alter table public.daily_foundation_logs enable row level security;
alter table public.weekly_reflections enable row level security;
alter table public.weekly_execution_summaries enable row level security;

drop policy if exists "Clients and coaches can read foundation prescriptions" on public.client_foundation_prescriptions;
create policy "Clients and coaches can read foundation prescriptions"
on public.client_foundation_prescriptions
for select to authenticated
using (public.kca_can_access_client(client_user_id));

drop policy if exists "Coaches can create foundation prescriptions" on public.client_foundation_prescriptions;
create policy "Coaches can create foundation prescriptions"
on public.client_foundation_prescriptions
for insert to authenticated
with check (public.kca_is_coach() and public.kca_can_access_client(client_user_id));

drop policy if exists "Coaches can update foundation prescriptions" on public.client_foundation_prescriptions;
create policy "Coaches can update foundation prescriptions"
on public.client_foundation_prescriptions
for update to authenticated
using (public.kca_is_coach() and public.kca_can_access_client(client_user_id))
with check (public.kca_is_coach() and public.kca_can_access_client(client_user_id));

drop policy if exists "Clients and coaches can read daily logs" on public.daily_foundation_logs;
create policy "Clients and coaches can read daily logs"
on public.daily_foundation_logs
for select to authenticated
using (public.kca_can_access_client(client_user_id));

drop policy if exists "Clients can create own daily logs" on public.daily_foundation_logs;
create policy "Clients can create own daily logs"
on public.daily_foundation_logs
for insert to authenticated
with check (client_user_id = auth.uid());

drop policy if exists "Clients can update own daily logs" on public.daily_foundation_logs;
create policy "Clients can update own daily logs"
on public.daily_foundation_logs
for update to authenticated
using (client_user_id = auth.uid())
with check (client_user_id = auth.uid());

drop policy if exists "Clients and coaches can read weekly reflections" on public.weekly_reflections;
create policy "Clients and coaches can read weekly reflections"
on public.weekly_reflections
for select to authenticated
using (public.kca_can_access_client(client_user_id));

drop policy if exists "Clients can create own weekly reflections" on public.weekly_reflections;
create policy "Clients can create own weekly reflections"
on public.weekly_reflections
for insert to authenticated
with check (client_user_id = auth.uid());

drop policy if exists "Clients can update own weekly reflections" on public.weekly_reflections;
create policy "Clients can update own weekly reflections"
on public.weekly_reflections
for update to authenticated
using (client_user_id = auth.uid())
with check (client_user_id = auth.uid());

drop policy if exists "Clients and coaches can read weekly summaries" on public.weekly_execution_summaries;
create policy "Clients and coaches can read weekly summaries"
on public.weekly_execution_summaries
for select to authenticated
using (public.kca_can_access_client(client_user_id));

create or replace function public.kca_execution_week_start(p_date date default current_date)
returns date
language sql
stable
as $$
  select (p_date - ((extract(isodow from p_date)::int - 1) * interval '1 day'))::date;
$$;

create or replace function public.kca_execution_status(p_percentage numeric, p_total integer)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_total, 0) <= 0 then 'Not Started'
    when coalesce(p_percentage, 0) >= 85 then 'Strong Execution'
    when coalesce(p_percentage, 0) >= 70 then 'Building'
    else 'Needs Attention'
  end;
$$;

create or replace function public.kca_foundation_defaults()
returns jsonb
language sql
stable
as $$
  select '[
    {
      "foundation_key":"quiet_time",
      "foundation_label":"Quiet Time & Gratitude",
      "foundation_description":"Begin with Scripture, prayer or gratitude before the day pulls your attention.",
      "target_label":"10 minutes before your phone",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"hydration",
      "foundation_label":"Hydration",
      "foundation_description":"Support your body with steady fluids and a simple water rhythm.",
      "target_label":"Water with your first meal + steady intake",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"nutrition",
      "foundation_label":"GodHealth Nutrition",
      "foundation_description":"Choose a real-food anchor meal that supports energy, discipline and stewardship.",
      "target_label":"One real-food meal with protein and plants",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"meal_timing",
      "foundation_label":"Meal Timing",
      "foundation_description":"Reduce chaotic grazing and build a calm eating rhythm.",
      "target_label":"Follow your personal eating window",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"daily_movement",
      "foundation_label":"Daily Movement",
      "foundation_description":"Move your body before the day becomes crowded.",
      "target_label":"10-minute walk or simple movement",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"break_sitting",
      "foundation_label":"Break Up Sitting",
      "foundation_description":"Interrupt long sitting blocks with short movement.",
      "target_label":"2–3 minutes after long sitting",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"strength_mobility",
      "foundation_label":"Strength & Mobility",
      "foundation_description":"Build capacity with coach-prescribed strength or mobility work.",
      "target_label":"Short strength or mobility block",
      "prescribed_days":[1,3,5],
      "is_prescribed":true
    },
    {
      "foundation_key":"sleep_recovery",
      "foundation_label":"Sleep & Recovery",
      "foundation_description":"Protect the evening so your body can recover.",
      "target_label":"Evening wind-down and sleep opportunity",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"community",
      "foundation_label":"Community & Accountability",
      "foundation_description":"Stay connected instead of carrying the process alone.",
      "target_label":"Check in, pray or message support",
      "prescribed_days":[1,4],
      "is_prescribed":true
    },
    {
      "foundation_key":"fasting",
      "foundation_label":"Fasting / Meal-Timing Strategy",
      "foundation_description":"Only use fasting or stricter meal timing when personally prescribed.",
      "target_label":"Only when prescribed by your coach",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":false,
      "allow_not_applicable":true
    }
  ]'::jsonb;
$$;

create or replace function public.kca_client_program_start(p_client_user_id uuid)
returns date
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select min(r.submitted_at)::date
      from public.kca_assessment_runs r
      where r.user_id = p_client_user_id
        and r.status in ('submitted','coach_reviewed','published')
        and r.submitted_at is not null
    ),
    (
      select min(e.starts_at)::date
      from public.kca_client_entitlements e
      where e.user_id = p_client_user_id
        and e.status = 'active'
    ),
    current_date
  );
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

  if exists (
    select 1 from public.client_foundation_prescriptions p
    where p.client_user_id = v_user_id
      and p.active_until is null
  ) then
    return (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.foundation_label), '[]'::jsonb)
      from public.client_foundation_prescriptions p
      where p.client_user_id = v_user_id
        and p.active_until is null
    );
  end if;

  v_start := public.kca_client_program_start(v_user_id);

  for v_item in select * from jsonb_array_elements(public.kca_foundation_defaults())
  loop
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
      array(select jsonb_array_elements_text(coalesce(v_item->'prescribed_days','[1,2,3,4,5,6,7]'::jsonb))::int),
      coalesce((v_item->>'is_prescribed')::boolean, true),
      coalesce((v_item->>'allow_not_applicable')::boolean, false),
      v_start,
      auth.uid(),
      jsonb_build_object('source','default_seed','seeded_at',now())
    );
  end loop;

  insert into public.kca_audit_events (user_id, event_type, metadata)
  values (
    auth.uid(),
    'foundation_defaults_seeded',
    jsonb_build_object('client_user_id', v_user_id, 'active_from', v_start)
  );

  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.foundation_label), '[]'::jsonb)
    from public.client_foundation_prescriptions p
    where p.client_user_id = v_user_id
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
      d::date as log_date,
      coalesce(l.status, 'incomplete') as status
    from public.client_foundation_prescriptions p
    join generate_series(v_week_start, v_count_until, interval '1 day') d on true
    left join public.daily_foundation_logs l
      on l.prescription_id = p.id
      and l.client_user_id = p.client_user_id
      and l.log_date = d::date
    where p.client_user_id = p_client_user_id
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
        'completed', completed,
        'total', total,
        'percentage', case when total > 0 then round((completed::numeric / total::numeric) * 100, 2) else 0 end
      )
      order by foundation_label
    ), '[]'::jsonb) as items
    from (
      select
        foundation_key,
        foundation_label,
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
  v_program_day := greatest(1, (coalesce(p_local_date, current_date) - v_week_start)::int + 1);

  v_summary := public.kca_refresh_weekly_execution_summary(v_user_id, v_week_start);

  select u.email, coalesce(nullif(u.raw_user_meta_data->>'first_name',''), split_part(u.email, '@', 1))
  into v_email, v_name
  from auth.users u
  where u.id = v_user_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'prescription_id', p.id,
      'foundation_key', p.foundation_key,
      'foundation_label', p.foundation_label,
      'foundation_description', p.foundation_description,
      'target_label', p.target_label,
      'target_value', p.target_value,
      'target_unit', p.target_unit,
      'allow_not_applicable', p.allow_not_applicable,
      'status', coalesce(l.status, 'incomplete'),
      'completed_at', l.completed_at,
      'saved', l.id is not null
    )
    order by p.foundation_label
  ), '[]'::jsonb)
  into v_today_items
  from public.client_foundation_prescriptions p
  left join public.daily_foundation_logs l
    on l.prescription_id = p.id
    and l.client_user_id = v_user_id
    and l.log_date = coalesce(p_local_date, current_date)
  where p.client_user_id = v_user_id
    and p.is_prescribed = true
    and coalesce(p_local_date, current_date) >= p.active_from
    and (p.active_until is null or coalesce(p_local_date, current_date) <= p.active_until)
    and extract(isodow from coalesce(p_local_date, current_date))::int = any(p.prescribed_days);

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
      'local_date', coalesce(p_local_date, current_date),
      'week_start', v_week_start,
      'week_end', v_week_end
    ),
    'weekly_summary', v_summary,
    'today_items', v_today_items,
    'weekly_reflection', v_reflection,
    'reflection_questions', jsonb_build_object(
      'version','foundation_reflection_v1',
      'body','Where did your body feel supported or challenged this week?',
      'soul','What pattern in your thoughts, emotions or discipline did you notice this week?',
      'spirit','Where did you sense God inviting you into deeper surrender this week?'
    )
  );
end;
$$;

create or replace function public.kca_toggle_daily_foundation(
  p_prescription_id uuid,
  p_log_date date,
  p_completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_prescription public.client_foundation_prescriptions%rowtype;
  v_status text;
  v_log jsonb;
  v_summary jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then
    raise exception 'premium_entitlement_required';
  end if;

  select *
  into v_prescription
  from public.client_foundation_prescriptions p
  where p.id = p_prescription_id
    and p.client_user_id = v_user_id
  limit 1;

  if v_prescription.id is null then
    raise exception 'prescription_not_found';
  end if;

  if not v_prescription.is_prescribed then
    raise exception 'foundation_not_prescribed';
  end if;

  if p_log_date < v_prescription.active_from or (v_prescription.active_until is not null and p_log_date > v_prescription.active_until) then
    raise exception 'prescription_not_active_for_date';
  end if;

  if not (extract(isodow from p_log_date)::int = any(v_prescription.prescribed_days)) then
    raise exception 'foundation_not_prescribed_for_date';
  end if;

  v_status := case when coalesce(p_completed, false) then 'complete' else 'incomplete' end;

  insert into public.daily_foundation_logs (
    client_user_id,
    prescription_id,
    log_date,
    status,
    completed_at
  )
  values (
    v_user_id,
    p_prescription_id,
    p_log_date,
    v_status,
    case when v_status = 'complete' then now() else null end
  )
  on conflict (client_user_id, prescription_id, log_date)
  do update set
    status = excluded.status,
    completed_at = excluded.completed_at,
    updated_at = now()
  returning to_jsonb(daily_foundation_logs.*) into v_log;

  v_summary := public.kca_refresh_weekly_execution_summary(v_user_id, public.kca_execution_week_start(p_log_date));

  return jsonb_build_object('log', v_log, 'weekly_summary', v_summary);
end;
$$;

create or replace function public.kca_submit_weekly_reflection(
  p_program_week integer,
  p_week_start date,
  p_body_answer text,
  p_soul_answer text,
  p_spirit_answer text,
  p_coach_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_week_start date := public.kca_execution_week_start(coalesce(p_week_start, current_date));
  v_week_end date := public.kca_execution_week_start(coalesce(p_week_start, current_date)) + 6;
  v_program_start date;
  v_program_week integer;
  v_reflection jsonb;
  v_summary jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then
    raise exception 'premium_entitlement_required';
  end if;

  v_program_start := public.kca_client_program_start(v_user_id);
  v_program_week := coalesce(p_program_week, greatest(1, floor((v_week_start - v_program_start)::numeric / 7)::int + 1));

  insert into public.weekly_reflections (
    client_user_id,
    program_week,
    week_start,
    week_end,
    body_answer,
    soul_answer,
    spirit_answer,
    coach_note_from_client,
    submitted_at
  )
  values (
    v_user_id,
    v_program_week,
    v_week_start,
    v_week_end,
    trim(coalesce(p_body_answer, '')),
    trim(coalesce(p_soul_answer, '')),
    trim(coalesce(p_spirit_answer, '')),
    nullif(trim(coalesce(p_coach_note, '')), ''),
    now()
  )
  on conflict (client_user_id, program_week, week_start)
  do update set
    body_answer = excluded.body_answer,
    soul_answer = excluded.soul_answer,
    spirit_answer = excluded.spirit_answer,
    coach_note_from_client = excluded.coach_note_from_client,
    submitted_at = now(),
    updated_at = now()
  returning to_jsonb(weekly_reflections.*) into v_reflection;

  v_summary := public.kca_refresh_weekly_execution_summary(v_user_id, v_week_start);

  return jsonb_build_object('reflection', v_reflection, 'weekly_summary', v_summary);
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
  v_clients jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_is_coach() then
    raise exception 'not_authorized';
  end if;

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
      'reflection_submitted', coalesce(s.reflection_submitted, false),
      'needs_attention', coalesce(s.execution_status, 'Not Started') in ('Needs Attention','Not Started')
    )
    order by
      case when coalesce(s.execution_status, 'Not Started') in ('Needs Attention','Not Started') then 0 else 1 end,
      coalesce(s.execution_percentage, 0),
      coalesce(lr.submitted_at, '1900-01-01'::timestamptz) desc
  ), '[]'::jsonb)
  into v_clients
  from clients c
  join auth.users u on u.id = c.user_id
  left join latest_run lr on lr.user_id = c.user_id
  left join latest_intake li on li.user_id = c.user_id
  left join summaries s on s.client_user_id = c.user_id;

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

  select coalesce(jsonb_agg(to_jsonb(p.*) order by p.foundation_label), '[]'::jsonb)
  into v_prescriptions
  from public.client_foundation_prescriptions p
  where p.client_user_id = p_client_user_id
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
  v_effective_from date := coalesce(p_effective_from, current_date);
  v_item jsonb;
  v_key text;
  v_inserted integer := 0;
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
    v_key := nullif(trim(coalesce(v_item->>'foundation_key', '')), '');
    if v_key is null then
      continue;
    end if;

    update public.client_foundation_prescriptions
    set active_until = v_effective_from - 1,
        updated_at = now()
    where client_user_id = p_client_user_id
      and foundation_key = v_key
      and (active_until is null or active_until >= v_effective_from)
      and active_from < v_effective_from;

    delete from public.client_foundation_prescriptions
    where client_user_id = p_client_user_id
      and foundation_key = v_key
      and active_from = v_effective_from
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
      created_by,
      metadata
    )
    values (
      p_client_user_id,
      v_key,
      coalesce(nullif(trim(v_item->>'foundation_label'), ''), v_key),
      coalesce(v_item->>'foundation_description', ''),
      coalesce(v_item->>'target_label', ''),
      nullif(v_item->>'target_value', '')::numeric,
      nullif(trim(coalesce(v_item->>'target_unit', '')), ''),
      array(select jsonb_array_elements_text(coalesce(v_item->'prescribed_days','[1,2,3,4,5,6,7]'::jsonb))::int),
      coalesce((v_item->>'is_prescribed')::boolean, true),
      coalesce((v_item->>'allow_not_applicable')::boolean, false),
      nullif(v_item->>'program_week', '')::integer,
      v_effective_from,
      auth.uid(),
      coalesce(v_item->'metadata', '{}'::jsonb) || jsonb_build_object('source','coach_update','updated_by',auth.uid())
    );

    v_inserted := v_inserted + 1;
  end loop;

  insert into public.kca_audit_events (user_id, event_type, metadata)
  values (
    auth.uid(),
    'coach_saved_foundation_prescriptions',
    jsonb_build_object('client_user_id', p_client_user_id, 'effective_from', v_effective_from, 'count', v_inserted)
  );

  return public.kca_coach_execution_detail(p_client_user_id, v_effective_from);
end;
$$;

grant execute on function public.kca_execution_week_start(date) to authenticated;
grant execute on function public.kca_execution_status(numeric, integer) to authenticated;
grant execute on function public.kca_foundation_defaults() to authenticated;
grant execute on function public.kca_client_program_start(uuid) to authenticated;
grant execute on function public.kca_seed_default_foundations(uuid) to authenticated;
grant execute on function public.kca_refresh_weekly_execution_summary(uuid, date) to authenticated;
grant execute on function public.kca_get_today_dashboard(date) to authenticated;
grant execute on function public.kca_toggle_daily_foundation(uuid, date, boolean) to authenticated;
grant execute on function public.kca_submit_weekly_reflection(integer, date, text, text, text, text) to authenticated;
grant execute on function public.kca_coach_execution_overview() to authenticated;
grant execute on function public.kca_coach_execution_detail(uuid, date) to authenticated;
grant execute on function public.kca_coach_save_foundation_prescriptions(uuid, date, jsonb) to authenticated;
