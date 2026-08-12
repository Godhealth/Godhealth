create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.leads add column if not exists first_name text;
alter table public.leads add column if not exists email text;
alter table public.leads add column if not exists source text;
alter table public.leads add column if not exists status text;
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

alter table public.leads enable row level security;
alter table public.lead_events enable row level security;

revoke all on public.leads from anon, authenticated;
revoke all on public.lead_events from anon, authenticated;

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
  if length(trim(coalesce(p_first_name, ''))) < 1
     or length(trim(coalesce(p_first_name, ''))) > 80 then
    raise exception 'Invalid first name';
  end if;

  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_email) > 254 then
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

revoke all on function public.gh_find_or_create_lead(text, text, text) from public, anon, authenticated;
revoke all on function public.gh_register_interest(text, text, text) from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant execute on function public.gh_register_interest(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
