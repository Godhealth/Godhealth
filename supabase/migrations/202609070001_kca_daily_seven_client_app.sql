-- GodHealth Premium Client App — Daily Seven
-- This migration makes the 7 daily foundations the prospective standard
-- without deleting or rewriting historical 10-foundation records.

create or replace function public.kca_daily_seven_keys()
returns text[]
language sql
immutable
as $$
  select array['seek','hydrate','eat','move','recover','renew','serve']::text[];
$$;

create or replace function public.kca_daily_seven_defaults()
returns jsonb
language sql
stable
as $$
  select '[
    {
      "foundation_key":"seek",
      "foundation_label":"SEEK",
      "foundation_description":"Begin the day with Bible reading and prayer. Track completion only — never your worth before God.",
      "target_label":"20–60 minutes Bible + prayer",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true,
      "metadata":{"system":"daily_seven","order":1,"tab":"today","theme":"spirit"}
    },
    {
      "foundation_key":"hydrate",
      "foundation_label":"HYDRATE",
      "foundation_description":"Drink clean water steadily through the day, starting early.",
      "target_label":"Follow your personal water target",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true,
      "metadata":{"system":"daily_seven","order":2,"tab":"food","theme":"body"}
    },
    {
      "foundation_key":"eat",
      "foundation_label":"EAT",
      "foundation_description":"Follow your personal meal rhythm with God-created food. Fasting intensity is only used when appropriate.",
      "target_label":"Your personal eating window",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true,
      "metadata":{"system":"daily_seven","order":3,"tab":"food","theme":"body","examples":["2 meals · 18:6","2 meals · 20:4","1 meal · 23:1"]}
    },
    {
      "foundation_key":"move",
      "foundation_label":"MOVE",
      "foundation_description":"Complete today’s movement: steps, strength, mobility or sitting breaks when prescribed.",
      "target_label":"Today’s movement prescription",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true,
      "metadata":{"system":"daily_seven","order":4,"tab":"training","theme":"body"}
    },
    {
      "foundation_key":"recover",
      "foundation_label":"RECOVER",
      "foundation_description":"Protect sleep, Sabbath rhythm and recovery so your body can rebuild.",
      "target_label":"Sleep + recovery rhythm",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true,
      "metadata":{"system":"daily_seven","order":5,"tab":"progress","theme":"body"}
    },
    {
      "foundation_key":"renew",
      "foundation_label":"RENEW",
      "foundation_description":"Practice one small soul-renewing action: stillness, gratitude, breath, forgiveness or a boundary.",
      "target_label":"One renewal practice",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true,
      "metadata":{"system":"daily_seven","order":6,"tab":"progress","theme":"soul"}
    },
    {
      "foundation_key":"serve",
      "foundation_label":"SERVE",
      "foundation_description":"Choose one intentional act of love. Serve your neighbour as yourself.",
      "target_label":"One intentional act of service",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true,
      "metadata":{"system":"daily_seven","order":7,"tab":"today","theme":"spirit"}
    }
  ]'::jsonb;
$$;

create or replace function public.kca_foundation_defaults()
returns jsonb
language sql
stable
as $$
  select public.kca_daily_seven_defaults();
$$;

