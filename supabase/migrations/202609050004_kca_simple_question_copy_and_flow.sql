-- GodHealth KCA v3 simple-English copy update.
-- Keeps the existing V3 structure/scoring intact while making the live
-- assessment questions easier to understand for clients and coach reports.

do $$
declare
  v_definition_id uuid;
  v_definition jsonb;
  v_intake_labels jsonb := jsonb_build_object(
    'PR1', 'How old are you?',
    'PR2', 'Gender',
    'PR3', 'How tall are you? (cm)',
    'PR4', 'What is your current weight? (kg)',
    'PR5', 'What is your waist size? (cm)',
    'PR6', 'Do you know your body-fat percentage?',
    'PR7', 'How active is your work?',
    'PR8', 'How many steps do you usually take per day?',
    'PR9', 'What makes your weekly schedule difficult?',
    'PR10', 'How many hours do you work each week?',
    'GL1', 'What is your main 12-week goal?',
    'GL2', 'Choose up to two extra goals.',
    'GL3', 'What would real success look like after 12 weeks?',
    'GL4', 'Why does this goal matter to your life, family, service, or calling?',
    'GL5', 'What is your goal weight? (kg)',
    'GL6', 'When would you like to reach this goal?',
    'GL7', 'How ready are you to change for the next 12 weeks?',
    'GL8', 'What are your biggest limits right now?',
    'HI1', 'What was your weight about 3 months ago? (kg)',
    'HI2', 'What was your weight about 12 months ago? (kg)',
    'HI3', 'What was your highest adult weight? (kg)',
    'HI4', 'What have you tried before?',
    'HI5', 'What helped you most before?',
    'HI6', 'Why did past attempts stop or fail?',
    'HI7', 'If you regained weight before, what caused it?',
    'HI8', 'How comfortable are you with tracking calories or macros?',
    'NU1', 'How many meals do you usually eat per day?',
    'NU2', 'What time do you usually eat your first and last meal?',
    'NU3', 'How much fruit and vegetables do you usually eat?',
    'NU4', 'How often do you eat fibre-rich foods like whole grains, beans, nuts, or seeds?',
    'NU5', 'How many main meals include a good protein source?',
    'NU6', 'How often do you drink sugary drinks or fruit juice?',
    'NU7', 'How often do you eat sweets, desserts, salty snacks, or processed snacks?',
    'NU8', 'How often do you eat fast food, takeaway, or ready meals?',
    'NU9', 'Do you drink alcohol? If yes, how much?',
    'NU10', 'How much caffeine do you drink, and what is your latest usual time?',
    'NU11', 'Any food preferences, allergies, intolerances, or restrictions?',
    'NU12', 'Who buys and cooks your food, and how much time can you cook?',
    'NU13', 'What is your food budget like?',
    'TR1', 'How many days per week do you do strength training?',
    'TR2', 'How many minutes of cardio do you do per week?',
    'TR3', 'How much strength-training experience do you have?',
    'TR4', 'How many training days are realistic each week?',
    'TR5', 'How long can each workout realistically be?',
    'TR6', 'What equipment do you have available?',
    'TR7', 'What training styles do you enjoy?',
    'TR8', 'What training styles do you dislike or will not do?',
    'TR9', 'Any injuries, pain, movement limits, or exercises you should avoid?',
    'TR10', 'What does your current training look like?',
    'SL1', 'How many hours do you actually sleep per night?',
    'SL2', 'What are your usual workday sleep and wake times?',
    'SL3', 'What are your usual free-day sleep and wake times?',
    'SL4', 'Do you work shifts or overnight?',
    'SL5', 'Has anyone noticed loud snoring, choking, gasping, or breathing pauses while you sleep?',
    'SL6', 'How rested do you feel after sleep?',
    'RC1', 'Do you use sauna or passive heat?',
    'RC2', 'Do you use cold showers, plunges, or cold-water immersion?',
    'FA1', 'Are you interested in a simple fasting or time-restricted eating strategy?',
    'FA2', 'What fasting styles have you tried before?',
    'FA3', 'What happened when you fasted?',
    'FA4', 'Why are you interested in fasting?',
    'EN1', 'Who lives with you, and who is affected by your food or training routine?',
    'EN2', 'How supportive are the people closest to you?',
    'EN3', 'How often do work, church, family, or social events decide when or what you eat?',
    'EN4', 'How often do you travel or sleep away from home?',
    'EN5', 'What time windows do you have for training, meal prep, prayer, Scripture, and recovery?',
    'EN6', 'Who can help keep you accountable?',
    'EN7', 'What usually makes your routine fall apart?',
    'SS1', 'What mental or emotional pattern most often gets in the way?',
    'SS2', 'What spiritual rhythm do you most want to strengthen?'
  );
  v_core_statements jsonb := jsonb_build_object(
    'B1.1', 'Most of my meals are simple, real foods instead of packaged foods.',
    'B1.6', 'Food feels peaceful and purposeful, not full of guilt, chaos, restriction, or loss of control.',
    'B2.1', 'I usually give myself enough time to sleep about 7 hours or more.',
    'B2.6', 'Tiredness does not often hurt my focus, work, training, safety, or relationships.',
    'B3.1', 'I usually get enough weekly movement, like walking, cardio, or active work.',
    'B3.2', 'I train my muscles at least 2 days per week when my body allows it.',
    'B4.1', 'I have enough energy for the responsibilities that matter most.',
    'B4.5', 'Pain, dizziness, breathlessness, or unexplained fatigue do not often stop me from functioning.',
    'S1.1', 'I can notice an unhelpful thought without believing it right away.',
    'S1.4', 'I can take the next wise step even when I do not feel motivated.',
    'S2.1', 'I can usually name what I feel instead of only reacting.',
    'S2.2', 'When I feel stressed, angry, anxious, disappointed, or lonely, I can pause before I act.',
    'S3.2', 'I make clear plans for my important habits.',
    'S3.5', 'When I miss a habit, I usually restart at the next good moment instead of waiting for Monday.',
    'S4.2', 'The people closest to me usually support the healthy changes I want to make.',
    'S4.3', 'My home and work environment make healthy choices easier, not harder.',
    'P1.1', 'I read or hear Scripture often enough that God''s truth shapes my choices.',
    'P1.6', 'I try to live out what I learn from Scripture.',
    'P2.1', 'Prayer is a regular part of my life, not only something I do in crisis.',
    'P2.5', 'Depending on God helps me take faithful action, not avoid responsibility.',
    'P3.1', 'I see caring for my body as stewardship of what God gave me.',
    'P3.2', 'My health choices are led more by wisdom and self-control than impulse, fear, vanity, or obsession.',
    'P4.1', 'I know the people, responsibilities, and work God has placed in front of me in this season.',
    'P4.2', 'My health has a bigger purpose: service, stewardship, and calling.'
  );
  v_new_intake jsonb;
  v_new_core jsonb;
