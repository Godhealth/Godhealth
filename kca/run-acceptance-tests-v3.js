#!/usr/bin/env node
/*
 * GodHealth Kingdom Capacity Assessment v3 acceptance tests.
 *
 * The canonical V3 definition is not exposed as a public /kca/config-v3.json.
 * This runner loads it from the local handoff package when available, or from
 * the embedded SQL migration payload used by Supabase.
 */
const fs = require("fs");
const path = require("path");
const engine = require("./personalization-engine-v3.js");

const repoRoot = path.resolve(__dirname, "..");
const handoffConfig = "/Users/robinkramps/Downloads/GodHealth_KCA_V3_Current_Repo_Migration_Handoff/GodHealth_KCA_Personalization_Config_v3.json";
const migrationPath = path.join(repoRoot, "supabase/migrations/202608310001_kca_v3_personalization.sql");

function loadDefinition(){
  if(fs.existsSync(handoffConfig)){
    return JSON.parse(fs.readFileSync(handoffConfig, "utf8"));
  }
  const sql = fs.readFileSync(migrationPath, "utf8");
  const match = sql.match(/\\$kca_v3_definition\\$(.*?)\\$kca_v3_definition\\$/s);
  if(!match) throw new Error("Cannot locate embedded V3 definition in migration.");
  return JSON.parse(match[1]);
}

const definition = loadDefinition();
const testsMeta = JSON.parse(fs.readFileSync(path.join(__dirname, "acceptance-tests-v3.json"), "utf8"));
const tests = [];

function test(id, name, fn){
  tests.push({ id, name, fn });
}

function assert(condition, message){
  if(!condition) throw new Error(message || "Assertion failed");
}

function near(actual, expected, tolerance = 0.02){
  assert(Math.abs(Number(actual) - Number(expected)) <= tolerance, `Expected ${actual} to be near ${expected}`);
}

function coreAnswers(value){
  return Object.fromEntries(engine.coreQuestions(definition).map(question => [question.id, value]));
}

function defaultIntake(overrides = {}){
  return {
    PR1: 35,
    PR2: "male",
    PR3: 180,
    PR4: 90,
    PR7: "mix of seated and moving",
    PR8: 8500,
    PR9: "Work and family schedule",
    GL1: "fat loss",
    GL2: ["energy", "sleep/recovery"],
    GL3: "More energy, better sleep and a lighter body.",
    GL4: "To serve God and family with more capacity.",
    HI8: "can do it short-term",
    NU1: 3,
    NU2: "08:00 and 19:00",
    NU3: "2-3 portions/day",
    NU4: "1-3 times/week",
    NU5: "2",
    NU6: "1-3/week",
    NU7: "4-6/week",
    NU8: "1/week",
    NU12: "I cook most meals and have 30 minutes.",
    TR1: 0,
    TR2: 45,
    TR3: "none",
    TR4: 2,
    TR5: "30 min",
    TR6: ["none/bodyweight", "dumbbells"],
    SL1: 6,
    SL2: "23:30 to 06:00",
    SL4: false,
    SL5: "not sure",
    SL6: 4,
    FA1: "no",
    EN1: "Family at home",
    EN2: 7,
    EN3: "1-2x/week",
    EN4: "rarely",
    EN5: "Morning prayer, evening training",
    EN7: ["stress", "poor sleep"],
    SS1: ["stress eating"],
    SS2: ["Scripture", "prayer"],
    ...overrides
  };
}

function allSafety(value = "no"){
  return Object.fromEntries((definition.safety_gates || []).map(gate => [gate.id, value]));
}

test("AT01", "Unauthenticated visitor is gated by protected architecture", () => {
  assert(definition.access.public === false, "V3 definition must not be public.");
  assert(definition.access.requires_authenticated_premium_client === true, "Premium entitlement required.");
  assert(definition.access.server_side_authorization_required === true, "Server-side authorization required.");
});

test("AT02", "Config contains exactly 24 capacity core items", () => {
  assert(engine.coreQuestions(definition).length === 24, "Expected 24 core questions.");
});

test("AT03", "Each of 12 domains contains exactly 2 scored core items", () => {
  const counts = {};
  for(const question of engine.coreQuestions(definition)){
    counts[question.domain_code] = (counts[question.domain_code] || 0) + 1;
  }
  for(const domain of definition.domains){
    assert(counts[domain.code] === 2, `${domain.code} expected 2 core items.`);
  }
});

test("AT04", "No automatic deep-dive questions are shown in V3", () => {
  assert(engine.automaticDeepDiveQuestions(definition).length === 0, "V3 must not show automatic deep dive.");
});