create or replace function public.kca_weekly_reflection_questions(p_program_week integer default 1)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'version',
    'daily_seven_reflection_v2_w' || least(greatest(coalesce(p_program_week, 1), 1), 12),
    'body',
    case
      when coalesce(p_program_week, 1) <= 4 then 'Where did your body feel stronger, tired or resistant this week?'
      when coalesce(p_program_week, 1) <= 8 then 'Which body habit helped you most this week, and what still needs attention?'
      else 'What physical rhythm do you want to protect as this becomes your lifestyle?'
    end,
    'soul',
    case
      when coalesce(p_program_week, 1) <= 4 then 'What thought, emotion or habit pattern did you notice most this week?'
      when coalesce(p_program_week, 1) <= 8 then 'Where did discipline feel easier, and where did stress still pull you off track?'
      else 'What inner pattern has changed most since you started this journey?'
    end,
    'spirit',
    case
      when coalesce(p_program_week, 1) <= 4 then 'Where did you sense God inviting you to seek Him first this week?'
      when coalesce(p_program_week, 1) <= 8 then 'How did your walk with Jesus shape your health choices this week?'
      else 'What part of stewardship now feels more like worship than pressure?'
    end,
    'coach',
    'What do you want Robin to know before he guides your next week?'
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
  v_daily_keys text[] := public.kca_daily_seven_keys();
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

  if (
    select count(distinct p.foundation_key)
    from public.client_foundation_prescriptions p
    where p.client_user_id = v_user_id
      and p.foundation_key = any(v_daily_keys)
      and p.is_prescribed = true
      and p.active_until is null
  ) >= 7 then
    return (
      select coalesce(jsonb_agg(to_jsonb(p) order by coalesce((p.metadata->>'order')::int, 99), p.foundation_label), '[]'::jsonb)
      from public.client_foundation_prescriptions p
      where p.client_user_id = v_user_id
        and p.foundation_key = any(v_daily_keys)
        and p.is_prescribed = true
        and p.active_until is null
    );
  end if;

  v_start := greatest(public.kca_client_program_start(v_user_id), current_date);

  update public.client_foundation_prescriptions p
  set active_until = case when p.active_from < v_start then v_start - 1 else p.active_from end,
      updated_at = now(),
      metadata = p.metadata || jsonb_build_object('superseded_by','daily_seven','superseded_at',now())
  where p.client_user_id = v_user_id
    and p.active_until is null
    and not (p.foundation_key = any(v_daily_keys));

  for v_item in select * from jsonb_array_elements(public.kca_daily_seven_defaults())
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
        array(select jsonb_array_elements_text(coalesce(v_item->'prescribed_days','[1,2,3,4,5,6,7]'::jsonb))::int),
        coalesce((v_item->>'is_prescribed')::boolean, true),
        coalesce((v_item->>'allow_not_applicable')::boolean, false),
        v_start,
        auth.uid(),
        coalesce(v_item->'metadata', '{}'::jsonb) || jsonb_build_object('source','daily_seven_seed','seeded_at',now())
      );
    end if;
  end loop;

  insert into public.kca_audit_events (user_id, event_type, metadata)
  values (
    auth.uid(),
    'daily_seven_foundations_seeded',
    jsonb_build_object('client_user_id', v_user_id, 'active_from', v_start)
  );

  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by coalesce((p.metadata->>'order')::int, 99), p.foundation_label), '[]'::jsonb)
    from public.client_foundation_prescriptions p
    where p.client_user_id = v_user_id
      and p.foundation_key = any(v_daily_keys)
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
  v_daily_keys text[] := public.kca_daily_seven_keys();
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

  with has_daily_seven as (
    select exists (
      select 1
      from public.client_foundation_prescriptions p
      where p.client_user_id = p_client_user_id
        and p.foundation_key = any(v_daily_keys)
        and p.active_from <= v_count_until
        and (p.active_until is null or p.active_until >= v_week_start)
    ) as enabled
  ),
  opportunities as (
    select
      p.id as prescription_id,
      p.foundation_key,
      p.foundation_label,
      coalesce((p.metadata->>'order')::int, 99) as foundation_order,
      d::date as log_date,
      coalesce(l.status, 'incomplete') as status
    from public.client_foundation_prescriptions p
    join generate_series(v_week_start, v_count_until, interval '1 day') d on true
    cross join has_daily_seven h
    left join public.daily_foundation_logs l
      on l.prescription_id = p.id
      and l.client_user_id = p.client_user_id
      and l.log_date = d::date
    where p.client_user_id = p_client_user_id
      and p.is_prescribed = true
      and d::date >= p.active_from
      and (p.active_until is null or d::date <= p.active_until)
      and extract(isodow from d)::int = any(p.prescribed_days)
      and (h.enabled = false or p.foundation_key = any(v_daily_keys))
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
      order by foundation_order, foundation_label
    ), '[]'::jsonb) as items
    from (
      select
        foundation_key,
        foundation_label,
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
  v_daily_keys text[] := public.kca_daily_seven_keys();
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
    and p.foundation_key = any(v_daily_keys)
    and p.is_prescribed = true
    and v_date >= p.active_from
    and (p.active_until is null or v_date <= p.active_until)
    and extract(isodow from v_date)::int = any(p.prescribed_days);

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
    'today_items', v_today_items,
    'weekly_reflection', v_reflection,
    'reflection_questions', v_questions
  );
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
  v_questions jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then
    raise exception 'premium_entitlement_required';
  end if;

  v_program_start := public.kca_client_program_start(v_user_id);
  v_program_week := coalesce(p_program_week, greatest(1, floor((v_week_start - v_program_start)::numeric / 7)::int + 1));
  v_questions := public.kca_weekly_reflection_questions(v_program_week);

  insert into public.weekly_reflections (
    client_user_id,
    program_week,
    week_start,
    week_end,
    question_version,
    body_question,
    body_answer,
    soul_question,
    soul_answer,
    spirit_question,
    spirit_answer,
    coach_note_from_client,
    submitted_at
  )
  values (
    v_user_id,
    v_program_week,
    v_week_start,
    v_week_end,
    v_questions->>'version',
    v_questions->>'body',
    trim(coalesce(p_body_answer, '')),
    v_questions->>'soul',
    trim(coalesce(p_soul_answer, '')),
    v_questions->>'spirit',
    trim(coalesce(p_spirit_answer, '')),
    nullif(trim(coalesce(p_coach_note, '')), ''),
    now()
  )
  on conflict (client_user_id, program_week, week_start)
  do update set
    question_version = excluded.question_version,
    body_question = excluded.body_question,
    body_answer = excluded.body_answer,
    soul_question = excluded.soul_question,
    soul_answer = excluded.soul_answer,
    spirit_question = excluded.spirit_question,
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
  v_daily_keys text[] := public.kca_daily_seven_keys();
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

  with has_daily_seven as (
    select exists (
      select 1
      from public.client_foundation_prescriptions p
      where p.client_user_id = p_client_user_id
        and p.foundation_key = any(v_daily_keys)
        and p.active_from <= v_week_end
        and (p.active_until is null or p.active_until >= v_week_start)
    ) as enabled
  )
  select coalesce(jsonb_agg(to_jsonb(p.*) order by coalesce((p.metadata->>'order')::int, 99), p.foundation_label), '[]'::jsonb)
  into v_prescriptions
  from public.client_foundation_prescriptions p
  cross join has_daily_seven h
  where p.client_user_id = p_client_user_id
    and p.active_from <= v_week_end
    and (p.active_until is null or p.active_until >= v_week_start)
    and (h.enabled = false or p.foundation_key = any(v_daily_keys));

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

grant execute on function public.kca_daily_seven_keys() to authenticated;
grant execute on function public.kca_daily_seven_defaults() to authenticated;
grant execute on function public.kca_weekly_reflection_questions(integer) to authenticated;
grant execute on function public.kca_foundation_defaults() to authenticated;
grant execute on function public.kca_seed_default_foundations(uuid) to authenticated;
grant execute on function public.kca_refresh_weekly_execution_summary(uuid, date) to authenticated;
grant execute on function public.kca_get_today_dashboard(date) to authenticated;
grant execute on function public.kca_submit_weekly_reflection(integer, date, text, text, text, text) to authenticated;
grant execute on function public.kca_coach_execution_overview() to authenticated;
grant execute on function public.kca_coach_execution_detail(uuid, date) to authenticated;
