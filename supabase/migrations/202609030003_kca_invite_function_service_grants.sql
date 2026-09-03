-- GodHealth KCA invite function service-role grants.
-- The Edge Function uses the service role on the server only; these grants do
-- not expose coach/client records to the public frontend.

grant select on table public.kca_coaches to service_role;
grant select, insert, update on table public.kca_client_entitlements to service_role;
grant select, insert, update on table public.kca_coach_assignments to service_role;
grant insert on table public.kca_audit_events to service_role;