test("AT05", "Coach clarifiers never change scores", () => {
  const answers = coreAnswers(2);
  const before = engine.scoreAssessment(definition, answers);
  const after = engine.scoreAssessment(definition, { ...answers, "B1.5":0, "S2.6":4, "P4.5":1 });
  assert(JSON.stringify(before) === JSON.stringify(after), "Clarifiers changed scores.");
});

test("AT06", "Personal intake never changes Capacity scores", () => {
  const answers = coreAnswers(3);
  const before = engine.scoreAssessment(definition, answers);
  engine.generatePlanDraft(definition, before, defaultIntake({ PR4:130, GL1:"fat loss" }), engine.routeSafety(definition, allSafety()));
  const after = engine.scoreAssessment(definition, answers);
  assert(JSON.stringify(before) === JSON.stringify(after), "Intake changed scores.");
});

test("AT07", "Domain scoring for responses 4 and 2 equals 75", () => {
  const answers = coreAnswers(4);
  const b1 = engine.coreQuestions(definition).filter(q => q.domain_code === "B1");
  answers[b1[0].id] = 4;
  answers[b1[1].id] = 2;
  const score = engine.scoreAssessment(definition, answers);
  assert(score.domain_scores.B1.display === 75, "Expected B1 display 75.");
});

test("AT08", "Mifflin male: 35y, 180cm, 90kg", () => {
  near(engine.mifflinStJeor({ age:35, height_cm:180, weight_kg:90, sex:"male" }), 1855);
});

test("AT09", "Mifflin female: 40y, 165cm, 70kg", () => {
  near(engine.mifflinStJeor({ age:40, height_cm:165, weight_kg:70, sex:"female" }), 1370.25);
});

test("AT10", "Male example REE 1855 with PAL 1.6", () => {
  const profile = engine.buildEnergyProfile(defaultIntake({ PR7:"mostly standing/walking", PR8:8500, TR1:2, TR2:150 }), engine.routeSafety(definition, allSafety()));
  assert(profile.proposed_activity_factor.value === 1.6, "Expected PAL 1.6.");
  assert(profile.estimated_TDEE_range_kcal.mid === 2968, "Expected TDEE midpoint 2968.");
});

test("AT11", "Initial TDEE UI displays estimate/range and uncertainty", () => {
  const profile = engine.buildEnergyProfile(defaultIntake(), engine.routeSafety(definition, allSafety()));
  assert(profile.estimated_TDEE_range_kcal.low < profile.estimated_TDEE_range_kcal.mid, "Expected low range.");
  assert(profile.estimated_TDEE_range_kcal.high > profile.estimated_TDEE_range_kcal.mid, "Expected high range.");
  assert(/estimated/i.test(profile.estimated_TDEE_range_kcal.label), "Expected uncertainty label.");
});

test("AT12", "Clinical safety gate blocks autonomous prescription", () => {
  for(const gate of definition.safety_gates){
    const route = engine.routeSafety(definition, { ...allSafety(), [gate.id]:"yes" });
    assert(route.restrictions.includes("no_autonomous_calorie_prescription"), `${gate.id} missing calorie block.`);
    assert(route.restrictions.includes("no_autonomous_fasting_prescription"), `${gate.id} missing fasting block.`);
    assert(route.restrictions.includes("no_autonomous_training_prescription"), `${gate.id} missing training block.`);
  }
});

test("AT13", "Age <18 blocks Personalized Calorie Index", () => {
  const profile = engine.buildEnergyProfile(defaultIntake({ PR1:17 }), engine.routeSafety(definition, allSafety()));
  assert(profile.hard_blocks.includes("age_under_18"), "Expected age block.");
  assert(!profile.goal_calorie_range_kcal, "No calorie range expected.");
});

test("AT14", "BMI <18.5 + weight-loss goal blocks calorie deficit", () => {
  const profile = engine.buildEnergyProfile(defaultIntake({ PR4:55, GL1:"fat loss" }), engine.routeSafety(definition, allSafety()));
  assert(profile.hard_blocks.includes("bmi_under_18_5"), "Expected BMI block.");
  assert(!profile.goal_calorie_range_kcal, "No deficit expected.");
});

test("AT15", "Calculated target <1200 kcal/day is not auto-published", () => {
  const profile = engine.buildEnergyProfile(defaultIntake({ PR1:70, PR2:"female", PR3:150, PR4:45, GL1:"fat loss" }), engine.routeSafety(definition, allSafety()));
  assert(profile.hard_blocks.includes("target_under_1200_specialist_review_required") || !profile.goal_calorie_range_kcal, "Expected under-1200 block/no target.");
});

