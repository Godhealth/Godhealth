-- GodHealth KCA — Visibility guard for coach-prescribed Daily Seven standards
-- If a coach marks a standard as prescribed but no weekdays are selected, the
-- client app cannot show it because today's dashboard filters by prescribed day.
-- This guard keeps active prescriptions visible on their effective weekday.

create or replace function public.kca_normalize_client_prescription_days()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_normalized_days integer[];
begin
  select coalesce(array_agg(distinct day_value order by day_value), array[]::integer[])
  into v_normalized_days
  from unnest(coalesce(new.prescribed_days, array[]::integer[])) as d(day_value)
  where day_value between 1 and 7;

  new.prescribed_days := coalesce(v_normalized_days, array[]::integer[]);

  if new.is_prescribed = true and cardinality(new.prescribed_days) = 0 then
    new.prescribed_days := array[extract(isodow from coalesce(new.active_from, current_date))::integer];
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kca_normalize_client_prescription_days on public.client_foundation_prescriptions;

create trigger trg_kca_normalize_client_prescription_days
before insert or update of prescribed_days, is_prescribed, active_from
on public.client_foundation_prescriptions
for each row
execute function public.kca_normalize_client_prescription_days();

update public.client_foundation_prescriptions
set prescribed_days = array[extract(isodow from coalesce(active_from, current_date))::integer],
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'visibility_guard_applied', true,
      'visibility_guard_applied_at', now()
    )
where is_prescribed = true
  and cardinality(coalesce(prescribed_days, array[]::integer[])) = 0;
