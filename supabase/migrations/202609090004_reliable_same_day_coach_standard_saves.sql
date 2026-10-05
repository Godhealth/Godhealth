-- GodHealth KCA — Reliable same-day coach standard saves
-- Fixes the final Daily Seven blocker:
-- when multiple same-day prescription rows exist, the intended coach update
-- must always be the newest canonical row the client dashboard reads.

create or replace function public.kca_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
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
  v_default_effective_from date := coalesce(p_effective_from, current_date);
  v_item jsonb;
  v_key text;
  v_label text;
  v_active_from date;
  v_active_until date;
  v_target_value numeric;
  v_program_week integer;
  v_days integer[];
  v_is_prescribed boolean;
  v_saved integer := 0;
  v_existing_id uuid;
  v_revision numeric;
  v_protocol_keys text[] := public.kca_protocol_keys();
  v_saved_rows jsonb := '[]'::jsonb;
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

    v_active_from := v_default_effective_from;
    v_active_until := nullif(v_item->>'active_until', '')::date;
    v_is_prescribed := coalesce((v_item->>'is_prescribed')::boolean, true);
    v_revision := extract(epoch from clock_timestamp());

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

    select coalesce(array_agg(day_value order by day_value), array[]::integer[])
    into v_days
    from (
      select distinct jsonb_array_elements_text(coalesce(v_item->'prescribed_days','[]'::jsonb))::int as day_value
    ) d
    where day_value between 1 and 7;

    if v_is_prescribed and cardinality(v_days) = 0 then
      v_days := array[extract(isodow from v_active_from)::int];
    end if;

    if not v_is_prescribed then
      v_days := coalesce(v_days, array[]::integer[]);
    end if;

    if v_active_until is not null and v_active_until < v_active_from then
      v_active_until := null;
    end if;

    update public.client_foundation_prescriptions
    set active_until = v_active_from - 1,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'superseded_by','coach_builder_update',
          'superseded_at',clock_timestamp()
        )
    where client_user_id = p_client_user_id
      and foundation_key = v_key
      and active_from < v_active_from
      and (active_until is null or active_until >= v_active_from);

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
    order by updated_at desc, created_at desc, id desc
    limit 1;

    if v_existing_id is not null then
      update public.client_foundation_prescriptions
      set is_prescribed = false,
          active_until = v_active_from,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'superseded_by','same_day_coach_builder_update',
            'superseded_at',clock_timestamp(),
            'coach_revision', v_revision - 0.0001,
            'canonical_today_standard', false
          )
      where client_user_id = p_client_user_id
        and foundation_key = v_key
        and active_from = v_active_from
        and id <> v_existing_id;

      update public.client_foundation_prescriptions
      set foundation_label = v_label,
          foundation_description = coalesce(v_item->>'foundation_description', ''),
          target_label = coalesce(v_item->>'target_label', ''),
          target_value = v_target_value,
          target_unit = nullif(trim(coalesce(v_item->>'target_unit', '')), ''),
          prescribed_days = v_days,
          is_prescribed = v_is_prescribed,
          allow_not_applicable = coalesce((v_item->>'allow_not_applicable')::boolean, false),
          program_week = v_program_week,
          active_until = v_active_until,
          created_by = auth.uid(),
          metadata = coalesce(v_item->'metadata', '{}'::jsonb) || jsonb_build_object(
            'source','coach_builder_update',
            'updated_by',auth.uid(),
            'updated_at',clock_timestamp(),
            'coach_revision', v_revision,
            'canonical_today_standard', true
          )
      where id = v_existing_id;
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
        metadata,
        created_at,
        updated_at
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
        v_is_prescribed,
        coalesce((v_item->>'allow_not_applicable')::boolean, false),
        v_program_week,
        v_active_from,
        v_active_until,
        auth.uid(),
        coalesce(v_item->'metadata', '{}'::jsonb) || jsonb_build_object(
          'source','coach_builder_update',
          'updated_by',auth.uid(),
          'updated_at',clock_timestamp(),
          'coach_revision', v_revision,
          'canonical_today_standard', true
        ),
        clock_timestamp(),
        clock_timestamp()
      );
    end if;

    v_saved := v_saved + 1;
  end loop;

  with ranked_saved as (
    select
      p.*,
      row_number() over (
        partition by p.foundation_key
        order by p.updated_at desc, p.created_at desc, p.id desc
      ) as rn
    from public.client_foundation_prescriptions p
    where p.client_user_id = p_client_user_id
      and p.foundation_key = any(v_protocol_keys)
      and p.active_from = v_default_effective_from
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'foundation_key', p.foundation_key,
      'target_label', p.target_label,
      'foundation_description', p.foundation_description,
      'prescribed_days', p.prescribed_days,
      'is_prescribed', p.is_prescribed,
      'active_from', p.active_from,
      'active_until', p.active_until,
      'updated_at', p.updated_at,
      'metadata', p.metadata
    )
    order by coalesce((p.metadata->>'order')::int, 99), p.foundation_key
  ), '[]'::jsonb)
  into v_saved_rows
  from ranked_saved p
  where p.rn = 1;

  begin
    insert into public.kca_audit_events (user_id, event_type, metadata)
    values (
      auth.uid(),
      'coach_saved_checkin_builder',
      jsonb_build_object(
        'client_user_id', p_client_user_id,
        'effective_from', v_default_effective_from,
        'count', v_saved,
        'saved_rows', v_saved_rows,
        'same_day_canonical_save', true
      )
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'client_user_id', p_client_user_id,
    'effective_from', v_default_effective_from,
    'saved_count', v_saved,
    'saved_rows', v_saved_rows
  );
end;
$$;

grant execute on function public.kca_coach_save_foundation_prescriptions(uuid, date, jsonb) to authenticated;