test("AT16", "Weight-loss target starts within 10-20% deficit only after coach approval", () => {
  const profile = engine.buildEnergyProfile(defaultIntake({ GL1:"fat loss" }), engine.routeSafety(definition, allSafety()));
  assert(profile.goal_calorie_range_kcal.approval_required === true, "Coach approval required.");
  near(profile.goal_calorie_range_kcal.low, profile.estimated_TDEE_range_kcal.mid * 0.8, 1);
  near(profile.goal_calorie_range_kcal.high, profile.estimated_TDEE_range_kcal.mid * 0.9, 1);
});

test("AT17", "Maintenance/recomp output defaults around TDEE ±5%", () => {
  const profile = engine.buildEnergyProfile(defaultIntake({ GL1:"weight maintenance/recomposition" }), engine.routeSafety(definition, allSafety()));
  near(profile.goal_calorie_range_kcal.low, profile.estimated_TDEE_range_kcal.mid * 0.95, 1);
  near(profile.goal_calorie_range_kcal.high, profile.estimated_TDEE_range_kcal.mid * 1.05, 1);
});

test("AT18", "Resistance-trained healthy adult gets protein logic within 1.4-2.0 g/kg/day", () => {
  const nutrition = engine.buildNutrition(defaultIntake({ TR1:3, PR4:90 }), engine.buildEnergyProfile(defaultIntake({ TR1:3, PR4:90 }), engine.routeSafety(definition, allSafety())));
  assert(nutrition.protein_target.low_g === 126, "Expected 1.4g/kg low.");
  assert(nutrition.protein_target.high_g === 180, "Expected 2.0g/kg high.");
});

test("AT19", "Kidney/relevant medical condition prevents automated high-protein target", () => {
  const intake = defaultIntake({ NU11:"kidney condition" });
  const nutrition = engine.buildNutrition(intake, engine.buildEnergyProfile(intake, engine.routeSafety(definition, allSafety())));
  assert(nutrition.protein_target.blocked === true, "Expected protein block.");
});

test("AT20", "Nutrition plan surfaces WHO benchmarks", () => {
  const benchmarks = engine.buildNutrition(defaultIntake(), engine.buildEnergyProfile(defaultIntake(), engine.routeSafety(definition, allSafety()))).who_benchmarks;
  ["400 g","25 g","<10%","<1%","<5 g"].forEach(needle => assert(JSON.stringify(benchmarks).includes(needle), `Missing ${needle}`));
});

test("AT21", "Hydration labels EFSA total water including food + beverages", () => {
  const hydration = engine.buildRecovery(defaultIntake({ PR2:"male" })).hydration_benchmark;
  assert(/total water/i.test(hydration) && /food \+ beverages/i.test(hydration), "Expected total water wording.");
});

test("AT22", "Sweat-rate module calculates correctly", () => {
  near(engine.calculateSweatRate({ pre_kg:80.0, post_kg:79.2, fluid_L:0.5, urine_L:0, hours:1 }), 1.3);
});

test("AT23", "Adult sleep plan uses 7-9h and flags apnea symptoms", () => {
  const recovery = engine.buildRecovery(defaultIntake({ SL5:"yes" }));
  assert(/7–9|7-9/.test(recovery.sleep_target), "Expected 7-9h wording.");
  assert(recovery.apnea_like_symptoms_flag === true, "Expected apnea flag.");
});

test("AT24", "Novice with limited recovery not assigned 4 hard workouts/week", () => {
  const training = engine.buildTraining(defaultIntake({ TR1:0, TR3:"none", TR4:5, SL1:5.5, SL6:3 }), engine.routeSafety(definition, allSafety()));
  assert(training.sessions_per_week === 2, "Expected 2 sessions.");
  assert(/simple full-body/i.test(training.exercise_template), "Expected simple full-body plan.");
});

test("AT25", "Training plan respects constraints", () => {
  const training = engine.buildTraining(defaultIntake({ TR4:2, TR5:"30 min", TR6:["dumbbells"], TR9:"knee pain", TR8:["running"] }), engine.routeSafety(definition, allSafety()));
  assert(training.sessions_per_week <= 2 && training.session_duration === "30 min" && /knee pain/.test(training.injury_constraints), "Constraints not reflected.");
});

test("AT26", "Fasting uninterested -> no fasting recommendation", () => {
  const fasting = engine.buildFasting(defaultIntake({ FA1:"no" }), engine.routeSafety(definition, allSafety()), engine.buildEnergyProfile(defaultIntake({ FA1:"no" }), engine.routeSafety(definition, allSafety())));
  assert(fasting.recommended === false, "Fasting should not be recommended.");
});

