-- GodHealth Kingdom Capacity Assessment V3 personalization upgrade.
-- Preserves V2 history; adds authenticated, entitlement-gated V3 flow.

create extension if not exists pgcrypto;

create table if not exists public.kca_client_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_version text not null default '3.0.0',
  status text not null default 'active' check (status in ('active','paused','expired','revoked')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, assessment_version)
);

create table if not exists public.kca_personal_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.kca_assessment_runs(id) on delete cascade,
  assessment_version text not null default '3.0.0',
  completion_status text not null default 'draft' check (completion_status in ('draft','submitted','archived')),
  consent jsonb not null default '{}'::jsonb,
  safety_answers jsonb not null default '{}'::jsonb,
  intake jsonb not null default '{}'::jsonb,
  draft_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kca_personal_intakes_one_draft_per_user_version
on public.kca_personal_intakes (user_id, assessment_version)
where completion_status = 'draft' and run_id is null;

create table if not exists public.kca_energy_profiles (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.kca_assessment_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_version text not null default '3.0.0',
  profile jsonb not null default '{}'::jsonb,
  coach_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.kca_plan_engine_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.kca_assessment_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_version text not null default '3.0.0',
  engine_version text not null default 'GodHealth Personal Plan Engine v1',
  status text not null default 'draft_generated' check (status in ('draft_generated','coach_review','approved','rejected','superseded')),
  input_snapshot jsonb not null default '{}'::jsonb,
  plan_draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.kca_coach_plan_reviews (
  id uuid primary key default gen_random_uuid(),
  engine_run_id uuid not null references public.kca_plan_engine_runs(id) on delete cascade,
  run_id uuid not null references public.kca_assessment_runs(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete restrict,
  review_status text not null default 'approved' check (review_status in ('draft','approved','changes_requested','rejected')),
  coach_notes text,
  approved_plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (engine_run_id)
);

create table if not exists public.kca_plans (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.kca_assessment_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete restrict,
  engine_run_id uuid not null references public.kca_plan_engine_runs(id) on delete restrict,
  assessment_version text not null default '3.0.0',
  status text not null default 'active' check (status in ('approved','active','completed','superseded')),
  plan jsonb not null default '{}'::jsonb,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.kca_plan_weeks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.kca_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 12),
  week jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, week_number)
);

create table if not exists public.kca_weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.kca_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 12),
  checkin jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, week_number)
);

create table if not exists public.kca_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.kca_plans(id) on delete cascade,
  measurement_date date not null default current_date,
  measurement_type text not null,
  value_numeric numeric,
  value_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.kca_coach_role()
returns text
language sql
security definer
set search_path = public, auth
as $$
  select role from public.kca_coaches where user_id = auth.uid() limit 1;
$$;

grant execute on function public.kca_coach_role() to authenticated;

create or replace function public.kca_is_coach()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (select 1 from public.kca_coaches where user_id = auth.uid());
$$;

grant execute on function public.kca_is_coach() to authenticated;

create or replace function public.kca_is_owner()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (select 1 from public.kca_coaches where user_id = auth.uid() and role = 'owner');
$$;

grant execute on function public.kca_is_owner() to authenticated;

