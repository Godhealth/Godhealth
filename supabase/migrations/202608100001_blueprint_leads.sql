create extension if not exists pgcrypto;

create table if not exists public.blueprint_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  email text not null,
  newsletter_consent boolean not null default false,
  consent_timestamp timestamptz,
  source text check (source in ('popup','section')),
  user_agent text
);

create unique index if not exists blueprint_leads_email_lower_idx
  on public.blueprint_leads (lower(email));

alter table public.blueprint_leads enable row level security;

drop policy if exists "Allow anon blueprint lead inserts" on public.blueprint_leads;
create policy "Allow anon blueprint lead inserts"
  on public.blueprint_leads
  for insert
  to anon
  with check (true);

create or replace function public.submit_blueprint_lead(
  p_first_name text,
  p_email text,
  p_newsletter_consent boolean default false,
  p_source text default 'section',
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
  v_newsletter boolean := coalesce(p_newsletter_consent,false);
begin
  if nullif(trim(p_first_name),'') is null then
    raise exception 'FIRST_NAME_REQUIRED';
  end if;

  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'EMAIL_INVALID';
  end if;

  if p_source not in ('popup','section') then
    raise exception 'SOURCE_INVALID';
  end if;

  insert into public.blueprint_leads (
    first_name,
    email,
    newsletter_consent,
    consent_timestamp,
    source,
    user_agent
  )
  values (
    trim(p_first_name),
    v_email,
    v_newsletter,
    case when v_newsletter then now() else null end,
    p_source,
    p_user_agent
  )
  on conflict (lower(email)) do update
    set first_name = excluded.first_name,
        newsletter_consent = public.blueprint_leads.newsletter_consent or excluded.newsletter_consent,
        consent_timestamp = case
          when public.blueprint_leads.newsletter_consent then public.blueprint_leads.consent_timestamp
          when excluded.newsletter_consent then excluded.consent_timestamp
          else null
        end,
        source = excluded.source,
        user_agent = excluded.user_agent
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_blueprint_lead(text,text,boolean,text,text) from public;
grant execute on function public.submit_blueprint_lead(text,text,boolean,text,text) to anon;