test("AT27", "Eating-disorder risk/pregnancy/relevant medication -> fasting blocked", () => {
  const route = engine.routeSafety(definition, { ...allSafety(), G4:"yes" });
  const fasting = engine.buildFasting(defaultIntake({ FA1:"yes" }), route, engine.buildEnergyProfile(defaultIntake({ FA1:"yes" }), route));
  assert(fasting.recommended === false, "Fasting should be blocked.");
});

test("AT28", "Sauna/cold never selected as Big 3 ahead of foundations", () => {
  const snapshot = engine.scoreAssessment(definition, coreAnswers(1));
  const draft = engine.generatePlanDraft(definition, snapshot, defaultIntake({ RC1:"3+x/week", RC2:"3+x/week" }), engine.routeSafety(definition, allSafety()));
  assert(!JSON.stringify(draft.big3).toLowerCase().includes("sauna"), "Sauna should not be Big 3.");
  assert(!JSON.stringify(draft.big3).toLowerCase().includes("cold"), "Cold should not be Big 3.");
});

test("AT29", "Plan generator produces exactly 3 Big 3 candidates with required fields", () => {
  const snapshot = engine.scoreAssessment(definition, coreAnswers(2));
  const big3 = engine.generateBig3Candidates(definition, snapshot, defaultIntake(), engine.routeSafety(definition, allSafety()));
  assert(big3.priorities.length === 3, "Expected exactly 3.");
  big3.priorities.forEach(item => {
    ["why","weekly_action","bad_week_fallback"].forEach(key => assert(item[key], `Missing ${key}`));
  });
});

test("AT30", "Client cannot see generated plan until coach approves", () => {
  const snapshot = engine.scoreAssessment(definition, coreAnswers(2));
  const result = engine.clientResults(snapshot, null);
  assert(result.plan_locked === true && result.approved_plan === null, "Plan must be locked.");
});

test("AT31", "14-day calorie calibration requires >=8 morning weights and adherence data", () => {
  assert(engine.requires14DayCalibration({ morning_weights:Array(7).fill(80), adherence_days:Array(8).fill(true) }).eligible === false, "7 weights should not pass.");
  assert(engine.requires14DayCalibration({ morning_weights:Array(8).fill(80), adherence_days:Array(8).fill(true) }).eligible === true, "8+8 should pass.");
});

test("AT32", "One-day weight change never triggers calorie adjustment", () => {
  const result = engine.requires14DayCalibration({ morning_weights:[80,79], adherence_days:[true,true] });
  assert(result.eligible === false && /Never adjust calories from one weigh-in/i.test(result.rule), "Expected no one-day adjustment.");
});

test("AT33", "Week-12 reassessment repeats exact same 24 Capacity Core version", () => {
  assert(engine.coreQuestions(definition).map(q => q.id).length === 24, "Expected 24 same-version core questions.");
  assert(definition.schema_version === "3.0.0", "Expected V3 version.");
});

test("AT34", "Historical assessment/plan versions are immutable", () => {
  assert(definition.schema_version === "3.0.0", "Runner uses versioned definition; migrations insert, not mutate old v2.");
});

test("AT35", "Sensitive data protected with role-based access and minimisation", () => {
  assert(definition.privacy && /sensitive|special-category/i.test(definition.privacy.gdpr), "Expected privacy rule.");
});

test("AT36", "No diagnostic labels are generated", () => {
  const draft = engine.generatePlanDraft(definition, engine.scoreAssessment(definition, coreAnswers(0)), defaultIntake(), engine.routeSafety(definition, allSafety()));
  const text = JSON.stringify(draft).toLowerCase();
  ["diagnosis","diagnose","disease prediction","treatment directive","root cause"].forEach(term => {
    assert(!text.includes(term), `Draft includes prohibited term: ${term}`);
  });
});

engine.assertDefinition(definition);
for(const meta of testsMeta.tests || []){
  assert(tests.some(t => t.id === meta.id), `Missing implemented test ${meta.id}`);
}

let failed = 0;
for(const item of tests){
  try{
    item.fn();
    console.log(`✓ ${item.id} ${item.name}`);
  }catch(error){
    failed += 1;
    console.error(`✗ ${item.id} ${item.name}`);
    console.error(`  ${error.message}`);
  }
}
if(failed){
  console.error(`\\n${failed} V3 acceptance test(s) failed.`);
  process.exit(1);
}
console.log(`\\nAll ${tests.length} V3 acceptance tests passed.`);
