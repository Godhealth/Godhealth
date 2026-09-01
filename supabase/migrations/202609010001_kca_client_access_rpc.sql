-- GodHealth KCA V3 coach-managed client access.
-- Lets an authenticated GodHealth coach activate premium assessment access
-- without exposing service-role keys or requiring manual SQL per client.

create or replace function public.kca_can_access_client(p_client_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select auth.uid() = p_client_user_id
    or exists (
      select 1
      from public.kca_coaches c
      where c.user_id = auth.uid()
        and c.role = 'owner'
    )
    or exists (
      select 1
      from public.kca_coach_assignments a
      join public.kca_coaches c on c.user_id = a.coach_user_id
      where a.client_user_id = p_client_user_id
        and a.coach_user_id = auth.uid()
    );
$$;

grant execute on function public.kca_can_access_client(uuid) to authenticated;

create or replace function public.kca_grant_client_access(
  p_client_email text,
  p_assessment_version text default '3.0.0'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_coach_id uuid := auth.uid();
  v_client_id uuid;
  v_client_email text;
  v_email text := lower(trim(coalesce(p_client_email, '')));
  v_version text := coalesce(nullif(trim(p_assessment_version), ''), '3.0.0');
begin
  if v_coach_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.kca_coaches where user_id = v_coach_id) then
    raise exception 'not_authorized';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_email',
      'message', 'Enter a valid client email address.'
    );
  end if;

  select auth_user.id, auth_user.email
  into v_client_id, v_client_email
  from auth.users auth_user
  where lower(auth_user.email) = v_email
  limit 1;

  if v_client_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'client_not_found',
      'message', 'Client not found yet. Ask the client to request or open their GodHealth login link once first, then activate access here.'
    );
  end if;

  insert into public.kca_client_entitlements (
    user_id,
    assessment_version,
    status,
    starts_at,
    expires_at,
    revoked_at,
    created_by
  )
  values (
    v_client_id,
    v_version,
    'active',
    now(),
    null,
    null,
    v_coach_id
  )
  on conflict (user_id, assessment_version)
  do update set
    status = 'active',
    starts_at = now(),
    expires_at = null,
    revoked_at = null,
    created_by = coalesce(public.kca_client_entitlements.created_by, excluded.created_by),
    updated_at = now();

  insert into public.kca_coach_assignments (
    coach_user_id,
    client_user_id
  )
  values (
    v_coach_id,
    v_client_id
  )
  on conflict (coach_user_id, client_user_id)
  do nothing;

  insert into public.kca_audit_events (
    user_id,
    event_type,
    metadata
  )
  values (
    v_coach_id,
    'coach_granted_client_access',
    jsonb_build_object(
      'client_user_id', v_client_id,
      'client_email', v_client_email,
      'assessment_version', v_version
    )
  );

  return jsonb_build_object(
    'ok', true,
    'client_user_id', v_client_id,
    'client_email', v_client_email,
    'assessment_version', v_version,
    'status', 'active'
  );
end;
$$;

grant execute on function public.kca_grant_client_access(text, text) to authenticated;
