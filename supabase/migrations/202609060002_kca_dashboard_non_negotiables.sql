-- GodHealth KCA private dashboard polish + 10 Non-Negotiables refresh.
-- Keeps the assessment engine intact and only updates the execution-loop checklist defaults.

create or replace function public.kca_foundation_defaults()
returns jsonb
language sql
stable
as $$
  select '[
    {
      "foundation_key":"quiet_time",
      "foundation_label":"Scripture & Prayer",
      "foundation_description":"Start with God before the day pulls your attention.",
      "target_label":"10 minutes before your phone",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"hydration",
      "foundation_label":"Hydration",
      "foundation_description":"Give your body water before chasing energy from anything else.",
      "target_label":"Water with your first meal + steady intake",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"nutrition",
      "foundation_label":"GodHealth Nutrition",
      "foundation_description":"Eat one real-food anchor meal with protein and plants.",
      "target_label":"One real-food meal",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"meal_timing",
      "foundation_label":"Meal Timing",
      "foundation_description":"Follow a calm eating rhythm instead of chaotic grazing.",
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
      "foundation_description":"Build capacity with your strength or mobility assignment.",
      "target_label":"Short strength or mobility block",
      "prescribed_days":[1,3,5],
      "is_prescribed":true
    },
    {
      "foundation_key":"sleep_recovery",
      "foundation_label":"Sleep & Recovery",
      "foundation_description":"Protect the evening so your body can recover.",
      "target_label":"Evening wind-down",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"serve_neighbour",
      "foundation_label":"Serve Your Neighbour",
      "foundation_description":"Love your neighbour as yourself through one simple act of service.",
      "target_label":"One loving act today",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"gratitude_reflection",
      "foundation_label":"Gratitude & Reflection",
      "foundation_description":"End the day by naming what God helped you steward today.",
      "target_label":"One honest reflection",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    }
  ]'::jsonb;
$$;

with foundation_updates as (
  select *
  from (values
    ('quiet_time','quiet_time','Scripture & Prayer','Start with God before the day pulls your attention.','10 minutes before your phone',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('hydration','hydration','Hydration','Give your body water before chasing energy from anything else.','Water with your first meal + steady intake',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('nutrition','nutrition','GodHealth Nutrition','Eat one real-food anchor meal with protein and plants.','One real-food meal',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('meal_timing','meal_timing','Meal Timing','Follow a calm eating rhythm instead of chaotic grazing.','Follow your personal eating window',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('daily_movement','daily_movement','Daily Movement','Move your body before the day becomes crowded.','10-minute walk or simple movement',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('break_sitting','break_sitting','Break Up Sitting','Interrupt long sitting blocks with short movement.','2–3 minutes after long sitting',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('strength_mobility','strength_mobility','Strength & Mobility','Build capacity with your strength or mobility assignment.','Short strength or mobility block',array[1,3,5]::integer[],true,false),
    ('sleep_recovery','sleep_recovery','Sleep & Recovery','Protect the evening so your body can recover.','Evening wind-down',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('community','serve_neighbour','Serve Your Neighbour','Love your neighbour as yourself through one simple act of service.','One loving act today',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('serve_neighbour','serve_neighbour','Serve Your Neighbour','Love your neighbour as yourself through one simple act of service.','One loving act today',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('fasting','gratitude_reflection','Gratitude & Reflection','End the day by naming what God helped you steward today.','One honest reflection',array[1,2,3,4,5,6,7]::integer[],true,false),
    ('gratitude_reflection','gratitude_reflection','Gratitude & Reflection','End the day by naming what God helped you steward today.','One honest reflection',array[1,2,3,4,5,6,7]::integer[],true,false)
  ) as v(old_key,new_key,label,description,target,days,is_prescribed,allow_not_applicable)
)
update public.client_foundation_prescriptions p
set foundation_key = u.new_key,
    foundation_label = u.label,
    foundation_description = u.description,
    target_label = u.target,
    prescribed_days = u.days,
    is_prescribed = u.is_prescribed,
    allow_not_applicable = u.allow_not_applicable,
    updated_at = now()
from foundation_updates u
where p.foundation_key = u.old_key;

grant execute on function public.kca_foundation_defaults() to authenticated;
