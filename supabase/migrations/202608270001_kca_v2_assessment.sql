-- GodHealth Kingdom Capacity Assessment v2.0.0
-- Stores authenticated KCA runs without exposing service-role keys.
-- Scores must be produced from the 36 Core questions only.

create extension if not exists pgcrypto;

create table if not exists public.kca_assessment_definitions (
  definition_version text primary key,
  schema_version text not null,
  title text not null,
  definition jsonb not null,
  supersedes text,
  change_reason text,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create table if not exists public.kca_coach_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coach_user_id, client_user_id)
);

create table if not exists public.kca_assessment_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  definition_version text not null references public.kca_assessment_definitions(definition_version),
  assessment_type text not null default 'baseline' check (assessment_type in ('baseline','week12')),
  status text not null default 'draft' check (status in ('draft','submitted','safety_paused','coach_reviewed','published')),
  context jsonb not null default '{}'::jsonb,
  safety_flags jsonb not null default '{}'::jsonb,
  adaptive_assignment jsonb not null default '{}'::jsonb,
  score_snapshot jsonb not null default '{}'::jsonb,
  big3_candidates jsonb not null default '{}'::jsonb,
  baseline_run_id uuid references public.kca_assessment_runs(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kca_responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.kca_assessment_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  question_role text not null check (question_role in ('core','deep_dive','coach_clarification','safety_gate')),
  answer_value integer check (answer_value between 0 and 4),
  answer_text text,
  created_at timestamptz not null default now(),
  unique (run_id, question_id)
);

create table if not exists public.kca_big3_publications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.kca_assessment_runs(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete restrict,
  approved_big3 jsonb not null,
  coach_reason text not null,
  published_to_client boolean not null default false,
  created_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.kca_audit_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.kca_assessment_runs(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.kca_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kca_assessment_runs_touch_updated_at on public.kca_assessment_runs;
create trigger kca_assessment_runs_touch_updated_at
before update on public.kca_assessment_runs
for each row execute function public.kca_touch_updated_at();

alter table public.kca_assessment_definitions enable row level security;
alter table public.kca_coach_assignments enable row level security;
alter table public.kca_assessment_runs enable row level security;
alter table public.kca_responses enable row level security;
alter table public.kca_big3_publications enable row level security;
alter table public.kca_audit_events enable row level security;

drop policy if exists "KCA definitions are readable to authenticated users" on public.kca_assessment_definitions;
create policy "KCA definitions are readable to authenticated users"
on public.kca_assessment_definitions
for select
to authenticated
using (true);

drop policy if exists "Users can read their coach assignments" on public.kca_coach_assignments;
create policy "Users can read their coach assignments"
on public.kca_coach_assignments
for select
to authenticated
using (coach_user_id = auth.uid() or client_user_id = auth.uid());

drop policy if exists "Users can insert their own KCA runs" on public.kca_assessment_runs;
create policy "Users can insert their own KCA runs"
on public.kca_assessment_runs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users and assigned coaches can read KCA runs" on public.kca_assessment_runs;
create policy "Users and assigned coaches can read KCA runs"
on public.kca_assessment_runs
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.kca_coach_assignments a
    where a.client_user_id = kca_assessment_runs.user_id
      and a.coach_user_id = auth.uid()
  )
);

drop policy if exists "Users can update draft own KCA runs" on public.kca_assessment_runs;
create policy "Users can update draft own KCA runs"
on public.kca_assessment_runs
for update
to authenticated
using (user_id = auth.uid() and status in ('draft','submitted'))
with check (user_id = auth.uid());

drop policy if exists "Users can write own KCA responses" on public.kca_responses;
create policy "Users can write own KCA responses"
on public.kca_responses
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.kca_assessment_runs r
    where r.id = kca_responses.run_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "Users and assigned coaches can read KCA responses" on public.kca_responses;
create policy "Users and assigned coaches can read KCA responses"
on public.kca_responses
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.kca_assessment_runs r
    join public.kca_coach_assignments a on a.client_user_id = r.user_id
    where r.id = kca_responses.run_id
      and a.coach_user_id = auth.uid()
  )
);

drop policy if exists "Assigned coaches can publish Big 3" on public.kca_big3_publications;
create policy "Assigned coaches can publish Big 3"
on public.kca_big3_publications
for insert
to authenticated
with check (
  coach_user_id = auth.uid()
  and exists (
    select 1
    from public.kca_assessment_runs r
    join public.kca_coach_assignments a on a.client_user_id = r.user_id
    where r.id = kca_big3_publications.run_id
      and a.coach_user_id = auth.uid()
  )
);

drop policy if exists "Users and assigned coaches can read Big 3 publications" on public.kca_big3_publications;
create policy "Users and assigned coaches can read Big 3 publications"
on public.kca_big3_publications
for select
to authenticated
using (
  exists (
    select 1
    from public.kca_assessment_runs r
    where r.id = kca_big3_publications.run_id
      and r.user_id = auth.uid()
  )
  or coach_user_id = auth.uid()
);

drop policy if exists "Users can write sanitized own KCA audit events" on public.kca_audit_events;
create policy "Users can write sanitized own KCA audit events"
on public.kca_audit_events
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users and assigned coaches can read KCA audit events" on public.kca_audit_events;
create policy "Users and assigned coaches can read KCA audit events"
on public.kca_audit_events
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.kca_assessment_runs r
    join public.kca_coach_assignments a on a.client_user_id = r.user_id
    where r.id = kca_audit_events.run_id
      and a.coach_user_id = auth.uid()
  )
);

insert into public.kca_assessment_definitions (
  definition_version,
  schema_version,
  title,
  definition
) values (
  '2.0.0',
  '2.0.0',
  'GodHealth Kingdom Capacity Assessment v2',
  '{}'::jsonb
) on conflict (definition_version) do nothing;
