-- Add blue-screen exposure as intake context only.
-- This does not change the 24 core questions, safety gates, or scoring formulas.
do $$
declare
  v_definition jsonb;
  v_new_intake jsonb;
  v_sl7 jsonb := jsonb_build_object(
    'id', 'SL7',
    'section', 'recovery',
    'label', 'Do you look at blue screens 1 hour before bed? (TV, phone)',
    'type', 'single_select',
    'required', true,
    'options', jsonb_build_array('Never', 'Sometimes', 'Almost every night', 'Every night')
  );
begin
  select definition
  into v_definition
  from public.kca_assessment_definitions
  where definition_version = '3.0.0'
    and retired_at is null
  limit 1;

  if v_definition is null then
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_definition->'personal_transformation_intake') as field
    where field->>'id' = 'SL7'
  ) then
    update public.kca_assessment_definitions
    set definition = jsonb_set(
      definition,
      '{assessment_architecture,personal_transformation_intake_fields}',
      to_jsonb(jsonb_array_length(definition->'personal_transformation_intake')),
      true
    ),
    change_reason = 'V3 intake includes blue-screen exposure before bed as recovery context; scoring remains core-only.'
    where definition_version = '3.0.0'
      and retired_at is null;

    return;
  end if;

  with fields as (
    select elem, ord
    from jsonb_array_elements(v_definition->'personal_transformation_intake') with ordinality as x(elem, ord)
  ),
  expanded as (
    select (ord * 10)::numeric as sort_key, elem
    from fields

    union all

    select ((select ord from fields where elem->>'id' = 'SL6' limit 1) * 10 + 1)::numeric as sort_key,
           v_sl7 as elem
    where exists (select 1 from fields where elem->>'id' = 'SL6')

    union all

    select ((select coalesce(max(ord), 0) from fields) * 10 + 1)::numeric as sort_key,
           v_sl7 as elem
    where not exists (select 1 from fields where elem->>'id' = 'SL6')
  )
  select jsonb_agg(elem order by sort_key)
  into v_new_intake
  from expanded
  where sort_key is not null;

  update public.kca_assessment_definitions
  set definition = jsonb_set(
    jsonb_set(definition, '{personal_transformation_intake}', v_new_intake, true),
    '{assessment_architecture,personal_transformation_intake_fields}',
    to_jsonb(jsonb_array_length(v_new_intake)),
    true
  ),
  change_reason = 'V3 intake includes blue-screen exposure before bed as recovery context; scoring remains core-only.'
  where definition_version = '3.0.0'
    and retired_at is null;
end $$;
