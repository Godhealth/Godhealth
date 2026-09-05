-- GodHealth KCA personalized 12-week PDF report support.
-- Adds private report storage without changing the existing assessment flow.

alter table public.kca_assessment_runs
  add column if not exists twelve_week_plan_pdf_url text,
  add column if not exists twelve_week_plan_pdf_path text,
  add column if not exists twelve_week_plan_pdf_generated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kca-reports',
  'kca-reports',
  false,
  12582912,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 12582912,
  allowed_mime_types = array['application/pdf'],
  updated_at = now();

grant select, update on table public.kca_assessment_runs to service_role;
grant select on table public.kca_personal_intakes to service_role;
grant select on table public.kca_plan_engine_runs to service_role;
grant select on table public.kca_energy_profiles to service_role;
grant select on table public.kca_responses to service_role;
grant select on table public.kca_assessment_definitions to service_role;
grant select on table public.kca_coaches to service_role;
grant select on table public.kca_coach_assignments to service_role;
grant insert on table public.kca_audit_events to service_role;
