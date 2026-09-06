-- GodHealth 10 Non-Negotiables content refresh.
-- This keeps the execution-loop functionality unchanged and updates only the daily checklist language.

create or replace function public.kca_foundation_defaults()
returns jsonb
language sql
stable
as $$
  select '[
    {
      "foundation_key":"spiritual_foundation",
      "foundation_label":"Spiritual Foundation",
      "foundation_description":"Start every morning with 15 minutes of Bible reading and prayer before your phone.",
      "target_label":"Bible + prayer before your phone",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"prayer_gratitude",
      "foundation_label":"Prayer & Gratitude",
      "foundation_description":"Write down 3 things you are thankful for and begin every meal with a conscious prayer of thanks.",
      "target_label":"3 gratitudes + prayer before meals",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"clean_hydration",
      "foundation_label":"Clean Hydration",
      "foundation_description":"Drink clean water daily. Men: at least 2 liters. Women: at least 1.6 liters. Start with a large glass of water.",
      "target_label":"Pure water first",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"god_created_nutrition",
      "foundation_label":"God-Created Nutrition",
      "foundation_description":"Choose real food: meat, fish, eggs, vegetables, fruit, nuts, seeds and root vegetables. Avoid factory-made foods and sugary drinks.",
      "target_label":"Real food, no barcode",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"protein_portions",
      "foundation_label":"Protein, Portions & 80% Full",
      "foundation_description":"Include protein with every meal. Use your hand as a guide: palm protein, fist vegetables, handful carbs, thumb healthy fats. Stop around 80% full.",
      "target_label":"Protein + wise portions",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"eating_window",
      "foundation_label":"Eating Window & Timing",
      "foundation_description":"Start with a 12-hour eating window and build toward 8–10 hours. Eat most food earlier and finish your last meal about 3 hours before sleep.",
      "target_label":"Calm eating rhythm",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"movement_nature",
      "foundation_label":"Daily Movement In Nature",
      "foundation_description":"Aim for 8,000–10,000 steps per day. Walk outside when possible and attach it to a fixed moment like after breakfast or dinner.",
      "target_label":"8k–10k steps",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"strength_sitting",
      "foundation_label":"Strength, Mobility & Sitting Less",
      "foundation_description":"Break up sitting every hour. Train strength 2–3 times per week, join the weekly Live Workout, and do 10 minutes of mobility daily.",
      "target_label":"Move hourly + build strength",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"sleep_fasting",
      "foundation_label":"Sleep, Recovery & Fasting",
      "foundation_description":"Protect 7–9 hours of sleep, get daylight within 30 minutes of waking, switch screens off before bed, keep one Sabbath/rest day, and build fasting carefully with prayer.",
      "target_label":"Recover first",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    },
    {
      "foundation_key":"serve_neighbour",
      "foundation_label":"Serve Your Neighbour",
      "foundation_description":"Love your neighbour as yourself through one simple act of service, encouragement or care.",
      "target_label":"One loving act today",
      "prescribed_days":[1,2,3,4,5,6,7],
      "is_prescribed":true
    }
  ]'::jsonb;
$$;

with ranked_active as (
  select
    p.*,
    row_number() over (
      partition by p.client_user_id
      order by p.created_at, p.id
    ) as rn
  from public.client_foundation_prescriptions p
  where p.active_until is null
), foundation_updates as (
  select *
  from (values
    (1,'spiritual_foundation','Spiritual Foundation','Start every morning with 15 minutes of Bible reading and prayer before your phone.','Bible + prayer before your phone',array[1,2,3,4,5,6,7]::integer[]),
    (2,'prayer_gratitude','Prayer & Gratitude','Write down 3 things you are thankful for and begin every meal with a conscious prayer of thanks.','3 gratitudes + prayer before meals',array[1,2,3,4,5,6,7]::integer[]),
    (3,'clean_hydration','Clean Hydration','Drink clean water daily. Men: at least 2 liters. Women: at least 1.6 liters. Start with a large glass of water.','Pure water first',array[1,2,3,4,5,6,7]::integer[]),
    (4,'god_created_nutrition','God-Created Nutrition','Choose real food: meat, fish, eggs, vegetables, fruit, nuts, seeds and root vegetables. Avoid factory-made foods and sugary drinks.','Real food, no barcode',array[1,2,3,4,5,6,7]::integer[]),
    (5,'protein_portions','Protein, Portions & 80% Full','Include protein with every meal. Use your hand as a guide: palm protein, fist vegetables, handful carbs, thumb healthy fats. Stop around 80% full.','Protein + wise portions',array[1,2,3,4,5,6,7]::integer[]),
    (6,'eating_window','Eating Window & Timing','Start with a 12-hour eating window and build toward 8–10 hours. Eat most food earlier and finish your last meal about 3 hours before sleep.','Calm eating rhythm',array[1,2,3,4,5,6,7]::integer[]),
    (7,'movement_nature','Daily Movement In Nature','Aim for 8,000–10,000 steps per day. Walk outside when possible and attach it to a fixed moment like after breakfast or dinner.','8k–10k steps',array[1,2,3,4,5,6,7]::integer[]),
    (8,'strength_sitting','Strength, Mobility & Sitting Less','Break up sitting every hour. Train strength 2–3 times per week, join the weekly Live Workout, and do 10 minutes of mobility daily.','Move hourly + build strength',array[1,2,3,4,5,6,7]::integer[]),
    (9,'sleep_fasting','Sleep, Recovery & Fasting','Protect 7–9 hours of sleep, get daylight within 30 minutes of waking, switch screens off before bed, keep one Sabbath/rest day, and build fasting carefully with prayer.','Recover first',array[1,2,3,4,5,6,7]::integer[]),
    (10,'serve_neighbour','Serve Your Neighbour','Love your neighbour as yourself through one simple act of service, encouragement or care.','One loving act today',array[1,2,3,4,5,6,7]::integer[])
  ) as v(rn,foundation_key,foundation_label,foundation_description,target_label,prescribed_days)
)
update public.client_foundation_prescriptions p
set foundation_key = u.foundation_key,
    foundation_label = u.foundation_label,
    foundation_description = u.foundation_description,
    target_label = u.target_label,
    prescribed_days = u.prescribed_days,
    is_prescribed = true,
    allow_not_applicable = false,
    updated_at = now()
from ranked_active r
join foundation_updates u on u.rn = r.rn
where p.id = r.id;

grant execute on function public.kca_foundation_defaults() to authenticated;
