#!/usr/bin/env node
/*
 * GodHealth Kingdom Capacity Assessment v2 acceptance tests.
 * Mirrors the supplied acceptance-test package without changing the source definition.
 */
const definition = require("./config-v2.json");
const engine = require("./engine.js");

const tests = [];

function test(id, name, fn){
  tests.push({ id, name, fn });
}

function assert(condition, message){
  if(!condition) throw new Error(message || "Assertion failed");
}

function nearly(actual, expected, tolerance = 0.02){
  assert(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be near ${expected}`);
}

function coreQuestions(){
  return engine.coreQuestions(definition);
}

function domainCoreIds(domainCode){
  return definition.domains.find(domain => domain.code === domainCode).core_question_ids;
}

function coreAnswers(value){
  return Object.fromEntries(coreQuestions().map(question => [question.id, value]));
}

function answersWithDomain(domainCode, values, defaultValue = 4){
  const answers = coreAnswers(defaultValue);
  domainCoreIds(domainCode).forEach((id, index) => {
    answers[id] = values[index];
  });
  return answers;
}

function defaultContext(primary_goal = "energy_capacity"){
  return {
    primary_goal,
    supporting_goals: ["sleep_recovery", "stewardship_alignment"],
    general_readiness: 7
  };
}

function safety(value = "no"){
  return Object.fromEntries((definition.safety_gates || []).map(gate => [gate.id, value]));
}

function stringify(value){
  return JSON.stringify(value, null, 2);
}

test("T01", "Definition counts match v2 architecture", () => {
  const counts = engine.countDefinition(definition);
  assert(counts.domains === 12, "Expected 12 domains");
  assert(counts.core === 36, "Expected 36 core questions");
  assert(counts.deep_dive === 24, "Expected 24 deep-dive questions");
  assert(counts.coach_clarification === 12, "Expected 12 coach clarification prompts");
  assert(counts.safety_gates === 6, "Expected 6 safety gates");
  engine.assertDefinition(definition);
});

test("T02", "All core answers 4 produce 100 scores and no adaptive deep dive", () => {
  const answers = coreAnswers(4);
  const snapshot = engine.scoreAssessment(definition, answers);
  assert(snapshot.kci.display === 100, "KCI should display 100");
  Object.values(snapshot.domain_scores).forEach(score => assert(score.display === 100, `${score.domain_code} should display 100`));
  Object.values(snapshot.pillar_scores).forEach(score => assert(score.display === 100, "Pillar should display 100"));
  const assignment = engine.assignAdaptiveDeepDive(definition, answers, defaultContext());
  assert(assignment.assigned_question_ids.length === 0, "No deep dives should be assigned");
});

test("T03", "All core answers 0 produce 0 scores and first-pass broad deep-dive coverage", () => {
  const answers = coreAnswers(0);
  const snapshot = engine.scoreAssessment(definition, answers);
  assert(snapshot.kci.display === 0, "KCI should display 0");
  const assignment = engine.assignAdaptiveDeepDive(definition, answers, defaultContext());
  assert(assignment.assigned_question_ids.length === 12, "Exactly 12 deep dives should be assigned");
  const assignedDomains = new Set(assignment.assigned_question_ids.map(id => definition.questions.find(q => q.id === id).domain_code));
  assert(assignedDomains.size === 12, "First pass should cover every triggered domain once");
  for(const domain of definition.domains){
    assert(assignment.assigned_question_ids.includes(domain.deep_dive_question_ids[0]), `${domain.code} first deep dive should be assigned`);
  }
});

test("T04", "Single low B2 assigns both B2 deep dives only", () => {
  const answers = answersWithDomain("B2", [0, 0, 0]);
  const snapshot = engine.scoreAssessment(definition, answers);
  assert(snapshot.domain_scores.B2.display === 0, "B2 should display 0");
  const assignment = engine.assignAdaptiveDeepDive(definition, answers, defaultContext("sleep_recovery"));
  assert(stringify(assignment.assigned_question_ids) === stringify(["B2.3", "B2.5"]), "Expected B2.3 and B2.5 only");
});

test("T05", "B2 [3,3,1] scores 58.33 internal / 58 display and assigns both", () => {
  const answers = answersWithDomain("B2", [3, 3, 1]);
  const snapshot = engine.scoreAssessment(definition, answers);
  nearly(snapshot.domain_scores.B2.internal, 58.3333);
  assert(snapshot.domain_scores.B2.display === 58, "B2 should display 58");
  const assignment = engine.assignAdaptiveDeepDive(definition, answers, defaultContext("sleep_recovery"));
  assert(stringify(assignment.assigned_question_ids) === stringify(["B2.3", "B2.5"]), "Expected both B2 deep dives");
});

test("T06", "B2 [3,3,2] scores 66.67 and assigns no B2 deep dive", () => {
  const answers = answersWithDomain("B2", [3, 3, 2]);
  const snapshot = engine.scoreAssessment(definition, answers);
  nearly(snapshot.domain_scores.B2.internal, 66.6667);
  const assignment = engine.assignAdaptiveDeepDive(definition, answers, defaultContext("sleep_recovery"));
  assert(!assignment.assigned_question_ids.some(id => id.startsWith("B2.")), "No B2 deep dive expected");
});

test("T07", "B2 [4,3,1] scores 66.67 and assigns exactly first B2 deep dive", () => {
  const answers = answersWithDomain("B2", [4, 3, 1]);
  const snapshot = engine.scoreAssessment(definition, answers);
  nearly(snapshot.domain_scores.B2.internal, 66.6667);
  const assignment = engine.assignAdaptiveDeepDive(definition, answers, defaultContext("sleep_recovery"));
  assert(stringify(assignment.assigned_question_ids) === stringify(["B2.3"]), "Expected first B2 deep dive only");
});

test("T08", "B2 [4,4,1] scores 75 and assigns no B2 deep dive", () => {
  const answers = answersWithDomain("B2", [4, 4, 1]);
  const snapshot = engine.scoreAssessment(definition, answers);
  assert(snapshot.domain_scores.B2.display === 75, "B2 should display 75");
  const assignment = engine.assignAdaptiveDeepDive(definition, answers, defaultContext("sleep_recovery"));
  assert(!assignment.assigned_question_ids.some(id => id.startsWith("B2.")), "No B2 deep dive expected");
});

test("T09", "Deep-dive answers do not change score", () => {
  const answers = answersWithDomain("B2", [0, 0, 0]);
  const before = engine.scoreAssessment(definition, answers);
  const noisyAnswers = { ...answers, "B2.3": 4, "B2.5": 4, "B1.2": 4, "P4.4": 4 };
  const after = engine.scoreAssessment(definition, noisyAnswers);
  assert(stringify(before.domain_scores) === stringify(after.domain_scores), "Deep-dive answers changed domain scores");
  assert(stringify(before.pillar_scores) === stringify(after.pillar_scores), "Deep-dive answers changed pillar scores");
  assert(stringify(before.kci) === stringify(after.kci), "Deep-dive answers changed KCI");
});

test("T10", "Coach clarification questions are hidden from client baseline", () => {
  const visible = engine.clientBaselineQuestions(definition);
  assert(visible.every(question => question.question_role !== "coach_clarification"), "Coach clarification question leaked to client");
  assert(visible.every(question => !question.coach_only), "Coach-only prompt leaked to client");
});

test("T11", "Adaptive cap is enforced with broad first-pass coverage", () => {
  const assignment = engine.assignAdaptiveDeepDive(definition, coreAnswers(0), defaultContext());
  assert(assignment.assigned_question_ids.length <= 12, "Adaptive assignment exceeded cap");
  const assignedDomains = new Set(assignment.assigned_question_ids.map(id => definition.questions.find(q => q.id === id).domain_code));
  assert(assignedDomains.size === assignment.assigned_question_ids.length, "Expected first-pass broad coverage before second questions");
});

test("T12", "Safety G4 blocks weight-loss/fasting/caloric-restriction recommendations", () => {
  const route = engine.routeSafety(definition, { ...safety("no"), G4:"yes" });
  assert(route.has_flags, "Expected safety flag");
  assert(route.flags.some(flag => flag.action_code === "eating_disorder_scope"), "Expected eating_disorder_scope flag");
  assert(route.restrictions.includes("no_fasting_recommendations"), "Expected no fasting restriction");
  assert(route.restrictions.includes("no_caloric_restriction_recommendations"), "Expected no caloric restriction");
  assert(route.restrictions.includes("no_weight_loss_recommendations"), "Expected no weight-loss restriction");
  assert(route.restrictions.includes("specialist_or_qualified_care_workflow_required"), "Expected qualified-care workflow");
});

test("T13", "Safety G5 stops normal recommendations and routes urgent support only", () => {
  const route = engine.routeSafety(definition, { ...safety("no"), G5:"yes" });
  assert(route.stop_normal_recommendation_flow, "Expected normal flow to stop");
  assert(route.flags.some(flag => flag.action_code === "mental_health_urgent"), "Expected mental_health_urgent flag");
  assert(route.restrictions.includes("urgent_support_routing_only"), "Expected urgent routing only");
});

test("T14", "Big 3 stays hidden before coach approval", () => {
  const snapshot = engine.scoreAssessment(definition, coreAnswers(2));
  const candidates = engine.generateBig3Candidates(definition, snapshot, defaultContext(), engine.routeSafety(definition, safety("no")));
  assert(candidates.client_visible === false, "Candidates must not be client visible");
  assert(candidates.coach_approval_required === true, "Coach approval should be required");
  const client = engine.clientResults(definition, snapshot, null);
  assert(client.big3_locked === true, "Client Big 3 should be locked");
  assert(client.big3 === null, "Client Big 3 should not be shown");
});

test("T15", "Week 12 comparison repeats the same 36 core questions with adaptive off by default", () => {
  const baselineAnswers = coreAnswers(2);
  const baseline = engine.scoreAssessment(definition, baselineAnswers);
  const comparison = engine.createWeek12Comparison(definition, baseline, coreAnswers(3));
  assert(comparison.core_question_ids.length === 36, "Week 12 should use 36 core questions");
  assert(stringify(comparison.core_question_ids) === stringify(coreQuestions().map(q => q.id)), "Week 12 core IDs should match baseline definition");
  assert(comparison.adaptive_deep_dive_default === "off", "Adaptive should be off by default");
  assert(comparison.baseline_immutable === true, "Baseline should be immutable");
});

test("T16", "Definition edit creates a new version when active runs exist", () => {
  const result = engine.versionDefinitionOnEdit(definition, 1, "Acceptance test wording edit");
  assert(result.new_version_created === true, "New version should be created");
  assert(result.historical_runs_immutable === true, "Historical runs should be immutable");
  assert(result.definition.assessment_definition.definition_version !== definition.assessment_definition.definition_version, "Version should change");
  assert(definition.assessment_definition.definition_version === "2.0.0", "Original definition should remain unchanged");
});

test("T17", "Autosave preserves assessment progress", () => {
  const autosave = engine.createMemoryAutosave();
  const progress = { core_answers:{ "B1.1":3 }, step:"core", assigned_deep_dive_question_ids:["B2.3"] };
  autosave.save("run-1", progress);
  assert(stringify(autosave.load("run-1")) === stringify(progress), "Autosave did not preserve progress");
});

test("T18", "Analytics sanitizer removes raw answers, safety and free text", () => {
  const clean = engine.sanitizeAnalyticsPayload({
    event:"kca_started",
    answers:{ "B1.1":3 },
    core_answers:{ "B1.1":3 },
    deep_dive_answers:{ "B2.3":1 },
    safety_answers:{ G5:"yes" },
    free_text_constraints:"private",
    health_context:"private",
    scripture_responses:"private",
    assessment_version:"2.0.0"
  });
  ["answers", "core_answers", "deep_dive_answers", "safety_answers", "free_text_constraints", "health_context", "scripture_responses"].forEach(key => {
    assert(!(key in clean), `${key} should be removed`);
  });
  assert(clean.event === "kca_started", "Safe event metadata should remain");
});

test("T19", "Client language does not infer salvation, holiness, worth or God's approval", () => {
  const snapshot = engine.scoreAssessment(definition, coreAnswers(2));
  const text = stringify(engine.clientResults(definition, snapshot, null)) + "\n" + engine.safeClientLanguageSample();
  const lower = text.toLowerCase();
  ["weak faith", "strong faith", "salvation score", "holiness", "spiritual worth", "god's approval"].forEach(term => {
    assert(!lower.includes(term), `Forbidden spiritual boundary term found: ${term}`);
  });
});

test("T20", "Client language avoids diagnosis, root-cause, treatment and medication directives", () => {
  const snapshot = engine.scoreAssessment(definition, coreAnswers(2));
  const text = stringify(engine.clientResults(definition, snapshot, null)) + "\n" + engine.safeClientLanguageSample();
  const lower = text.toLowerCase();
  ["diagnosis", "diagnose", "root cause", "root-cause", "disease prediction", "treatment directive", "medication change"].forEach(term => {
    assert(!lower.includes(term), `Forbidden clinical term found: ${term}`);
  });
});

let passed = 0;
const failures = [];

for(const item of tests){
  try {
    item.fn();
    passed += 1;
    console.log(`PASS ${item.id} — ${item.name}`);
  } catch(error) {
    failures.push({ ...item, error });
    console.error(`FAIL ${item.id} — ${item.name}`);
    console.error(`     ${error.message}`);
  }
}

console.log("");
console.log(`${passed}/${tests.length} acceptance tests passed.`);

if(failures.length){
  process.exitCode = 1;
}