begin
  select id, definition
  into v_definition_id, v_definition
  from public.kca_assessment_definitions
  where definition_version = '3.0.0'
    and retired_at is null
  order by created_at desc
  limit 1;

  if v_definition_id is null then
    return;
  end if;

  select jsonb_agg(
    case
      when v_intake_labels ? (field->>'id')
        then jsonb_set(field, '{label}', to_jsonb(v_intake_labels->>(field->>'id')), true)
      else field
    end
    order by ord
  )
  into v_new_intake
  from jsonb_array_elements(v_definition->'personal_transformation_intake') with ordinality as x(field, ord);

  select jsonb_agg(
    case
      when v_core_statements ? (question->>'id')
        then jsonb_set(question, '{statement}', to_jsonb(v_core_statements->>(question->>'id')), true)
      else question
    end
    order by ord
  )
  into v_new_core
  from jsonb_array_elements(v_definition->'capacity_core') with ordinality as x(question, ord);

  update public.kca_assessment_definitions
  set definition = jsonb_set(
      jsonb_set(definition, '{personal_transformation_intake}', coalesce(v_new_intake, definition->'personal_transformation_intake'), true),
      '{capacity_core}',
      coalesce(v_new_core, definition->'capacity_core'),
      true
    ),
    change_reason = 'V3 simple English question copy with existing scoring, safety and personalization preserved.'
  where id = v_definition_id;
end $$;