create or replace function public.kca_can_access_client(p_client_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select auth.uid() = p_client_user_id
    or exists (select 1 from public.kca_coaches c where c.user_id = auth.uid() and c.role = 'owner')
    or exists (
      select 1
      from public.kca_coach_assignments a
      join public.kca_coaches c on c.user_id = a.coach_user_id
      where a.client_user_id = p_client_user_id
        and a.coach_user_id = auth.uid()
        and c.role = 'coach'
    );
$$;

grant execute on function public.kca_can_access_client(uuid) to authenticated;

create or replace function public.kca_has_active_entitlement(p_user_id uuid, p_assessment_version text default '3.0.0')
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.kca_client_entitlements e
    where e.user_id = p_user_id
      and e.assessment_version = p_assessment_version
      and e.status = 'active'
      and e.starts_at <= now()
      and e.revoked_at is null
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

grant execute on function public.kca_has_active_entitlement(uuid, text) to authenticated;

create or replace function public.kca_v3_score_snapshot(p_definition jsonb, p_responses jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_question jsonb;
  v_question_id text;
  v_answer_text text;
  v_answer numeric;
  v_domain_count integer;
  v_snapshot jsonb;
begin
  if p_definition is null or p_definition->>'schema_version' <> '3.0.0' then
    raise exception 'invalid_v3_definition';
  end if;

  if p_responses is null or jsonb_typeof(p_responses) <> 'object' then
    raise exception 'responses_must_be_object';
  end if;

  for v_question in
    select value from jsonb_array_elements(p_definition->'capacity_core')
    where coalesce((value->>'include_in_core_score')::boolean, true) = true
  loop
    v_question_id := v_question->>'id';
    if not (p_responses ? v_question_id) then
      raise exception 'missing_core_answer:%', v_question_id;
    end if;
    v_answer_text := p_responses->>v_question_id;
    if v_answer_text !~ '^[0-4]$' then
      raise exception 'invalid_core_answer:%', v_question_id;
    end if;
    v_answer := v_answer_text::numeric;
  end loop;

  if exists (
    select 1
    from jsonb_object_keys(p_responses) key
    where not exists (
      select 1
      from jsonb_array_elements(p_definition->'capacity_core') q
      where q->>'id' = key
        and coalesce((q->>'include_in_core_score')::boolean, true) = true
    )
  ) then
    raise exception 'unknown_core_question_id';
  end if;

  select count(*) into v_domain_count
  from (
    select q->>'domain_code' as domain_code
    from jsonb_array_elements(p_definition->'capacity_core') q
    where coalesce((q->>'include_in_core_score')::boolean, true) = true
    group by q->>'domain_code'
    having count(*) = 2
  ) d;
  if v_domain_count <> 12 then
    raise exception 'invalid_v3_domain_core_count';
  end if;

  with core as (
    select
      q->>'id' as question_id,
      q->>'domain_code' as domain_code,
      q->>'pillar' as pillar,
      (p_responses->>(q->>'id'))::numeric as answer_value
    from jsonb_array_elements(p_definition->'capacity_core') q
    where coalesce((q->>'include_in_core_score')::boolean, true) = true
  ), domain_meta as (
    select d->>'code' as domain_code, d->>'name' as domain_name, d->>'pillar' as pillar
    from jsonb_array_elements(p_definition->'domains') d
  ), domain_scores as (
    select
      c.domain_code,
      coalesce(max(dm.domain_name), c.domain_code) as domain_name,
      c.pillar,
      round((avg(c.answer_value) * 25)::numeric, 2) as internal
    from core c
    left join domain_meta dm on dm.domain_code = c.domain_code
    group by c.domain_code, c.pillar
  ), pillar_scores as (
    select pillar, round(avg(internal)::numeric, 2) as internal
    from domain_scores
    group by pillar
  ), kci as (
    select round(avg(internal)::numeric, 2) as internal from pillar_scores
  )
  select jsonb_build_object(
    'engine_version', '3.0.0',
    'assessment_version', '3.0.0',
    'disclaimer', coalesce(p_definition#>>'{scoring,disclaimer}', 'Directional coaching index; not diagnostic.'),
    'domain_scores', (
      select jsonb_object_agg(domain_code, jsonb_build_object(
        'domain_code', domain_code,
        'domain_name', domain_name,
        'pillar', pillar,
        'internal', internal,
        'display', round(internal),
        'status', 'complete'
      )) from domain_scores
    ),
    'pillar_scores', (
      select jsonb_object_agg(pillar, jsonb_build_object(
        'pillar', pillar,
        'internal', internal,
        'display', round(internal),
        'status', 'complete'
      )) from pillar_scores
    ),
    'kci', (
      select jsonb_build_object('internal', internal, 'display', round(internal), 'status', 'complete') from kci
    )
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

grant execute on function public.kca_v3_score_snapshot(jsonb, jsonb) to authenticated;

create or replace function public.kca_v3_route_safety(p_definition jsonb, p_safety_answers jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_gate jsonb;
  v_value text;
  v_flags jsonb := '[]'::jsonb;
  v_restrictions jsonb := '[]'::jsonb;
  v_stop boolean := false;
begin
  if p_safety_answers is null then
    p_safety_answers := '{}'::jsonb;
  end if;

  for v_gate in select value from jsonb_array_elements(coalesce(p_definition->'safety_gates','[]'::jsonb)) loop
    v_value := lower(coalesce(p_safety_answers->>(v_gate->>'id'), 'no'));
    if v_value in ('yes','true') then
      v_flags := v_flags || jsonb_build_array(jsonb_build_object(
        'gate_id', v_gate->>'id',
        'action_code', v_gate->>'action_code',
        'message', v_gate->>'if_yes',
        'coach_review_required', true
      ));
      v_restrictions := v_restrictions || '["coach_review_required","no_autonomous_calorie_prescription","no_autonomous_fasting_prescription","no_autonomous_training_prescription"]'::jsonb;
      if v_gate->>'action_code' = 'eating_disorder_scope' then
        v_restrictions := v_restrictions || '["no_fasting_recommendations","no_caloric_restriction_recommendations","no_weight_loss_recommendations","specialist_or_qualified_care_workflow_required"]'::jsonb;
      end if;
      if v_gate->>'action_code' = 'mental_health_urgent' then
        v_restrictions := v_restrictions || '["urgent_support_routing_only"]'::jsonb;
        v_stop := true;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'has_flags', jsonb_array_length(v_flags) > 0,
    'flags', v_flags,
    'restrictions', (select coalesce(jsonb_agg(distinct value), '[]'::jsonb) from jsonb_array_elements_text(v_restrictions)),
    'stop_normal_recommendation_flow', v_stop
  );
end;
$$;

grant execute on function public.kca_v3_route_safety(jsonb, jsonb) to authenticated;

create or replace function public.kca_v3_build_plan_draft(p_score jsonb, p_intake jsonb, p_safety jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_age numeric := nullif(p_intake->>'PR1','')::numeric;
  v_sex text := lower(coalesce(p_intake->>'PR2',''));
  v_height numeric := nullif(p_intake->>'PR3','')::numeric;
  v_weight numeric := nullif(p_intake->>'PR4','')::numeric;
  v_goal text := coalesce(p_intake->>'GL1','combined/other');
  v_ree numeric;
  v_pal numeric := 1.4;
  v_pal_label text := 'sedentary';
  v_steps numeric := coalesce(nullif(p_intake->>'PR8','')::numeric, 0);
  v_strength numeric := coalesce(nullif(p_intake->>'TR1','')::numeric, 0);
  v_cardio numeric := coalesce(nullif(p_intake->>'TR2','')::numeric, 0);
  v_tdee numeric;
  v_hard_blocks jsonb := '[]'::jsonb;
  v_goal_range jsonb := null;
  v_bmi numeric;
  v_big3 jsonb := '[]'::jsonb;
  v_domain record;
  v_weeks jsonb := '[]'::jsonb;
  v_week integer;
  v_training_sessions integer := 2;
  v_sleep numeric := coalesce(nullif(p_intake->>'SL1','')::numeric, 7);
  v_recovery numeric := coalesce(nullif(p_intake->>'SL6','')::numeric, 5);
begin
  if v_sex = 'male' then
    v_ree := round(10*v_weight + 6.25*v_height - 5*v_age + 5, 2);
  elsif v_sex = 'female' then
    v_ree := round(10*v_weight + 6.25*v_height - 5*v_age - 161, 2);
  else
    v_hard_blocks := v_hard_blocks || '["unsupported_energy_equation_input"]'::jsonb;
  end if;

  if v_height is not null and v_weight is not null and v_height > 0 then
    v_bmi := round(v_weight / power(v_height / 100, 2), 2);
  end if;

  if v_age < 18 then v_hard_blocks := v_hard_blocks || '["age_under_18"]'::jsonb; end if;
  if coalesce((p_safety->>'has_flags')::boolean, false) then v_hard_blocks := v_hard_blocks || '["safety_review_required"]'::jsonb; end if;
  if v_bmi is not null and v_bmi < 18.5 then v_hard_blocks := v_hard_blocks || '["bmi_under_18_5"]'::jsonb; end if;
  if lower(p_intake::text) ~ '(pregnant|postpartum|breastfeeding)' then v_hard_blocks := v_hard_blocks || '["pregnancy_postpartum_or_breastfeeding_context"]'::jsonb; end if;
  if lower(p_intake::text) ~ '(kidney|renal|diabetes|glucose|insulin|diuretic|medication)' then v_hard_blocks := v_hard_blocks || '["condition_or_medication_review_required"]'::jsonb; end if;

  if lower(coalesce(p_intake->>'PR7','')) like '%mix%' or v_steps >= 5000 or v_strength >= 1 or v_cardio >= 60 then v_pal := 1.5; v_pal_label := 'light'; end if;
  if lower(coalesce(p_intake->>'PR7','')) like '%standing%' or v_steps >= 8000 or v_strength >= 2 or v_cardio >= 150 then v_pal := 1.6; v_pal_label := 'moderate'; end if;
  if lower(coalesce(p_intake->>'PR7','')) like '%demanding%' or v_steps >= 11000 or v_strength >= 4 or v_cardio >= 240 then v_pal := 1.75; v_pal_label := 'active'; end if;
  if v_steps >= 15000 and (v_strength >= 5 or v_cardio >= 360) then v_pal := 1.9; v_pal_label := 'very_active'; end if;

  if v_ree is not null then
    v_tdee := round(v_ree * v_pal);
    if jsonb_array_length(v_hard_blocks) = 0 then
      if lower(v_goal) = 'fat loss' then
        v_goal_range := jsonb_build_object('low', round(v_tdee * .80), 'high', round(v_tdee * .90), 'approval_required', true);
      elsif lower(v_goal) = 'strength/muscle gain' then
        v_goal_range := jsonb_build_object('low', round(v_tdee * 1.05), 'high', round(v_tdee * 1.10), 'approval_required', true);
      else
        v_goal_range := jsonb_build_object('low', round(v_tdee * .95), 'high', round(v_tdee * 1.05), 'approval_required', true);
      end if;
      if (v_goal_range->>'low')::numeric < 1200 then
        v_hard_blocks := v_hard_blocks || '["target_under_1200_specialist_review_required"]'::jsonb;
        v_goal_range := null;
      end if;
    end if;
  end if;

  for v_domain in
    select key as domain_code, value as score
    from jsonb_each(p_score->'domain_scores')
    order by (value->>'internal')::numeric asc
    limit 3
  loop
    v_big3 := v_big3 || jsonb_build_array(jsonb_build_object(
      'title', case
        when v_domain.domain_code = 'B1' then 'Meal Structure'
        when v_domain.domain_code = 'B2' then 'Sleep Anchor'
        when v_domain.domain_code = 'B3' then 'Strength Foundation'
        when v_domain.domain_code = 'S2' then 'Stress Pause'
        when v_domain.domain_code = 'S3' then 'Comeback Protocol'
        when left(v_domain.domain_code,1) = 'P' then 'Daily Surrender Rhythm'
        else coalesce(v_domain.score->>'domain_name','Capacity Anchor')
      end,
      'domain_code', v_domain.domain_code,
      'pillar', v_domain.score->>'pillar',
      'why', 'This is one of the clearest actionable gaps for your current GodHealth roadmap.',
      'weekly_action', 'Practice one small weekly behavior that lowers friction and strengthens Body, Soul and Spirit alignment.',
      'frequency_or_dose', '3-5 times per week',
      'measurement', 'completed actions and weekly reflection',
      'likely_barrier', coalesce(p_intake->>'EN7','busy weeks, stress or poor sleep'),
      'environment_modification', 'Prepare the next right action before the day starts.',
      'bad_week_fallback', 'Keep the smallest faithful version alive today.'
    ));
  end loop;

  if v_strength = 0 or lower(coalesce(p_intake->>'TR3','none')) in ('none','<6 months') or v_sleep < 6.5 or v_recovery < 5 then
    v_training_sessions := least(2, greatest(1, coalesce(nullif(p_intake->>'TR4','')::int, 2)));
  else
    v_training_sessions := least(3, greatest(1, coalesce(nullif(p_intake->>'TR4','')::int, 3)));
  end if;
  if coalesce((p_safety->>'has_flags')::boolean, false) then v_training_sessions := 0; end if;

  for v_week in 1..12 loop
    v_weeks := v_weeks || jsonb_build_array(jsonb_build_object(
      'week', v_week,
      'phase', case when v_week = 1 then 'REVEAL / RESET' when v_week <= 4 then 'RESTORE' when v_week <= 8 then 'REBUILD' when v_week <= 10 then 'REBUILD+' else 'REINFORCE' end,
      'purpose', case when v_week = 1 then 'baseline, remove friction and establish anchors' when v_week <= 4 then 'nutrition quality, sleep/recovery and training foundation' when v_week <= 8 then 'progress training, goal-specific energy strategy and resilience' when v_week <= 10 then 'increase capacity while maintaining sustainability' else 'independence, comeback protocol and reassessment' end,
      'bad_week_fallback', 'One simple meal, one walk if safe, one honest prayer.'
    ));
  end loop;

  return jsonb_build_object(
    'engine_version', 'GodHealth Personal Plan Engine v1',
    'coach_approval_status', 'draft_requires_coach_approval',
    'client_visible', false,
    'summary', jsonb_build_object('primary_goal', v_goal, 'calling_why', p_intake->>'GL4', 'constraints', p_intake->'GL8', 'safety_status', case when coalesce((p_safety->>'has_flags')::boolean,false) then 'coach/clinical review required' else 'ready for coach review' end),
    'energy_profile', jsonb_build_object(
      'estimated_REE_kcal', v_ree,
      'proposed_activity_factor', jsonb_build_object('level', v_pal_label, 'value', v_pal),
      'estimated_TDEE_range_kcal', case when v_tdee is null then null else jsonb_build_object('low', round(v_tdee*.90), 'mid', v_tdee, 'high', round(v_tdee*1.10), 'label', 'estimated range, not exact metabolism') end,
      'goal_calorie_range_kcal', v_goal_range,
      'confidence', case when jsonb_array_length(v_hard_blocks)>0 then 'coach/clinical review required' else 'estimated — coach approval required' end,
      'calibration_status', 'requires 14 days, at least 8 morning weights, and adherence context before adjustment',
      'hard_blocks', (select coalesce(jsonb_agg(distinct value), '[]'::jsonb) from jsonb_array_elements_text(v_hard_blocks)),
      'bmi', v_bmi
    ),
    'nutrition', jsonb_build_object(
      'protein_target', case when lower(p_intake::text) ~ '(kidney|renal)' then jsonb_build_object('blocked', true, 'note', 'Relevant medical context requires review before a high-protein target.') else jsonb_build_object('low_g', round(v_weight*1.4), 'high_g', round(v_weight*2.0), 'default_g', round(v_weight*1.6), 'note', 'Coach approval required.') end,
      'who_benchmarks', jsonb_build_object('fruit_veg','Aim >=400 g/day', 'fibre','Aim >=25 g/day', 'free_sugars','<10% energy', 'saturated_fat','<10% energy', 'trans_fat','<1% energy', 'salt','<5 g/day'),
      'meal_structure', 'Personalized around schedule, hunger, family context and sustainability.',
      'personal_10_meals', jsonb_build_array('Protein breakfast bowl','Greek yogurt + fruit','Eggs + vegetables','Chicken rice bowl','Tuna salad wrap','Lean beef potato plate','Salmon + vegetables','Turkey chili','High-protein smoothie','Simple social-meal fallback')
    ),
    'training', jsonb_build_object('sessions_per_week', v_training_sessions, 'session_duration', p_intake->>'TR5', 'exercise_template', case when v_training_sessions = 0 then 'No automated training prescription until review.' when v_training_sessions <=2 then 'Two simple full-body sessions initially.' else 'Three structured strength sessions adjusted to recovery.' end, 'respects_constraints', true, 'injury_constraints', p_intake->>'TR9'),
    'recovery', jsonb_build_object('sleep_target','Adults generally need a 7-9 hour sleep opportunity.', 'apnea_like_symptoms_flag', lower(coalesce(p_intake->>'SL5','no')) in ('yes','not sure'), 'hydration_benchmark', case when v_sex='female' then 'EFSA benchmark: about 2.0 L/day total water from food + beverages.' when v_sex='male' then 'EFSA benchmark: about 2.5 L/day total water from food + beverages.' else 'Use total water from food + beverages.' end, 'sweat_rate_formula','(pre_kg - post_kg + fluid_L - urine_L) / hours'),
    'optional_strategies', jsonb_build_object('fasting', case when lower(coalesce(p_intake->>'FA1','no'))='no' or coalesce((p_safety->>'has_flags')::boolean,false) then 'No fasting recommendation generated.' else 'Optional simple time-restricted structure only if coach-approved.' end, 'sauna_cold','Captured as context only; never prioritized over foundations.'),
    'big3', v_big3,
    'weeks', v_weeks
  );
end;
$$;

grant execute on function public.kca_v3_build_plan_draft(jsonb, jsonb, jsonb) to authenticated;

insert into public.kca_assessment_definitions (definition_version, schema_version, title, definition, supersedes, change_reason)
values ('3.0.0', '3.0.0', 'GodHealth Kingdom Capacity Assessment v3', $kca_v3_definition${"schema_version":"3.0.0","supersedes":["GodHealth_KCA_Config_v2.json","all 72-core and 36-core KCA specs"],"product_name":"GodHealth Kingdom Capacity Assessment + Personal 12-Week Plan Builder","access":{"public":false,"requires_authenticated_premium_client":true,"server_side_authorization_required":true},"assessment_architecture":{"safety_gates":6,"capacity_core_questions":24,"automatic_deep_dive_questions":0,"coach_clarifier_bank":12,"personal_transformation_intake_fields":69,"principle":"Core measures capacity; intake drives personalization; coach clarifiers support interpretation. Do not inflate client burden with repetitive psychometric items."},"response_scale":[{"value":0,"label":"Not true / Never","meaning":"This is not currently part of my normal pattern."},{"value":1,"label":"Rarely true","meaning":"This happens occasionally but is not dependable."},{"value":2,"label":"Sometimes true","meaning":"This is present, but inconsistent or fragile."},{"value":3,"label":"Mostly true","meaning":"This is usually present with some meaningful gaps."},{"value":4,"label":"Consistently true","meaning":"This is a stable and dependable part of my current pattern."}],"domains":[{"code":"B1","pillar":"BODY","name":"Nutrition Quality & Eating Structure","scripture_refs":["1 Corinthians 10:31","Ecclesiastes 10:17","Proverbs 25:16"],"core_question_ids":["B1.1","B1.3","B1.6"],"deep_dive_question_ids":["B1.2","B1.4"],"coach_clarification_question_ids":["B1.5"]},{"code":"B2","pillar":"BODY","name":"Sleep & Circadian Recovery","scripture_refs":["Mark 6:31","Psalm 127:2","Matthew 11:28-30"],"core_question_ids":["B2.1","B2.2","B2.6"],"deep_dive_question_ids":["B2.3","B2.5"],"coach_clarification_question_ids":["B2.4"]},{"code":"B3","pillar":"BODY","name":"Movement, Strength & Sedentary Balance","scripture_refs":["1 Timothy 4:8","1 Corinthians 9:24-27","1 Corinthians 6:20"],"core_question_ids":["B3.1","B3.2","B3.6"],"deep_dive_question_ids":["B3.3","B3.4"],"coach_clarification_question_ids":["B3.5"]},{"code":"B4","pillar":"BODY","name":"Energy, Recovery & Physical Readiness","scripture_refs":["Mark 6:31","Psalm 103:14","1 Corinthians 6:19-20"],"core_question_ids":["B4.1","B4.3","B4.5"],"deep_dive_question_ids":["B4.2","B4.4"],"coach_clarification_question_ids":["B4.6"]},{"code":"S1","pillar":"SOUL","name":"Mental Flexibility & Thought Stewardship","scripture_refs":["Romans 12:2","Philippians 4:8","2 Corinthians 10:5"],"core_question_ids":["S1.1","S1.4","S1.5"],"deep_dive_question_ids":["S1.2","S1.3"],"coach_clarification_question_ids":["S1.6"]},{"code":"S2","pillar":"SOUL","name":"Emotional Regulation & Stress Resilience","scripture_refs":["Proverbs 4:23","Philippians 4:6-7","James 1:19-20","Proverbs 16:32"],"core_question_ids":["S2.1","S2.2","S2.4"],"deep_dive_question_ids":["S2.3","S2.5"],"coach_clarification_question_ids":["S2.6"]},{"code":"S3","pillar":"SOUL","name":"Habits, Discipline & Follow-Through","scripture_refs":["Galatians 5:22-23","James 1:22","1 Corinthians 9:24-27","Proverbs 25:28"],"core_question_ids":["S3.1","S3.2","S3.5"],"deep_dive_question_ids":["S3.3","S3.4"],"coach_clarification_question_ids":["S3.6"]},{"code":"S4","pillar":"SOUL","name":"Relationships, Support & Environment","scripture_refs":["Ecclesiastes 4:9-10","Proverbs 13:20","Hebrews 10:24-25","1 Corinthians 15:33"],"core_question_ids":["S4.1","S4.2","S4.3"],"deep_dive_question_ids":["S4.4","S4.5"],"coach_clarification_question_ids":["S4.6"]},{"code":"P1","pillar":"SPIRIT","name":"Scripture & Truth Alignment","scripture_refs":["Psalm 119:105","2 Timothy 3:16-17","John 8:31-32","Romans 12:2"],"core_question_ids":["P1.1","P1.3","P1.6"],"deep_dive_question_ids":["P1.2","P1.4"],"coach_clarification_question_ids":["P1.5"]},{"code":"P2","pillar":"SPIRIT","name":"Prayer, Dependence & Gratitude","scripture_refs":["1 Thessalonians 5:17-18","Philippians 4:6-7","James 1:5","John 15:5"],"core_question_ids":["P2.1","P2.2","P2.5"],"deep_dive_question_ids":["P2.3","P2.6"],"coach_clarification_question_ids":["P2.4"]},{"code":"P3","pillar":"SPIRIT","name":"Stewardship, Self-Control & Obedience","scripture_refs":["1 Corinthians 6:19-20","1 Corinthians 10:31","Galatians 5:22-23","James 1:22"],"core_question_ids":["P3.1","P3.2","P3.6"],"deep_dive_question_ids":["P3.3","P3.5"],"coach_clarification_question_ids":["P3.4"]},{"code":"P4","pillar":"SPIRIT","name":"Purpose, Calling & Christian Community","scripture_refs":["Ephesians 2:10","1 Peter 4:10","Hebrews 10:24-25","Colossians 3:23"],"core_question_ids":["P4.1","P4.2","P4.4"],"deep_dive_question_ids":["P4.3","P4.6"],"coach_clarification_question_ids":["P4.5"]}],"safety_gates":[{"id":"G1","question":"Has a qualified clinician told you to restrict exercise, fasting, weight loss, or major dietary changes?","if_yes":"Coach review before prescribing or progressing those behaviours.","action_code":"clinical_restriction"},{"id":"G2","question":"Do you currently have unexplained chest pain, fainting, severe shortness of breath, rapidly worsening symptoms, or another condition that may make exercise unsafe?","if_yes":"Pause exercise programming and obtain appropriate medical clearance.","action_code":"physical_safety_review"},{"id":"G3","question":"Are you pregnant, recently postpartum, recovering from surgery, or managing a medical condition that materially changes nutrition/training needs?","if_yes":"Individualize and involve appropriate clinical expertise where needed.","action_code":"special_context"},{"id":"G4","question":"Do you have a current or recent eating disorder, purging behaviour, severe restriction, or recurrent loss-of-control eating that needs specialist support?","if_yes":"Do not treat this as a discipline problem; coordinate/referral to appropriately qualified care.","action_code":"eating_disorder_scope"},{"id":"G5","question":"Are you currently in an acute mental-health crisis or do you need urgent mental-health support?","if_yes":"Stop the normal assessment path and direct the client to appropriate local urgent/crisis or professional support.","action_code":"mental_health_urgent"},{"id":"G6","question":"Are you taking prescription medication or receiving active treatment that may materially affect energy, appetite, sleep, body weight, training tolerance, mood, or test results?","if_yes":"Record for coach/clinical context; never advise medication changes.","action_code":"medication_treatment_context"}],"capacity_core":[{"id":"B1.1","domain_code":"B1","pillar":"BODY","statement":"Most of my meals are built mainly from minimally processed foods rather than packaged convenience foods.","evidence_ids":["E05","E06","E07","E11"],"evidence_note":"E05, E06, E07, E11","scripture_refs":["1 Corinthians 10:31","Ecclesiastes 10:17","Proverbs 25:16"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":1},{"id":"B1.6","domain_code":"B1","pillar":"BODY","statement":"My relationship with food is generally purposeful and peaceful rather than dominated by guilt, chaos, restriction, or loss of control.","evidence_ids":["E05","E06","E07","E11"],"evidence_note":"E05, E06, E07, E11","scripture_refs":["1 Corinthians 10:31","Ecclesiastes 10:17","Proverbs 25:16"],"question_role":"core","role_order":3,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":2},{"id":"B2.1","domain_code":"B2","pillar":"BODY","statement":"I usually protect enough time in bed to obtain at least about 7 hours of sleep, unless a qualified professional has advised otherwise for my situation.","evidence_ids":["E03","E04"],"evidence_note":"E03, E04","scripture_refs":["Mark 6:31","Psalm 127:2","Matthew 11:28-30"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":3},{"id":"B2.6","domain_code":"B2","pillar":"BODY","statement":"Daytime sleepiness or fatigue does not regularly impair my focus, safety, work, training, or relationships.","evidence_ids":["E03","E04"],"evidence_note":"E03, E04","scripture_refs":["Mark 6:31","Psalm 127:2","Matthew 11:28-30"],"question_role":"core","role_order":3,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":4},{"id":"B3.1","domain_code":"B3","pillar":"BODY","statement":"In a typical week I achieve at least about 150 minutes of moderate-intensity activity (or an equivalent amount of vigorous activity), when medically appropriate.","evidence_ids":["E01","E02","E08"],"evidence_note":"E01, E02, E08","scripture_refs":["1 Timothy 4:8","1 Corinthians 9:24-27","1 Corinthians 6:20"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":5},{"id":"B3.2","domain_code":"B3","pillar":"BODY","statement":"I perform muscle-strengthening exercise for the major muscle groups on at least two days in a typical week, when medically appropriate.","evidence_ids":["E01","E02","E08"],"evidence_note":"E01, E02, E08","scripture_refs":["1 Timothy 4:8","1 Corinthians 9:24-27","1 Corinthians 6:20"],"question_role":"core","role_order":2,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":6},{"id":"B4.1","domain_code":"B4","pillar":"BODY","statement":"I have enough physical energy for the responsibilities that matter most to me on most days.","evidence_ids":["E01","E03","E04","E08"],"evidence_note":"E01, E03, E04, E08","scripture_refs":["Mark 6:31","Psalm 103:14","1 Corinthians 6:19-20"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":7},{"id":"B4.5","domain_code":"B4","pillar":"BODY","statement":"Persistent pain, dizziness, breathlessness, unexplained fatigue, or other physical symptoms do not regularly prevent me from functioning.","evidence_ids":["E01","E03","E04","E08"],"evidence_note":"E01, E03, E04, E08","scripture_refs":["Mark 6:31","Psalm 103:14","1 Corinthians 6:19-20"],"question_role":"core","role_order":3,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":8},{"id":"S1.1","domain_code":"S1","pillar":"SOUL","statement":"When an unhelpful thought appears, I can notice it without automatically treating it as truth.","evidence_ids":["E09","E10","E18"],"evidence_note":"E09, E10, E18","scripture_refs":["Romans 12:2","Philippians 4:8","2 Corinthians 10:5"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":9},{"id":"S1.4","domain_code":"S1","pillar":"SOUL","statement":"I can take a wise next action even when motivation or emotion is not cooperating.","evidence_ids":["E09","E10","E18"],"evidence_note":"E09, E10, E18","scripture_refs":["Romans 12:2","Philippians 4:8","2 Corinthians 10:5"],"question_role":"core","role_order":2,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":10},{"id":"S2.1","domain_code":"S2","pillar":"SOUL","statement":"I can usually identify what I am feeling instead of only reacting to the feeling.","evidence_ids":["E08","E10","E18"],"evidence_note":"E08, E10, E18","scripture_refs":["Proverbs 4:23","Philippians 4:6-7","James 1:19-20","Proverbs 16:32"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":11},{"id":"S2.2","domain_code":"S2","pillar":"SOUL","statement":"When I am stressed, angry, anxious, disappointed, or lonely, I can pause before acting impulsively.","evidence_ids":["E08","E10","E18"],"evidence_note":"E08, E10, E18","scripture_refs":["Proverbs 4:23","Philippians 4:6-7","James 1:19-20","Proverbs 16:32"],"question_role":"core","role_order":2,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":12},{"id":"S3.2","domain_code":"S3","pillar":"SOUL","statement":"I make specific plans for when, where, and how I will carry out important habits.","evidence_ids":["E11","E12","E13","E14","E15"],"evidence_note":"E11, E12, E13, E14, E15","scripture_refs":["Galatians 5:22-23","James 1:22","1 Corinthians 9:24-27","Proverbs 25:28"],"question_role":"core","role_order":2,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":13},{"id":"S3.5","domain_code":"S3","pillar":"SOUL","statement":"When I miss a habit or have a bad day, I usually return at the next useful opportunity instead of waiting for Monday or a perfect restart.","evidence_ids":["E11","E12","E13","E14","E15"],"evidence_note":"E11, E12, E13, E14, E15","scripture_refs":["Galatians 5:22-23","James 1:22","1 Corinthians 9:24-27","Proverbs 25:28"],"question_role":"core","role_order":3,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":14},{"id":"S4.2","domain_code":"S4","pillar":"SOUL","statement":"The people closest to me generally support the healthy changes I am trying to make.","evidence_ids":["E16","E17","E23"],"evidence_note":"E16, E17, E23","scripture_refs":["Ecclesiastes 4:9-10","Proverbs 13:20","Hebrews 10:24-25","1 Corinthians 15:33"],"question_role":"core","role_order":2,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":15},{"id":"S4.3","domain_code":"S4","pillar":"SOUL","statement":"My home/work environment makes healthy choices reasonably accessible rather than constantly working against them.","evidence_ids":["E16","E17","E23"],"evidence_note":"E16, E17, E23","scripture_refs":["Ecclesiastes 4:9-10","Proverbs 13:20","Hebrews 10:24-25","1 Corinthians 15:33"],"question_role":"core","role_order":3,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":16},{"id":"P1.1","domain_code":"P1","pillar":"SPIRIT","statement":"I engage with Scripture consistently enough that Biblical truth is shaping my decisions, not merely inspiring me occasionally.","evidence_ids":["E21","E22"],"evidence_note":"E21, E22 (contextual only; Scripture is primary for this domain)","scripture_refs":["Psalm 119:105","2 Timothy 3:16-17","John 8:31-32","Romans 12:2"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":17},{"id":"P1.6","domain_code":"P1","pillar":"SPIRIT","statement":"What I learn from Scripture is increasingly expressed in concrete action rather than remaining information only.","evidence_ids":["E21","E22"],"evidence_note":"E21, E22 (contextual only; Scripture is primary for this domain)","scripture_refs":["Psalm 119:105","2 Timothy 3:16-17","John 8:31-32","Romans 12:2"],"question_role":"core","role_order":3,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":18},{"id":"P2.1","domain_code":"P2","pillar":"SPIRIT","statement":"Prayer is a regular part of my life rather than something I use only in crisis.","evidence_ids":["E21","E22"],"evidence_note":"E21, E22 (contextual only; Scripture is primary for this domain)","scripture_refs":["1 Thessalonians 5:17-18","Philippians 4:6-7","James 1:5","John 15:5"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":19},{"id":"P2.5","domain_code":"P2","pillar":"SPIRIT","statement":"My dependence on God leads me toward faithful action rather than passivity or avoidance of appropriate help.","evidence_ids":["E21","E22"],"evidence_note":"E21, E22 (contextual only; Scripture is primary for this domain)","scripture_refs":["1 Thessalonians 5:17-18","Philippians 4:6-7","James 1:5","John 15:5"],"question_role":"core","role_order":3,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":20},{"id":"P3.1","domain_code":"P3","pillar":"SPIRIT","statement":"I view caring for my body as stewardship of something entrusted to me, not as a way to earn God’s love or prove my worth.","evidence_ids":["E11","E18"],"evidence_note":"E11, E18 (behavioural context only; Scripture is primary for this domain)","scripture_refs":["1 Corinthians 6:19-20","1 Corinthians 10:31","Galatians 5:22-23","James 1:22"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":21},{"id":"P3.2","domain_code":"P3","pillar":"SPIRIT","statement":"My health decisions are increasingly governed by wisdom and self-control rather than impulse, fear, vanity, or obsession.","evidence_ids":["E11","E18"],"evidence_note":"E11, E18 (behavioural context only; Scripture is primary for this domain)","scripture_refs":["1 Corinthians 6:19-20","1 Corinthians 10:31","Galatians 5:22-23","James 1:22"],"question_role":"core","role_order":2,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":22},{"id":"P4.1","domain_code":"P4","pillar":"SPIRIT","statement":"I have a meaningful sense of the responsibilities, people, and work God has placed in front of me in this season.","evidence_ids":["E16","E19","E20","E21","E23"],"evidence_note":"E16, E19, E20, E21, E23 (health associations are contextual; Scripture defines the theological construct)","scripture_refs":["Ephesians 2:10","1 Peter 4:10","Hebrews 10:24-25","Colossians 3:23"],"question_role":"core","role_order":1,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":23},{"id":"P4.2","domain_code":"P4","pillar":"SPIRIT","statement":"My pursuit of health is connected to service, stewardship, and calling rather than being an end in itself.","evidence_ids":["E16","E19","E20","E21","E23"],"evidence_note":"E16, E19, E20, E21, E23 (health associations are contextual; Scripture defines the theological construct)","scripture_refs":["Ephesians 2:10","1 Peter 4:10","Hebrews 10:24-25","Colossians 3:23"],"question_role":"core","role_order":2,"include_in_core_score":true,"auto_client_visible":true,"coach_only":false,"core_order":24}],"coach_clarifiers":[{"id":"B1.3","domain_code":"B1","pillar":"BODY","statement":"My main meals have enough structure and nourishment that I am not routinely driven into impulsive eating by extreme hunger.","evidence_ids":["E05","E06","E07","E11"],"evidence_note":"E05, E06, E07, E11","scripture_refs":["1 Corinthians 10:31","Ecclesiastes 10:17","Proverbs 25:16"],"question_role":"coach_clarifier","role_order":2,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":1},{"id":"B2.2","domain_code":"B2","pillar":"BODY","statement":"My bedtime and wake time are reasonably consistent across most days of the week.","evidence_ids":["E03","E04"],"evidence_note":"E03, E04","scripture_refs":["Mark 6:31","Psalm 127:2","Matthew 11:28-30"],"question_role":"coach_clarifier","role_order":2,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":2},{"id":"B3.6","domain_code":"B3","pillar":"BODY","statement":"My current physical capacity supports ordinary work, family, ministry, and daily-life demands reasonably well.","evidence_ids":["E01","E02","E08"],"evidence_note":"E01, E02, E08","scripture_refs":["1 Timothy 4:8","1 Corinthians 9:24-27","1 Corinthians 6:20"],"question_role":"coach_clarifier","role_order":3,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":3},{"id":"B4.3","domain_code":"B4","pillar":"BODY","statement":"I generally recover between training sessions and demanding days.","evidence_ids":["E01","E03","E04","E08"],"evidence_note":"E01, E03, E04, E08","scripture_refs":["Mark 6:31","Psalm 103:14","1 Corinthians 6:19-20"],"question_role":"coach_clarifier","role_order":2,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":4},{"id":"S1.5","domain_code":"S1","pillar":"SOUL","statement":"I can step out of rumination or repetitive negative thinking enough to re-engage with the present task.","evidence_ids":["E09","E10","E18"],"evidence_note":"E09, E10, E18","scripture_refs":["Romans 12:2","Philippians 4:8","2 Corinthians 10:5"],"question_role":"coach_clarifier","role_order":3,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":5},{"id":"S2.3","domain_code":"S2","pillar":"SOUL","statement":"I have healthy ways to regulate stress that do not depend mainly on food, avoidance, scrolling, substances, or other numbing behaviours.","evidence_ids":["E08","E10","E18"],"evidence_note":"E08, E10, E18","scripture_refs":["Proverbs 4:23","Philippians 4:6-7","James 1:19-20","Proverbs 16:32"],"question_role":"coach_clarifier","role_order":1,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":6},{"id":"S3.6","domain_code":"S3","pillar":"SOUL","statement":"I follow through on important commitments even after the initial motivation has faded.","evidence_ids":["E11","E12","E13","E14","E15"],"evidence_note":"E11, E12, E13, E14, E15","scripture_refs":["Galatians 5:22-23","James 1:22","1 Corinthians 9:24-27","Proverbs 25:28"],"question_role":"coach_clarifier","role_order":1,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":7},{"id":"S4.1","domain_code":"S4","pillar":"SOUL","statement":"I have at least one person with whom I can speak honestly about my struggles and progress.","evidence_ids":["E16","E17","E23"],"evidence_note":"E16, E17, E23","scripture_refs":["Ecclesiastes 4:9-10","Proverbs 13:20","Hebrews 10:24-25","1 Corinthians 15:33"],"question_role":"coach_clarifier","role_order":1,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":8},{"id":"P1.3","domain_code":"P1","pillar":"SPIRIT","statement":"My identity is rooted more deeply in Christ than in my body, performance, productivity, health status, or other people’s approval.","evidence_ids":["E21","E22"],"evidence_note":"E21, E22 (contextual only; Scripture is primary for this domain)","scripture_refs":["Psalm 119:105","2 Timothy 3:16-17","John 8:31-32","Romans 12:2"],"question_role":"coach_clarifier","role_order":2,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":9},{"id":"P2.2","domain_code":"P2","pillar":"SPIRIT","statement":"I bring worry, health concerns, decisions, and burdens to God instead of carrying them entirely alone.","evidence_ids":["E21","E22"],"evidence_note":"E21, E22 (contextual only; Scripture is primary for this domain)","scripture_refs":["1 Thessalonians 5:17-18","Philippians 4:6-7","James 1:5","John 15:5"],"question_role":"coach_clarifier","role_order":2,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":10},{"id":"P3.6","domain_code":"P3","pillar":"SPIRIT","statement":"Health, food, training, appearance, and optimization occupy an appropriate place in my life rather than becoming idols.","evidence_ids":["E11","E18"],"evidence_note":"E11, E18 (behavioural context only; Scripture is primary for this domain)","scripture_refs":["1 Corinthians 6:19-20","1 Corinthians 10:31","Galatians 5:22-23","James 1:22"],"question_role":"coach_clarifier","role_order":3,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":11},{"id":"P4.4","domain_code":"P4","pillar":"SPIRIT","statement":"I participate meaningfully in Christian community rather than trying to live the Christian life in isolation.","evidence_ids":["E16","E19","E20","E21","E23"],"evidence_note":"E16, E19, E20, E21, E23 (health associations are contextual; Scripture defines the theological construct)","scripture_refs":["Ephesians 2:10","1 Peter 4:10","Hebrews 10:24-25","Colossians 3:23"],"question_role":"coach_clarifier","role_order":3,"include_in_core_score":false,"auto_client_visible":false,"coach_only":true,"clarifier_order":12}],"personal_transformation_intake":[{"id":"PR1","section":"profile","label":"Age in years","type":"integer","required":true},{"id":"PR2","section":"profile","label":"Sex at birth (used only for the resting-energy equation)","type":"single_select","required":true,"options":["male","female","intersex/other","prefer not to say"],"sensitive":true},{"id":"PR3","section":"profile","label":"Height (cm)","type":"decimal","required":true},{"id":"PR4","section":"profile","label":"Current body weight (kg)","type":"decimal","required":true},{"id":"PR5","section":"profile","label":"Waist circumference (cm)","type":"decimal","required":false,"help":"Optional progress/context measure; not used to diagnose disease."},{"id":"PR6","section":"profile","label":"Body-fat percentage and measurement method, if known","type":"text","required":false},{"id":"PR7","section":"profile","label":"Typical occupation/activity at work","type":"single_select","required":true,"options":["mostly seated","mix of seated and moving","mostly standing/walking","physically demanding"]},{"id":"PR8","section":"profile","label":"Average daily steps over the last 7-14 days, if known","type":"integer","required":false},{"id":"PR9","section":"profile","label":"Typical weekly schedule constraints","type":"text","required":true},{"id":"GL1","section":"goals","label":"Primary 12-week goal","type":"single_select","required":true,"options":["fat loss","weight maintenance/recomposition","strength/muscle gain","fitness/work capacity","energy","sleep/recovery","nutrition consistency","discipline/habits","mental/emotional resilience","spiritual alignment","combined/other"]},{"id":"GL2","section":"goals","label":"Up to two secondary goals","type":"multi_select","required":false,"options":["fat loss","weight maintenance/recomposition","strength/muscle gain","fitness/work capacity","energy","sleep/recovery","nutrition consistency","discipline/habits","mental/emotional resilience","spiritual alignment"]},{"id":"GL3","section":"goals","label":"If these 12 weeks were genuinely successful, what would be measurably different?","type":"long_text","required":true},{"id":"GL4","section":"goals","label":"Why does this matter for your responsibilities, family, service or calling?","type":"long_text","required":true},{"id":"GL5","section":"goals","label":"Goal body weight (kg), if weight change is a goal","type":"decimal","required":false,"show_if":"GL1 in [fat loss, weight maintenance/recomposition, strength/muscle gain] OR GL2 contains weight goal"},{"id":"GL6","section":"goals","label":"Preferred target date or time horizon","type":"text","required":false},{"id":"GL7","section":"goals","label":"How ready are you to make changes for the next 12 weeks?","type":"scale_0_10","required":false},{"id":"GL8","section":"goals","label":"What are your biggest non-negotiable constraints?","type":"multi_select","required":false,"options":["work hours","children/caregiving","travel","budget","food preferences","injury/pain","limited equipment","poor sleep","stress","social/family meals","other"]},{"id":"HI1","section":"history","label":"Body weight about 3 months ago (kg)","type":"decimal","required":false},{"id":"HI2","section":"history","label":"Body weight about 12 months ago (kg)","type":"decimal","required":false},{"id":"HI3","section":"history","label":"Highest adult body weight (kg), if relevant","type":"decimal","required":false},{"id":"HI4","section":"history","label":"Which approaches/programs have you used before?","type":"multi_select","required":false,"options":["calorie counting","macro tracking","keto/low carb","carnivore","vegetarian/vegan","intermittent fasting","meal replacements","personal trainer","online coaching","group fitness/CrossFit/F45","commercial weight-loss program","Christian health program","supplement-focused program","detox/reset","other"]},{"id":"HI5","section":"history","label":"What worked best in previous attempts?","type":"long_text","required":false,"show_if":"HI4 not empty"},{"id":"HI6","section":"history","label":"Why did previous attempts stop, fail, or become unsustainable?","type":"long_text","required":false,"show_if":"HI4 not empty"},{"id":"HI7","section":"history","label":"If you previously lost weight, what contributed most to regain?","type":"long_text","required":false,"show_if":"GL1 == fat loss OR HI4 not empty"},{"id":"HI8","section":"history","label":"How comfortable are you tracking calories/macros?","type":"single_select","required":true,"options":["never done it","can do it short-term","comfortable doing it","prefer not to track"]},{"id":"NU1","section":"nutrition","label":"Typical number of meals per day","type":"integer","required":true},{"id":"NU2","section":"nutrition","label":"Typical first meal time and last meal time","type":"text","required":true},{"id":"NU3","section":"nutrition","label":"Typical fruit + vegetable intake","type":"single_select","required":true,"options":["<2 portions/day","2-3 portions/day","4 portions/day","5+ portions/day","not sure"]},{"id":"NU4","section":"nutrition","label":"How often do you eat whole grains, legumes/beans, nuts/seeds or other fibre-rich plant foods?","type":"single_select","required":true,"options":["rarely","1-3 times/week","4-6 times/week","daily","multiple times/day"]},{"id":"NU5","section":"nutrition","label":"How many main meals usually contain a meaningful protein source?","type":"single_select","required":true,"options":["0","1","2","3","4+"]},{"id":"NU6","section":"nutrition","label":"Sugar-sweetened drinks or fruit juice","type":"single_select","required":true,"options":["never/rarely","1-3/week","4-6/week","1/day","2+/day"]},{"id":"NU7","section":"nutrition","label":"Sweets, desserts, salty snacks or highly processed snack foods","type":"single_select","required":true,"options":["<1/week","1-3/week","4-6/week","1/day","2+/day"]},{"id":"NU8","section":"nutrition","label":"Fast food/takeaway/ready meals","type":"single_select","required":true,"options":["<1/week","1/week","2-3/week","4-6/week","daily"]},{"id":"NU9","section":"nutrition","label":"Alcohol intake, if any","type":"text","required":false,"sensitive":true},{"id":"NU10","section":"nutrition","label":"Caffeine: amount and latest usual time","type":"text","required":false},{"id":"NU11","section":"nutrition","label":"Food preferences, allergies, intolerances, cultural/religious restrictions","type":"long_text","required":false,"sensitive":true},{"id":"NU12","section":"nutrition","label":"Who usually buys and prepares food, and how much time is realistically available for cooking?","type":"long_text","required":true},{"id":"NU13","section":"nutrition","label":"Food budget constraint","type":"single_select","required":false,"options":["tight","moderate","flexible","prefer not to say"]},{"id":"TR1","section":"training","label":"Current resistance/strength-training days per week","type":"integer","required":true},{"id":"TR2","section":"training","label":"Current moderate/vigorous cardio minutes per week","type":"integer","required":true},{"id":"TR3","section":"training","label":"Resistance-training experience","type":"single_select","required":true,"options":["none","<6 months","6-24 months","2-5 years","5+ years"]},{"id":"TR4","section":"training","label":"Average planned training days available each week","type":"integer","required":true},{"id":"TR5","section":"training","label":"Realistic maximum time per workout","type":"single_select","required":true,"options":["15-20 min","30 min","45 min","60 min","75+ min"]},{"id":"TR6","section":"training","label":"Available equipment","type":"multi_select","required":true,"options":["none/bodyweight","bands","dumbbells","barbell/rack","machines","full gym","cardio equipment","outdoor space","other"]},{"id":"TR7","section":"training","label":"Training styles you enjoy","type":"multi_select","required":false,"options":["walking","running","cycling","swimming","strength training","classes","HIIT","sports","hiking","home workouts","other"]},{"id":"TR8","section":"training","label":"Training styles you strongly dislike or will not do","type":"multi_select","required":false,"options":["running","cycling","swimming","strength training","classes","HIIT","sports","gym","home workouts","other"]},{"id":"TR9","section":"training","label":"Current injuries, pain, movement limitations, or exercises you were told to avoid","type":"long_text","required":false,"sensitive":true},{"id":"TR10","section":"training","label":"Describe your current training program, if any","type":"long_text","required":false},{"id":"SL1","section":"recovery","label":"Average actual sleep per night","type":"decimal","required":true},{"id":"SL2","section":"recovery","label":"Typical bedtime and wake time on workdays","type":"text","required":true},{"id":"SL3","section":"recovery","label":"Typical bedtime and wake time on free days","type":"text","required":false},{"id":"SL4","section":"recovery","label":"Do you work shifts or regularly work overnight?","type":"boolean","required":true},{"id":"SL5","section":"recovery","label":"Has anyone noticed loud snoring, choking/gasping, or pauses in breathing during sleep?","type":"single_select","required":true,"options":["no","yes","not sure"],"sensitive":true},{"id":"SL6","section":"recovery","label":"How restorative does your sleep feel?","type":"scale_0_10","required":true},{"id":"RC1","section":"recovery","label":"Do you currently use sauna/passive heat?","type":"single_select","required":false,"options":["never","occasionally","1-2x/week","3+x/week"]},{"id":"RC2","section":"recovery","label":"Do you currently use cold showers/plunges/cold-water immersion?","type":"single_select","required":false,"options":["never","occasionally","1-2x/week","3+x/week"]},{"id":"FA1","section":"fasting","label":"Are you interested in using a time-restricted eating/fasting strategy?","type":"single_select","required":true,"options":["no","maybe","yes"]},{"id":"FA2","section":"fasting","label":"What fasting approaches have you used before?","type":"multi_select","required":false,"options":["12-hour overnight","14:10","16:8","18:6","one meal a day","24-hour fast","alternate-day fasting","multi-day fasting","Biblical/spiritual fast","other"],"show_if":"FA1 != no"},{"id":"FA3","section":"fasting","label":"What happened when you fasted?","type":"multi_select","required":false,"options":["felt good","easier appetite control","more energy","low energy","headaches/dizziness","poor training","poor sleep","overeating afterwards","felt out of control around food","not sustainable","other"],"show_if":"FA2 not empty"},{"id":"FA4","section":"fasting","label":"Primary reason for fasting","type":"multi_select","required":false,"options":["spiritual practice","meal structure/convenience","weight management","appetite control","metabolic-health interest","discipline","other"],"show_if":"FA1 != no"},{"id":"EN1","section":"environment","label":"Who lives with you, and who else is affected by your food/training routine?","type":"long_text","required":true},{"id":"EN2","section":"environment","label":"How supportive are the people closest to you of these changes?","type":"scale_0_10","required":true},{"id":"EN3","section":"environment","label":"How often do work, church, family or social events determine what/when you eat?","type":"single_select","required":true,"options":["rarely","1-2x/week","3-4x/week","5+x/week"]},{"id":"EN4","section":"environment","label":"How often do you travel or sleep away from home?","type":"single_select","required":true,"options":["rarely","monthly","2-3x/month","weekly","multiple times/week"]},{"id":"EN5","section":"environment","label":"What time windows are realistically available for training, meal preparation, prayer/Scripture and recovery?","type":"long_text","required":true},{"id":"EN6","section":"environment","label":"Who can provide practical accountability during these 12 weeks?","type":"text","required":false},{"id":"EN7","section":"environment","label":"What usually causes your routine to collapse?","type":"multi_select","required":true,"options":["stress","poor sleep","workload","weekends","travel","social meals","emotions","lack of planning","pain/illness","family demands","loss of motivation","other"]},{"id":"SS1","section":"soul_spirit","label":"What mental/emotional pattern most often disrupts healthy action?","type":"multi_select","required":false,"options":["stress eating","all-or-nothing thinking","rumination","anxiety/worry","low motivation","perfectionism","shame/guilt","avoidance","impulsivity","overcommitment","other"]},{"id":"SS2","section":"soul_spirit","label":"What spiritual rhythm would you most like to strengthen?","type":"multi_select","required":false,"options":["Scripture","prayer","gratitude","Sabbath/rest","Christian community","service","stewardship/self-control","purpose/calling","other"]}],"scoring":{"domain_score":"mean(two 0-4 core responses in domain) * 25","pillar_score":"mean(four domain scores in pillar)","kci_score":"mean(Body, Soul, Spirit pillar scores)","official_scores_use_core_only":true,"intake_fields_never_change_capacity_scores":true,"clarifiers_never_change_capacity_scores":true,"rounding":"store 2 decimals; display nearest whole number","disclaimer":"Directional coaching index; not a validated diagnostic or psychometric instrument."},"personalization_engine":{"name":"GodHealth Personal Plan Engine v1","outputs_require_coach_approval":true,"no_medical_diagnosis":true,"energy":{"name":"GodHealth Personalized Calorie Index (PCI)","display_components":["estimated_REE_kcal","estimated_TDEE_range_kcal","goal_calorie_range_kcal","confidence","calibration_status"],"ree_formula":{"male":"10*weight_kg + 6.25*height_cm - 5*age + 5","female":"10*weight_kg + 6.25*height_cm - 5*age - 161","source":"Mifflin-St Jeor (PE04)","unsupported_sex_input":"Do not auto-calculate; require coach/manual measured-RMR pathway."},"initial_activity_factor":{"method":"Codex proposes PAL class from occupation + steps + training; coach approves.","classes":{"sedentary":1.4,"light":1.5,"moderate":1.6,"active":1.75,"very_active":1.9},"source_note":"NIDDK Body Weight Planner reports typical PAL roughly 1.4-2.5; these narrower implementation classes are a GodHealth coaching heuristic and must be labelled estimated."},"tdee":"REE * approved_activity_factor","tdee_uncertainty":"display initial estimate as midpoint ±10%; never call exact metabolism","goal_rules":{"maintenance/recomposition":"TDEE midpoint ±5%","fat_loss":"start 10-20% below TDEE midpoint; choose smallest deficit likely to progress; coach approval required","strength/muscle_gain":"start 5-10% above TDEE midpoint when gain is desired; coach approval required","non_weight_goal":"default near maintenance unless coach chooses otherwise"},"auto_block":["age < 18","any safety gate requiring clinical review","pregnancy/postpartum/breastfeeding","current/recent eating-disorder risk","BMI < 18.5","unexplained unintentional weight loss","target < 1200 kcal/day","planned deficit > 25%","client uses medication/condition materially affecting appetite, glucose, weight or hydration without clinician clearance"],"calibration":{"when":"after at least 14 days with >=8 morning weights and usable adherence data","method":"compare 7-day rolling weight averages, reported intake/adherence, hunger, energy, sleep and training performance","rule":"do not recalculate from one weigh-in. If progress is clearly off-target for 2 weeks and adherence >=80%, coach may adjust by 100-150 kcal/day and reassess. If loss is rapid, symptoms worsen, or performance/recovery deteriorates, raise intake and/or route for clinical review.","label":"GodHealth coaching calibration rule, not a diagnostic equation."}},"nutrition":{"who_targets":{"fruit_veg":"aim >=400 g/day (roughly 5 portions) for adults","fibre":"aim >=25 g/day naturally occurring dietary fibre","free_sugars":"<10% energy; lower may provide additional benefit","saturated_fat":"<10% energy","trans_fat":"<1% energy; industrial trans fat avoided","salt":"<5 g/day (~2 g sodium)","carbohydrates":"for most people, mainly unrefined sources; WHO describes ~45-75% energy as a broad population range","fat":"WHO describes minimum ~15% and generally <=30% energy for adults, with emphasis on unsaturated fats","principles":["adequacy","balance","moderation","diversity"]},"protein":{"healthy_adult_reference":"0.83 g/kg/day PRI (EFSA/WHO reference)","active_or_resistance_training":"1.4-2.0 g/kg/day is an evidence-supported range for healthy exercising adults","default_active_target":"1.6 g/kg/day when appropriate, then adjust to goal/preferences/tolerance","obesity_or_special_conditions":"do not blindly use actual weight; require coach/dietitian-approved protein reference weight and medical context","renal_or_other_relevant_condition":"no auto target; clinical review"},"meal_structure":"derive from hunger pattern, schedule, culture, fasting preference and sustainability; do not force a universal number of meals","food_plan_output":["daily calorie range if appropriate","protein grams/range","fruit/veg target","fibre target","meal timing/structure","10 go-to meals","shopping/prep actions","WHO gap priorities","foods/preferences to respect"]},"hydration":{"baseline_total_water":{"female":"2.0 L/day total water","male":"2.5 L/day total water","source":"EFSA PE08","note":"includes water from both food and beverages; do not present as a mandatory plain-water prescription"},"exercise_module":"If client trains long/hard or in heat, offer optional sweat-rate assessment. Sweat rate L/h = (pre_kg - post_kg + fluid_L - urine_L)/hours. Use measured losses to individualize; avoid overdrinking/body-mass gain during exercise.","clinical_cautions":"kidney/heart disease, hyponatremia history, diuretics, pregnancy, heat illness or other relevant conditions require professional review."},"sleep_recovery":{"adult_18_64":"target opportunity generally 7-9 h/night","older_65_plus":"generally 7-8 h/night","personalization":["actual sleep","schedule consistency","shift work","daytime impairment","training load","stress"],"sleep_apnea_flag":"loud snoring/gasping/witnessed pauses + daytime sleepiness -> advise medical assessment; do not solve only with sleep-hygiene content."},"training":{"health_floor":"build toward WHO 150-300 min moderate or 75-150 min vigorous weekly + major-muscle strengthening >=2 days/week","strength_program_rules":{"novice_general":"2 full-body sessions/week initially; simple exercises; 1-3 work sets/exercise; progress gradually","intermediate_strength_or_recomp":"typically 3 sessions/week when recovery/schedule support it","advanced_or_hypertrophy":"3-4+ sessions may be used; volume individualized; ACSM 2026 notes ~10 weekly sets/muscle group as a useful hypertrophy target","strength_emphasis":"heavier loading can be used for strength goals when technically competent; ACSM highlights >=80% 1RM and 2-3 sets/exercise as a strength-oriented approach","failure":"not required for general progress","same_muscle_consecutive_hard_days":"avoid by default for novice/general clients unless coach programs otherwise"},"plan_inputs":["training age","goal","available days","session duration","equipment","injury limits","preference","current steps/cardio","sleep/recovery","capacity scores"],"rest":"schedule at least 1-2 low-load/recovery days weekly for most clients; adjust training load downward when sleep/recovery/stress is poor rather than forcing a fixed volume."},"fasting":{"status":"optional tool, never a GodHealth requirement and never a Capacity-score item","evidence":"2025 BMJ network meta-analysis shows IF can work, but overall advantages versus continuous energy restriction are modest","auto_rules":"Do not auto-prescribe >16-hour fasts or multi-day fasting. If client prefers and is eligible, coach may use a simple overnight/time-restricted structure mainly for adherence/convenience.","block_if":["eating-disorder risk","pregnant/postpartum/breastfeeding","underweight","relevant diabetes/glucose-lowering medication","medication requiring food","history of fainting with fasting","clinician restriction","other safety gate"]},"sauna_cold":{"status":"capture use/preferences only; never foundational Big 3 while basic sleep/nutrition/activity needs are unmet","sauna":"Evidence is mixed; no automatic dose/prescription. Coach may discuss existing tolerated use after safety review.","cold":"Evidence remains limited; no automatic dose/prescription. Never use as substitute for sleep, nutrition, training or stress-management foundations."},"priority_algorithm":{"order":["safety/clinical restrictions","primary goal relevance","largest actionable Body/Soul/Spirit gaps","objective behavior gaps vs evidence-based baselines","feasibility/environment","client preference/adherence history","optional optimization tools last"],"big3":"Generate 3 candidate priorities with rationale and exact weekly actions; coach must approve/edit before client sees them."},"plan_phases":[{"weeks":"0-1","phase":"REVEAL / RESET","purpose":"baseline, remove friction, establish meal/sleep/movement/spiritual anchors"},{"weeks":"2-4","phase":"RESTORE","purpose":"nutrition quality, sleep/recovery, training foundation, emotional-regulation tools"},{"weeks":"5-8","phase":"REBUILD","purpose":"progress training, goal-specific energy strategy, habits and resilience"},{"weeks":"9-10","phase":"REBUILD+","purpose":"increase capacity while maintaining sustainability and calling alignment"},{"weeks":"11-12","phase":"REINFORCE","purpose":"independence, comeback protocol, maintenance, reassessment and next-90-day plan"}],"weekly_plan_required_fields":["calorie_target_range_if_applicable","protein_target","food_quality_targets","meal_structure","hydration_target/benchmark","strength_sessions","cardio_or_movement_target","recovery_days","sleep_target","soul_action","spirit_action","Big_3","fallback_bad_week_version"],"weekly_checkin":["7-day average weight if relevant","calorie/protein adherence if tracking","fruit/veg/fibre adherence","strength sessions","cardio/minutes or steps","sleep hours/quality","energy","hunger","stress","emotional-regulation","spiritual rhythm","Big 3 completion","pain/symptoms","client comments"],"publication_rule":"No personalized plan is visible to client until coach approves. Safety flags can suppress some or all automated recommendations."},"data_model":{"assessment_definitions":["id","version","status","config_hash","created_at"],"safety_submissions":["id","user_id","assessment_version","answers_json","review_status","created_at"],"personal_intakes":["id","user_id","version","answers_json","completion_status","created_at","updated_at"],"capacity_submissions":["id","user_id","assessment_version","status","submitted_at"],"capacity_responses":["submission_id","question_id","response_value"],"capacity_scores":["submission_id","domain_scores_json","pillar_scores_json","kci_score"],"energy_profiles":["id","user_id","plan_version","ree","pal","tdee_mid","tdee_low","tdee_high","goal_low","goal_high","confidence","calibration_status","coach_approved_at"],"plan_engine_runs":["id","user_id","input_version_hash","engine_version","draft_json","blocked_reasons_json","created_at"],"coach_plan_reviews":["id","plan_engine_run_id","coach_user_id","status","edits_json","approved_at"],"plans":["id","user_id","version","status","primary_goal","start_date","end_date","approved_by","approved_at"],"plan_weeks":["id","plan_id","week_number","phase","targets_json","big3_json","fallback_json"],"weekly_checkins":["id","user_id","plan_id","week_number","answers_json","submitted_at"],"measurements":["id","user_id","date","weight_kg","waist_cm","steps","sleep_hours","other_json"],"audit_events":["id","actor_user_id","target_user_id","event_type","entity_type","entity_id","timestamp","metadata_json"]},"plan_output_schema":{"identity":["plan_id","user_id","engine_version","assessment_version","coach_approval_status"],"summary":["primary_goal","secondary_goals","calling_why","constraints","safety_status","capacity_gaps"],"energy_profile":["ree_estimate","pal_approved","tdee_range","goal_calorie_range","confidence","calibration_status"],"nutrition":["protein_target","fruit_veg_target","fibre_target","who_gap_priorities","meal_structure","personal_10_meals","prep_shopping_actions","travel_eating_fallback"],"training":["sessions_per_week","session_days","session_duration","exercise_template","sets_reps_effort","cardio_or_movement","recovery_days","progression_rule","injury_constraints"],"recovery":["sleep_target","bed_wake_actions","hydration_benchmark","sweat_rate_plan_if_applicable","stress_recovery_action"],"soul_spirit":["mental_emotional_action","habit_environment_action","scripture_prayer_action","calling_alignment_action"],"optional_strategies":["fasting_if_eligible_and_preferred","sauna_existing_use_note","cold_existing_use_note"],"big3":["priority_1","priority_2","priority_3"],"weeks":"array[12] of week-specific targets + Bad-Week fallback","publication":"must remain hidden from client until coach_approval_status == approved"},"state_machine":["draft_intake","submitted","safety_review_required","draft_plan_generated","coach_review","approved","active","completed"],"privacy":{"gdpr":"Treat assessment responses, health information and religious/spiritual responses as sensitive/special-category data. Apply data minimisation, explicit purpose/consent where required, access controls, encryption, retention/deletion controls, audit logs, export/correction workflows, and avoid unnecessary DOB collection when age is sufficient.","public_routes":"No premium intake, questions, answers, scores or plans accessible unauthenticated or indexed."},"scripture_translation":"KJV","evidence_references":["PE01","PE02","PE03","PE04","PE05","PE06","PE07","PE08","PE09","PE10","PE11","PE12","PE13","PE14","PE15","PE16","PE17"]}$kca_v3_definition$::jsonb, '2.0.0', 'V3 personalization architecture with 24 core questions and coach-approved plan workflow')
on conflict (definition_version) do nothing;

create or replace function public.kca_v3_get_definition()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_definition jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') and not public.kca_is_coach() then
    raise exception 'premium_entitlement_required';
  end if;
  select definition into v_definition from public.kca_assessment_definitions where definition_version = '3.0.0' and retired_at is null;
  if v_definition is null then raise exception 'definition_not_found'; end if;
  return v_definition;
end;
$$;

grant execute on function public.kca_v3_get_definition() to authenticated;

create or replace function public.kca_v3_save_draft(p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.kca_personal_intakes;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then raise exception 'premium_entitlement_required'; end if;

  update public.kca_personal_intakes
  set consent = coalesce(p_draft->'consent','{}'::jsonb),
      safety_answers = coalesce(p_draft->'safety_answers','{}'::jsonb),
      intake = coalesce(p_draft->'intake','{}'::jsonb),
      draft_step = nullif(p_draft->>'draft_step',''),
      updated_at = now()
  where user_id = v_user_id and assessment_version = '3.0.0' and completion_status = 'draft' and run_id is null
  returning * into v_row;

  if v_row.id is null then
    insert into public.kca_personal_intakes (user_id, assessment_version, completion_status, consent, safety_answers, intake, draft_step)
    values (v_user_id, '3.0.0', 'draft', coalesce(p_draft->'consent','{}'::jsonb), coalesce(p_draft->'safety_answers','{}'::jsonb), coalesce(p_draft->'intake','{}'::jsonb), nullif(p_draft->>'draft_step',''))
    returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'draft_id', v_row.id, 'updated_at', v_row.updated_at);
end;
$$;

grant execute on function public.kca_v3_save_draft(jsonb) to authenticated;

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
  select coalesce(jsonb_agg(to_jsonb(w) order by w.week_number), '[]'::jsonb) into v_weeks
  from public.kca_plan_weeks w join public.kca_plans p on p.id = w.plan_id where p.run_id = v_run.id;

  return jsonb_build_object('ok', true, 'run', to_jsonb(v_run), 'approved_plan', v_plan, 'approved_weeks', v_weeks, 'engine_run', (select to_jsonb(e) from public.kca_plan_engine_runs e where e.run_id = v_run.id limit 1));
end;
$$;

grant execute on function public.kca_v3_my_latest() to authenticated;

create or replace function public.kca_v3_submit_assessment(p_intake jsonb, p_safety_answers jsonb, p_responses jsonb, p_consent jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_definition jsonb;
  v_score jsonb;
  v_safety jsonb;
  v_plan jsonb;
  v_run_id uuid;
  v_engine_run_id uuid;
  v_question jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.kca_has_active_entitlement(v_user_id, '3.0.0') then raise exception 'premium_entitlement_required'; end if;

  select definition into v_definition from public.kca_assessment_definitions where definition_version = '3.0.0' and retired_at is null;
  if v_definition is null then raise exception 'definition_not_found'; end if;

  v_score := public.kca_v3_score_snapshot(v_definition, p_responses);
  v_safety := public.kca_v3_route_safety(v_definition, coalesce(p_safety_answers,'{}'::jsonb));
  v_plan := public.kca_v3_build_plan_draft(v_score, coalesce(p_intake,'{}'::jsonb), v_safety);

  insert into public.kca_assessment_runs (user_id, definition_version, assessment_type, status, context, safety_flags, adaptive_assignment, score_snapshot, big3_candidates, submitted_at)
  values (
    v_user_id, '3.0.0', 'baseline',
    case when coalesce((v_safety->>'stop_normal_recommendation_flow')::boolean,false) then 'safety_paused' else 'submitted' end,
    jsonb_build_object('client_name', p_intake->>'client_name', 'primary_goal', p_intake->>'GL1', 'v3_intake_collected', true),
    v_safety,
    '{"v3_no_automatic_deep_dive":true}'::jsonb,
    v_score,
    jsonb_build_object('client_visible', false, 'coach_approval_required', true, 'priorities', v_plan->'big3'),
    now()
  ) returning id into v_run_id;

  for v_question in select value from jsonb_array_elements(v_definition->'capacity_core') loop
    insert into public.kca_responses (run_id, user_id, question_id, question_role, answer_value, answer_text)
    values (v_run_id, v_user_id, v_question->>'id', 'core', (p_responses->>(v_question->>'id'))::integer, v_question->>'statement');
  end loop;

  for v_question in select value from jsonb_array_elements(v_definition->'safety_gates') loop
    insert into public.kca_responses (run_id, user_id, question_id, question_role, answer_value, answer_text)
    values (v_run_id, v_user_id, v_question->>'id', 'safety_gate', null, coalesce(p_safety_answers->>(v_question->>'id'), 'no') || ' — ' || (v_question->>'question'));
  end loop;

  insert into public.kca_personal_intakes (user_id, run_id, assessment_version, completion_status, consent, safety_answers, intake)
  values (v_user_id, v_run_id, '3.0.0', 'submitted', coalesce(p_consent,'{}'::jsonb), coalesce(p_safety_answers,'{}'::jsonb), coalesce(p_intake,'{}'::jsonb));

  update public.kca_personal_intakes
  set completion_status = 'archived', updated_at = now()
  where user_id = v_user_id and assessment_version='3.0.0' and completion_status='draft' and run_id is null;

  insert into public.kca_energy_profiles (run_id, user_id, assessment_version, profile)
  values (v_run_id, v_user_id, '3.0.0', v_plan->'energy_profile');

  insert into public.kca_plan_engine_runs (run_id, user_id, assessment_version, input_snapshot, plan_draft)
  values (v_run_id, v_user_id, '3.0.0', jsonb_build_object('score_snapshot', v_score, 'safety', v_safety, 'intake', p_intake), v_plan)
  returning id into v_engine_run_id;

  insert into public.kca_audit_events (run_id, user_id, event_type, metadata)
  values (v_run_id, v_user_id, 'kca_v3_assessment_submitted', jsonb_build_object('definition_version','3.0.0','response_count',24,'engine_run_id',v_engine_run_id));

  return jsonb_build_object('ok', true, 'run_id', v_run_id, 'engine_run_id', v_engine_run_id, 'score_snapshot', v_score, 'safety_flags', v_safety, 'status', case when coalesce((v_safety->>'stop_normal_recommendation_flow')::boolean,false) then 'safety_paused' else 'submitted' end);
end;
$$;

grant execute on function public.kca_v3_submit_assessment(jsonb, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.kca_v3_approve_plan(p_engine_run_id uuid, p_plan jsonb, p_coach_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_engine public.kca_plan_engine_runs;
  v_plan_row public.kca_plans;
  v_week jsonb;
  v_index integer := 0;
begin
  if not public.kca_is_coach() then raise exception 'not_authorized'; end if;
  select * into v_engine from public.kca_plan_engine_runs where id = p_engine_run_id;
  if v_engine.id is null then raise exception 'engine_run_not_found'; end if;
  if not public.kca_can_access_client(v_engine.user_id) then raise exception 'not_authorized_for_client'; end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    p_plan := v_engine.plan_draft;
  end if;

  insert into public.kca_coach_plan_reviews (engine_run_id, run_id, coach_user_id, review_status, coach_notes, approved_plan)
  values (v_engine.id, v_engine.run_id, auth.uid(), 'approved', coalesce(nullif(trim(p_coach_notes),''),'Coach reviewed and approved the GodHealth V3 roadmap.'), p_plan)
  on conflict (engine_run_id) do update set coach_user_id=excluded.coach_user_id, review_status='approved', coach_notes=excluded.coach_notes, approved_plan=excluded.approved_plan, updated_at=now();

  insert into public.kca_plans (run_id, user_id, coach_user_id, engine_run_id, assessment_version, status, plan)
  values (v_engine.run_id, v_engine.user_id, auth.uid(), v_engine.id, '3.0.0', 'active', jsonb_set(p_plan, '{coach_approval_status}', '"approved"'::jsonb, true))
  on conflict (run_id) do update set coach_user_id=excluded.coach_user_id, plan=excluded.plan, status='active', approved_at=now(), updated_at=now()
  returning * into v_plan_row;

  delete from public.kca_plan_weeks where plan_id = v_plan_row.id;
  for v_week in select value from jsonb_array_elements(coalesce(p_plan->'weeks','[]'::jsonb)) loop
    v_index := v_index + 1;
    insert into public.kca_plan_weeks (plan_id, user_id, week_number, week)
    values (v_plan_row.id, v_engine.user_id, v_index, v_week);
  end loop;

  insert into public.kca_big3_publications (run_id, coach_user_id, approved_big3, coach_reason, published_to_client)
  values (v_engine.run_id, auth.uid(), coalesce(p_plan->'big3','[]'::jsonb), coalesce(nullif(trim(p_coach_notes),''),'Coach approved the V3 Big 3 roadmap.'), true)
  on conflict (run_id) do update set coach_user_id=excluded.coach_user_id, approved_big3=excluded.approved_big3, coach_reason=excluded.coach_reason, published_to_client=true, created_at=now();

  update public.kca_plan_engine_runs set status='approved', updated_at=now() where id=v_engine.id;
  update public.kca_assessment_runs set status='published' where id=v_engine.run_id;
  update public.kca_energy_profiles set coach_approved_at=now(), updated_at=now() where run_id=v_engine.run_id;

  insert into public.kca_audit_events (run_id, user_id, event_type, metadata)
  values (v_engine.run_id, auth.uid(), 'kca_v3_plan_approved', jsonb_build_object('engine_run_id', v_engine.id));

  return jsonb_build_object('ok', true, 'plan_id', v_plan_row.id, 'run_id', v_engine.run_id);
end;
$$;

grant execute on function public.kca_v3_approve_plan(uuid, jsonb, text) to authenticated;

create or replace function public.kca_coach_dashboard_runs()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.kca_is_coach() then raise exception 'not_authorized'; end if;

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
    where public.kca_can_access_client(run.user_id)
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
  if not public.kca_is_coach() then raise exception 'not_authorized'; end if;
  select * into v_run from public.kca_assessment_runs where id = p_run_id;
  if v_run.id is null then raise exception 'run_not_found'; end if;
  if not public.kca_can_access_client(v_run.user_id) then raise exception 'not_authorized_for_client'; end if;

  select jsonb_build_object(
    'run', to_jsonb(run),
    'client', jsonb_build_object('user_id', run.user_id, 'email', auth_user.email, 'name', coalesce(intake.intake->>'client_name', run.context->>'client_name', auth_user.raw_user_meta_data->>'full_name')),
    'definition', def.definition,
    'intake', to_jsonb(intake),
    'energy_profile', (select to_jsonb(e) from public.kca_energy_profiles e where e.run_id = run.id limit 1),
    'engine_run', (select to_jsonb(e) from public.kca_plan_engine_runs e where e.run_id = run.id limit 1),
    'review', (select to_jsonb(r) from public.kca_coach_plan_reviews r where r.run_id = run.id limit 1),
    'approved_plan', (select to_jsonb(p) from public.kca_plans p where p.run_id = run.id limit 1),
    'plan_weeks', coalesce((select jsonb_agg(to_jsonb(w) order by w.week_number) from public.kca_plan_weeks w join public.kca_plans p on p.id=w.plan_id where p.run_id=run.id), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', response.question_id,
        'question_role', response.question_role,
        'answer_value', response.answer_value,
        'answer_text', response.answer_text,
        'display_answer', case when response.question_role='core' then response.answer_value::text else split_part(coalesce(response.answer_text,''),' — ',1) end,
        'question_text', case when response.question_role='core' then response.answer_text else substr(coalesce(response.answer_text,''), strpos(coalesce(response.answer_text,''),' — ')+3) end,
        'created_at', response.created_at
      ) order by response.created_at)
      from public.kca_responses response
      where response.run_id = run.id
    ), '[]'::jsonb),
    'publication', (select to_jsonb(publication) from public.kca_big3_publications publication where publication.run_id = run.id limit 1),
    'coach_clarifiers', coalesce(def.definition->'coach_clarifiers','[]'::jsonb)
  ) into v_detail
  from public.kca_assessment_runs run
  join auth.users auth_user on auth_user.id = run.user_id
  left join public.kca_personal_intakes intake on intake.run_id = run.id
  left join public.kca_assessment_definitions def on def.definition_version = run.definition_version
  where run.id = p_run_id;

  return v_detail;
end;
$$;

grant execute on function public.kca_coach_dashboard_run_detail(uuid) to authenticated;

-- Tighten definition visibility: V3 is available only through entitlement/coach access.
drop policy if exists "KCA definitions are readable to authenticated users" on public.kca_assessment_definitions;
create policy "KCA definitions protected by version"
on public.kca_assessment_definitions
for select
to authenticated
using (
  definition_version <> '3.0.0'
  or public.kca_has_active_entitlement(auth.uid(), definition_version)
  or public.kca_is_coach()
);

-- Refresh run/response policies to include owner and V3 coach scoping.
drop policy if exists "Users and assigned coaches can read KCA runs" on public.kca_assessment_runs;
create policy "Users and authorized coaches can read KCA runs"
on public.kca_assessment_runs
for select
to authenticated
using (public.kca_can_access_client(user_id));

drop policy if exists "Users and assigned coaches can read KCA responses" on public.kca_responses;
create policy "Users and authorized coaches can read KCA responses"
on public.kca_responses
for select
to authenticated
using (public.kca_can_access_client(user_id));

drop policy if exists "Users and assigned coaches can read Big 3 publications" on public.kca_big3_publications;
create policy "Users and authorized coaches can read Big 3 publications"
on public.kca_big3_publications
for select
to authenticated
using (
  exists (select 1 from public.kca_assessment_runs r where r.id = kca_big3_publications.run_id and public.kca_can_access_client(r.user_id))
);

alter table public.kca_client_entitlements enable row level security;
alter table public.kca_personal_intakes enable row level security;
alter table public.kca_energy_profiles enable row level security;
alter table public.kca_plan_engine_runs enable row level security;
alter table public.kca_coach_plan_reviews enable row level security;
alter table public.kca_plans enable row level security;
alter table public.kca_plan_weeks enable row level security;
alter table public.kca_weekly_checkins enable row level security;
alter table public.kca_measurements enable row level security;

create policy "Users and authorized coaches can read entitlements" on public.kca_client_entitlements for select to authenticated using (public.kca_can_access_client(user_id));
create policy "Users and authorized coaches can read personal intakes" on public.kca_personal_intakes for select to authenticated using (public.kca_can_access_client(user_id));
create policy "Users can insert own personal intakes via RPC" on public.kca_personal_intakes for insert to authenticated with check (user_id = auth.uid());
create policy "Users can update own draft personal intakes" on public.kca_personal_intakes for update to authenticated using (user_id = auth.uid() and completion_status='draft') with check (user_id = auth.uid());
create policy "Users and authorized coaches can read energy profiles" on public.kca_energy_profiles for select to authenticated using (public.kca_can_access_client(user_id));
create policy "Users and authorized coaches can read engine runs" on public.kca_plan_engine_runs for select to authenticated using (public.kca_can_access_client(user_id));
create policy "Authorized coaches can read reviews" on public.kca_coach_plan_reviews for select to authenticated using (public.kca_is_coach());
create policy "Users and authorized coaches can read plans" on public.kca_plans for select to authenticated using (public.kca_can_access_client(user_id));
create policy "Users and authorized coaches can read plan weeks" on public.kca_plan_weeks for select to authenticated using (public.kca_can_access_client(user_id));
create policy "Users can insert own checkins" on public.kca_weekly_checkins for insert to authenticated with check (user_id = auth.uid());
create policy "Users and authorized coaches can read checkins" on public.kca_weekly_checkins for select to authenticated using (public.kca_can_access_client(user_id));
create policy "Users can insert own measurements" on public.kca_measurements for insert to authenticated with check (user_id = auth.uid());
create policy "Users and authorized coaches can read measurements" on public.kca_measurements for select to authenticated using (public.kca_can_access_client(user_id));
