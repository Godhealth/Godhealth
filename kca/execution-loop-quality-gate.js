const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = {
  migration: fs.readFileSync(path.join(root, "supabase/migrations/202609060001_kca_execution_loop.sql"), "utf8"),
  dailySeven: fs.readFileSync(path.join(root, "supabase/migrations/202609070001_kca_daily_seven_client_app.sql"), "utf8"),
  client: fs.readFileSync(path.join(root, "client/index.html"), "utf8"),
  coach: fs.readFileSync(path.join(root, "coach-dashboard/index.html"), "utf8")
};

const checks = [
  ["Daily prescriptions table exists", /create table if not exists public\.client_foundation_prescriptions/i, files.migration],
  ["Daily logs table exists", /create table if not exists public\.daily_foundation_logs/i, files.migration],
  ["Weekly reflections table exists", /create table if not exists public\.weekly_reflections/i, files.migration],
  ["Weekly summaries table exists", /create table if not exists public\.weekly_execution_summaries/i, files.migration],
  ["Duplicate client/date/prescription logs are prevented", /unique\s*\(\s*client_user_id,\s*prescription_id,\s*log_date\s*\)/i, files.migration],
  ["RLS is enabled for execution tables", /alter table public\.daily_foundation_logs enable row level security/i, files.migration],
  ["Clients can only write own logs", /with check\s*\(\s*client_user_id\s*=\s*auth\.uid\(\)\s*\)/i, files.migration],
  ["Coach access uses existing coach authorization", /kca_is_coach\(\).*kca_can_access_client/s, files.migration],
  ["N\\/A foundations are supported", /not_applicable/i, files.migration],
  ["Weekly execution bands are implemented", /Strong Execution[\s\S]*Building[\s\S]*Needs Attention/i, files.migration],
  ["Daily Seven defaults are implemented", /kca_daily_seven_defaults[\s\S]*seek[\s\S]*hydrate[\s\S]*eat[\s\S]*move[\s\S]*recover[\s\S]*renew[\s\S]*serve/i, files.dailySeven],
  ["Prescription history is kept when Daily Seven supersedes old foundations", /active_until[\s\S]*superseded_by[\s\S]*daily_seven/i, files.dailySeven],
  ["Client Today screen exists", /id="screen-today"|id='screen-today'/i, files.client],
  ["Today loads through the minimal dashboard RPC", /kca_get_today_dashboard/i, files.client],
  ["Daily tap saves through Supabase RPC", /kca_toggle_daily_foundation/i, files.client],
  ["Client save failure shows Not saved retry state", /Not saved\s*—[\s\S]*retry/i, files.client],
  ["Bottom navigation is limited to five client tabs", /data-tab="today"[\s\S]*data-tab="journey"[\s\S]*data-tab="food"[\s\S]*data-tab="training"[\s\S]*data-tab="progress"/i, files.client],
  ["Weekly reflection captures Body Soul Spirit and coach note", /p_body_answer[\s\S]*p_soul_answer[\s\S]*p_spirit_answer[\s\S]*p_coach_note/i, files.client],
  ["Coach execution overview is present", /kca_coach_execution_overview/i, files.coach],
  ["Coach weekly detail is present", /kca_coach_execution_detail/i, files.coach],
  ["Coach can save next week foundations", /kca_coach_save_foundation_prescriptions/i, files.coach],
  ["Coach heatmap UI is present", /7-Day Heatmap|heatmap-grid/i, files.coach]
];

let failed = 0;
for (const [name, pattern, source] of checks) {
  if (pattern.test(source)) {
    console.log(`PASS — ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL — ${name}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${checks.length} execution loop quality checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} execution loop quality checks passed.`);
