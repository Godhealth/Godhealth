create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.leads add column if not exists first_name text;
alter table public.leads add column if not exists email text;
alter table public.leads add column if not exists phone text;
alter table public.leads add column if not exists phone_country_code text;
alter table public.leads add column if not exists phone_normalized text;
alter table public.leads add column if not exists source text;
alter table public.leads add column if not exists status text;
alter table public.leads add column if not exists scan_started boolean not null default false;
alter table public.leads add column if not exists scan_completed boolean not null default false;
alter table public.leads add column if not exists call_requested boolean not null default false;
alter table public.leads add column if not exists call_booked boolean not null default false;
alter table public.leads add column if not exists body_score integer;
alter table public.leads add column if not exists soul_score integer;
alter table public.leads add column if not exists spirit_score integer;
alter table public.leads add column if not exists total_score integer;
alter table public.leads add column if not exists alignment_gap text;
alter table public.leads add column if not exists roadmap_step_1 text;
alter table public.leads add column if not exists roadmap_step_2 text;
alter table public.leads add column if not exists roadmap_step_3 text;
alter table public.leads add column if not exists report_pdf_url text;
alter table public.leads add column if not exists report_pdf_path text;
alter table public.leads add column if not exists marketing_consent boolean not null default false;
alter table public.leads add column if not exists marketing_consent_timestamp timestamptz;
alter table public.leads add column if not exists marketing_consent_source text;
alter table public.leads add column if not exists scan_privacy_consent boolean not null default false;
alter table public.leads add column if not exists scan_privacy_consent_timestamp timestamptz;
alter table public.leads add column if not exists strategy_call_privacy_consent boolean not null default false;
alter table public.leads add column if not exists strategy_call_phone_consent boolean not null default false;
alter table public.leads add column if not exists strategy_call_phone_consent_timestamp timestamptz;
alter table public.leads add column if not exists privacy_policy_version text;
alter table public.leads add column if not exists scan_answers jsonb;
alter table public.leads add column if not exists updated_at timestamptz not null default now();

create index if not exists leads_email_lookup_idx on public.leads (lower(email));

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  processed boolean not null default false,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists lead_events_processing_idx
  on public.lead_events (processed, created_at)
  where processed = false;

create index if not exists lead_events_lead_idx
  on public.lead_events (lead_id, created_at desc);

create unique index if not exists lead_events_scan_started_once
  on public.lead_events (lead_id, event_type)
  where event_type = 'scan_started';

create unique index if not exists lead_events_scan_completed_once
  on public.lead_events (lead_id, event_type)
  where event_type = 'scan_completed';

alter table public.leads enable row level security;
alter table public.lead_events enable row level security;

revoke all on public.leads from anon, authenticated;
revoke all on public.lead_events from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scan-reports',
  'scan-reports',
  false,
  12582912,
  array['application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.gh_find_or_create_lead(
  p_first_name text,
  p_email text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_lead_id uuid;
begin
  if length(trim(p_first_name)) < 1 or length(trim(p_first_name)) > 80 then
    raise exception 'Invalid first name';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 254 then
    raise exception 'Invalid email';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_email));

  select id into v_lead_id
  from public.leads
  where lower(email) = v_email
  order by created_at desc
  limit 1;

  if v_lead_id is null then
    insert into public.leads (first_name, email, source, status)
    values (left(trim(p_first_name), 80), v_email, left(trim(p_source), 80), 'new')
    returning id into v_lead_id;
  else
    update public.leads
    set
      first_name = left(trim(p_first_name), 80),
      source = left(trim(p_source), 80),
      updated_at = now()
    where id = v_lead_id;
  end if;

  return v_lead_id;
end;
$$;

