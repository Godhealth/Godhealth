create or replace function public.kca_v3_safe_numeric(p_value text, p_default numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  v_text text := lower(trim(coalesce(p_value, '')));
begin
  if v_text = '' then
    return p_default;
  end if;

  if v_text ~ '^-?[0-9]+(\.[0-9]+)?$' then
    return v_text::numeric;
  end if;

  if v_text like '%poor%' or v_text like '%low%' or v_text like '%not%' then
    return 2;
  end if;

  if v_text like '%very%' or v_text like '%excellent%' or v_text like '%high%' then
    return 10;
  end if;

  if v_text like '%good%' or v_text like '%restorative%' or v_text like '%supportive%' then
    return 8;
  end if;

  if v_text like '%moderate%' or v_text like '%average%' or v_text like '%some%' then
    return 5;
  end if;

  return p_default;
end;
$$;

grant execute on function public.kca_v3_safe_numeric(text, numeric) to authenticated;

create or replace function public.kca_v3_build_plan_draft(p_score jsonb, p_intake jsonb, p_safety jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_age numeric := public.kca_v3_safe_numeric(p_intake->>'PR1', null);
  v_sex text := lower(coalesce(p_intake->>'PR2',''));
  v_height numeric := public.kca_v3_safe_numeric(p_intake->>'PR3', null);
  v_weight numeric := public.kca_v3_safe_numeric(p_intake->>'PR4', null);
  v_goal text := coalesce(p_intake->>'GL1','combined/other');
  v_ree numeric;
  v_pal numeric := 1.4;
  v_pal_label text := 'sedentary';
  v_steps numeric := public.kca_v3_safe_numeric(p_intake->>'PR8', 0);
  v_strength numeric := public.kca_v3_safe_numeric(p_intake->>'TR1', 0);
  v_cardio numeric := public.kca_v3_safe_numeric(p_intake->>'TR2', 0);
  v_available_training_days integer := public.kca_v3_safe_numeric(p_intake->>'TR4', 2)::integer;
  v_tdee numeric;
  v_hard_blocks jsonb := '[]'::jsonb;
  v_goal_range jsonb := null;
  v_bmi numeric;
  v_big3 jsonb := '[]'::jsonb;
  v_domain record;
  v_weeks jsonb := '[]'::jsonb;
  v_week integer;
  v_training_sessions integer := 2;
  v_sleep numeric := public.kca_v3_safe_numeric(p_intake->>'SL1', 7);
  v_recovery numeric := public.kca_v3_safe_numeric(p_intake->>'SL6', 5);
begin
  if v_sex = 'male' and v_age is not null and v_height is not null and v_weight is not null then
    v_ree := round(10*v_weight + 6.25*v_height - 5*v_age + 5, 2);
  elsif v_sex = 'female' and v_age is not null and v_height is not null and v_weight is not null then
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
    v_training_sessions := least(2, greatest(1, coalesce(v_available_training_days, 2)));
  else
    v_training_sessions := least(3, greatest(1, coalesce(v_available_training_days, 3)));
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
