-- GodHealth KCA — Immediate Daily Seven coach updates
-- Ensures coach Check-In Builder changes can become active today without
-- creating duplicate active prescriptions for the same foundation/date.

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
  v_saved integer := 0;
  v_existing_id uuid;
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
        updated_at = now(),
        metadata = metadata || jsonb_build_object(
          'superseded_by','coach_builder_update',
          'superseded_at',now()
        )
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

    select id
    into v_existing_id
    from public.client_foundation_prescriptions
    where client_user_id = p_client_user_id
      and foundation_key = v_key
      and active_from = v_active_from
    order by updated_at desc, created_at desc
    limit 1;

    if v_existing_id is not null then
      update public.client_foundation_prescriptions
      set foundation_label = v_label,
          foundation_description = coalesce(v_item->>'foundation_description', ''),
          target_label = coalesce(v_item->>'target_label', ''),
          target_value = v_target_value,
          target_unit = nullif(trim(coalesce(v_item->>'target_unit', '')), ''),
          prescribed_days = v_days,
          is_prescribed = coalesce((v_item->>'is_prescribed')::boolean, true),
          allow_not_applicable = coalesce((v_item->>'allow_not_applicable')::boolean, false),
          program_week = v_program_week,
          active_until = v_active_until,
          created_by = auth.uid(),
          metadata = coalesce(v_item->'metadata', '{}'::jsonb) || jsonb_build_object(
            'source','coach_builder_update',
            'updated_by',auth.uid(),
            'updated_at',now()
          ),
          updated_at = now()
      where id = v_existing_id;

      update public.client_foundation_prescriptions
      set is_prescribed = false,
          active_until = v_active_from,
          updated_at = now(),
          metadata = metadata || jsonb_build_object(
            'superseded_by','same_day_coach_builder_update',
            'superseded_at',now()
          )
      where client_user_id = p_client_user_id
        and foundation_key = v_key
        and active_from = v_active_from
        and id <> v_existing_id;
    else
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
    end if;

    v_saved := v_saved + 1;
  end loop;

  insert into public.kca_audit_events (user_id, event_type, metadata)
  values (
    auth.uid(),
    'coach_saved_checkin_builder',
    jsonb_build_object('client_user_id', p_client_user_id, 'effective_from', v_default_effective_from, 'count', v_saved)
  );

  return public.kca_coach_execution_detail(p_client_user_id, v_default_effective_from);
end;
$$;

grant execute on function public.kca_coach_save_foundation_prescriptions(uuid, date, jsonb) to authenticated;