create or replace function public.gh_start_scan(
  p_first_name text,
  p_email text,
  p_scan_privacy_consent boolean,
  p_scan_privacy_consent_timestamp timestamptz,
  p_marketing_consent boolean,
  p_marketing_consent_timestamp timestamptz,
  p_marketing_consent_source text,
  p_privacy_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if p_scan_privacy_consent is not true then
    raise exception 'Scan privacy consent is required';
  end if;
  if p_privacy_policy_version <> 'v1.0' then
    raise exception 'Unsupported privacy policy version';
  end if;

  v_lead_id := public.gh_find_or_create_lead(
    p_first_name,
    p_email,
    'kingdom_vitality_scan'
  );

  update public.leads
  set
    source = 'kingdom_vitality_scan',
    status = 'scan_started',
    scan_started = true,
    scan_privacy_consent = true,
    scan_privacy_consent_timestamp = p_scan_privacy_consent_timestamp,
    marketing_consent = coalesce(p_marketing_consent, false),
    marketing_consent_timestamp = case when p_marketing_consent then p_marketing_consent_timestamp else null end,
    marketing_consent_source = case when p_marketing_consent then left(p_marketing_consent_source, 80) else null end,
    privacy_policy_version = p_privacy_policy_version,
    updated_at = now()
  where id = v_lead_id;

  insert into public.lead_events (lead_id, event_type, processed, payload)
  values (
    v_lead_id,
    'scan_started',
    false,
    jsonb_build_object(
      'scan_privacy_consent', true,
      'scan_privacy_consent_timestamp', p_scan_privacy_consent_timestamp,
      'marketing_consent', coalesce(p_marketing_consent, false),
      'marketing_consent_timestamp', case when p_marketing_consent then p_marketing_consent_timestamp else null end,
      'marketing_consent_source', case when p_marketing_consent then p_marketing_consent_source else null end,
      'privacy_policy_version', p_privacy_policy_version
    )
  )
  on conflict do nothing;

  return jsonb_build_object('lead_id', v_lead_id);
end;
$$;

create or replace function public.gh_request_call(
  p_lead_id uuid,
  p_first_name text,
  p_email text,
  p_phone text,
  p_phone_country_code text,
  p_phone_normalized text,
  p_source text,
  p_strategy_call_privacy_consent boolean,
  p_strategy_call_phone_consent boolean,
  p_strategy_call_phone_consent_timestamp timestamptz,
  p_marketing_consent boolean,
  p_marketing_consent_timestamp timestamptz,
  p_marketing_consent_source text,
  p_privacy_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid := p_lead_id;
begin
  if p_strategy_call_phone_consent is not true then
    raise exception 'Strategy Call phone consent is required';
  end if;
  if p_privacy_policy_version <> 'v1.0' then
    raise exception 'Unsupported privacy policy version';
  end if;
  if p_phone_normalized !~ '^\+[0-9]{6,20}$' then
    raise exception 'Invalid international phone number';
  end if;

  if v_lead_id is null then
    v_lead_id := public.gh_find_or_create_lead(p_first_name, p_email, p_source);
  else
    if not exists (
      select 1 from public.leads
      where id = v_lead_id and lower(email) = lower(trim(p_email))
    ) then
      raise exception 'Lead identity does not match';
    end if;
  end if;

  if p_strategy_call_privacy_consent is not true
     and not coalesce(
       (select scan_privacy_consent from public.leads where id = v_lead_id),
       false
     ) then
    raise exception 'Strategy Call privacy consent is required';
  end if;

  update public.leads
  set
    first_name = left(trim(p_first_name), 80),
    email = lower(trim(p_email)),
    phone = p_phone_normalized,
    phone_country_code = left(trim(p_phone_country_code), 8),
    phone_normalized = p_phone_normalized,
    source = left(trim(p_source), 80),
    status = 'call_requested',
    call_requested = true,
    strategy_call_privacy_consent =
      strategy_call_privacy_consent or coalesce(p_strategy_call_privacy_consent, false),
    strategy_call_phone_consent = true,
    strategy_call_phone_consent_timestamp = p_strategy_call_phone_consent_timestamp,
    marketing_consent = marketing_consent or coalesce(p_marketing_consent, false),
    marketing_consent_timestamp = case
      when p_marketing_consent then coalesce(p_marketing_consent_timestamp, marketing_consent_timestamp)
      else marketing_consent_timestamp
    end,
    marketing_consent_source = case
      when p_marketing_consent then left(p_marketing_consent_source, 80)
      else marketing_consent_source
    end,
    privacy_policy_version = p_privacy_policy_version,
    updated_at = now()
  where id = v_lead_id;

  insert into public.lead_events (lead_id, event_type, processed, payload)
  values (
    v_lead_id,
    'call_requested',
    false,
    jsonb_build_object(
      'first_name', left(trim(p_first_name), 80),
      'email', lower(trim(p_email)),
      'phone_normalized', p_phone_normalized,
      'phone_country_code', p_phone_country_code,
      'source', p_source,
      'strategy_call_privacy_consent', coalesce(p_strategy_call_privacy_consent, false),
      'strategy_call_phone_consent', true,
      'strategy_call_phone_consent_timestamp', p_strategy_call_phone_consent_timestamp,
      'marketing_consent', coalesce(p_marketing_consent, false),
      'marketing_consent_timestamp', case when p_marketing_consent then p_marketing_consent_timestamp else null end,
      'privacy_policy_version', p_privacy_policy_version
    )
  );

  return jsonb_build_object('lead_id', v_lead_id);
end;
$$;

create or replace function public.gh_register_interest(
  p_first_name text,
  p_email text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  v_lead_id := public.gh_find_or_create_lead(p_first_name, p_email, p_source);

  insert into public.lead_events (lead_id, event_type, processed, payload)
  values (
    v_lead_id,
    'resource_requested',
    false,
    jsonb_build_object('source', left(trim(p_source), 80))
  );

  return jsonb_build_object('lead_id', v_lead_id);
end;
$$;

create or replace function public.gh_complete_scan(
  p_lead_id uuid,
  p_email text,
  p_body_score integer,
  p_soul_score integer,
  p_spirit_score integer,
  p_total_score integer,
  p_alignment_gap text,
  p_roadmap_step_1 text,
  p_roadmap_step_2 text,
  p_roadmap_step_3 text,
  p_report_pdf_url text,
  p_report_pdf_path text,
  p_scan_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.leads
    where id = p_lead_id and lower(email) = lower(trim(p_email))
  ) then
    raise exception 'Lead identity does not match';
  end if;
  if p_body_score not between 0 and 100
    or p_soul_score not between 0 and 100
    or p_spirit_score not between 0 and 100
    or p_total_score not between 0 and 100 then
    raise exception 'Invalid scan score';
  end if;

  update public.leads
  set
    body_score = p_body_score,
    soul_score = p_soul_score,
    spirit_score = p_spirit_score,
    total_score = p_total_score,
    alignment_gap = left(p_alignment_gap, 24),
    roadmap_step_1 = left(p_roadmap_step_1, 500),
    roadmap_step_2 = left(p_roadmap_step_2, 500),
    roadmap_step_3 = left(p_roadmap_step_3, 500),
    report_pdf_url = p_report_pdf_url,
    report_pdf_path = p_report_pdf_path,
    scan_answers = p_scan_answers,
    scan_completed = true,
    status = 'scan_completed',
    updated_at = now()
  where id = p_lead_id;

  insert into public.lead_events (lead_id, event_type, processed, payload)
  values (
    p_lead_id,
    'scan_completed',
    false,
    jsonb_build_object(
      'body_score', p_body_score,
      'soul_score', p_soul_score,
      'spirit_score', p_spirit_score,
      'total_score', p_total_score,
      'alignment_gap', p_alignment_gap,
      'roadmap_step_1', p_roadmap_step_1,
      'roadmap_step_2', p_roadmap_step_2,
      'roadmap_step_3', p_roadmap_step_3,
      'report_pdf_url', p_report_pdf_url
    )
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.gh_find_or_create_lead(text, text, text) from public, anon, authenticated;
revoke all on function public.gh_complete_scan(uuid, text, integer, integer, integer, integer, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.gh_complete_scan(uuid, text, integer, integer, integer, integer, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.gh_start_scan(text, text, boolean, timestamptz, boolean, timestamptz, text, text) to anon, authenticated;
grant execute on function public.gh_request_call(uuid, text, text, text, text, text, text, boolean, boolean, timestamptz, boolean, timestamptz, text, text) to anon, authenticated;
grant execute on function public.gh_register_interest(text, text, text) to anon, authenticated;
