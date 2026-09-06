import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "npm:pdf-lib@1.17.1";

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = { width: 595.28, height: 841.89 };
const C = {
  forest: rgb(0.025, 0.105, 0.075),
  forest2: rgb(0.045, 0.16, 0.115),
  panel: rgb(0.06, 0.19, 0.13),
  panel2: rgb(0.085, 0.235, 0.165),
  gold: rgb(0.79, 0.63, 0.29),
  gold2: rgb(0.93, 0.82, 0.52),
  cream: rgb(0.97, 0.95, 0.88),
  muted: rgb(0.73, 0.75, 0.69),
  dark: rgb(0.012, 0.028, 0.019),
  danger: rgb(0.80, 0.22, 0.17),
};

type Fonts = {
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
};

type Detail = {
  run: Record<string, any>;
  intake: Record<string, any> | null;
  engine_run: Record<string, any> | null;
  energy_profile: Record<string, any> | null;
  responses: Record<string, any>[];
  definition: Record<string, any> | null;
  client: { email: string; name: string };
};

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

function secretKey(): string {
  const current = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (current) {
    const keys = JSON.parse(current) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Missing required server configuration: SUPABASE_SECRET_KEYS");
}

function publicKeys(): string[] {
  const keys: string[] = [];
  const current = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (current) {
    const parsed = JSON.parse(current) as Record<string, string>;
    keys.push(...Object.values(parsed));
  }
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) keys.push(legacy);
  return keys;
}

function corsHeaders(request: Request): HeadersInit {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  const requestOrigin = request.headers.get("origin") || "";
  const allowedOrigin = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0] || requestOrigin || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validateOrigin(request: Request): void {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!allowedOrigins.length) return;
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) throw new Error("ORIGIN_NOT_ALLOWED");
}

function validatePublishableKey(request: Request): void {
  const accepted = publicKeys();
  if (!accepted.length) return;
  const key = request.headers.get("apikey") || "";
  if (!accepted.includes(key)) throw new Error("INVALID_PUBLIC_KEY");
}

function cleanText(value: unknown, maxLength = 240): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function ascii(value: unknown): string {
  return String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•]/g, "-")
    .replace(/[✓]/g, "OK")
    .replace(/[^\x20-\x7E]/g, "");
}

function safeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function snapshot(detail: Detail): Record<string, any> {
  return detail.run.score_snapshot || {};
}

function pillars(detail: Detail): Record<string, any> {
  return snapshot(detail).pillar_scores || {};
}

function scoreOfPillar(detail: Detail, key: string): number {
  return safeNumber(pillars(detail)[key]?.display);
}

function kci(detail: Detail): number {
  const explicitRaw = snapshot(detail).kci?.display;
  if (explicitRaw !== null && explicitRaw !== undefined && explicitRaw !== "") return safeNumber(explicitRaw);
  const values = ["BODY", "SOUL", "SPIRIT"]
    .map((key) => pillars(detail)[key]?.display)
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => safeNumber(value));
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function domains(detail: Detail): Record<string, any>[] {
  return Object.values(snapshot(detail).domain_scores || {})
    .filter((item: any) => item && item.status !== "missing")
    .sort((a: any, b: any) => String(a.domain_code).localeCompare(String(b.domain_code)));
}

function primaryGap(detail: Detail): Record<string, any> | null {
  return domains(detail).slice().sort((a: any, b: any) => Number(a.internal) - Number(b.internal))[0] || null;
}

function intakeAnswers(detail: Detail): Record<string, any> {
  const direct = detail.intake?.intake;
  if (direct && typeof direct === "object" && Object.keys(direct).length) return direct;
  const engine = detail.engine_run?.input_snapshot?.intake;
  if (engine && typeof engine === "object" && Object.keys(engine).length) return engine;
  return detail.run.context || {};
}

function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  return cleanText(value, 700);
}

function answerRows(detail: Detail): { label: string; value: string }[] {
  const intake = intakeAnswers(detail);
  const fields = detail.definition?.personal_transformation_intake || [];
  const used = new Set<string>();
  const rows = fields.map((field: any) => {
    used.add(field.id);
    return { label: field.label || field.id, value: valueText(intake[field.id]) };
  }).filter((row: any) => row.value);
  Object.keys(intake || {}).forEach((key) => {
    if (used.has(key)) return;
    const value = valueText(intake[key]);
    if (value) rows.push({ label: key.replace(/_/g, " "), value });
  });
  return rows;
}

function allDefinitionQuestions(detail: Detail): Record<string, any>[] {
  const definition = detail.definition || {};
  return [
    ...(definition.safety_gates || []).map((gate: any) => ({
      ...gate,
      domain_code: "SAFETY",
      pillar: "SAFETY",
      question_role: "safety_gate",
      statement: gate.question || gate.prompt || gate.if_yes || gate.id,
    })),
    ...(definition.capacity_core || []),
    ...(definition.coach_clarifiers || []),
    ...(definition.questions || []),
  ];
}

function questionMap(detail: Detail): Map<string, Record<string, any>> {
  const map = new Map<string, Record<string, any>>();
  allDefinitionQuestions(detail).forEach((question) => {
    if (question?.id) map.set(question.id, question);
  });
  return map;
}

function questionOrderMap(detail: Detail): Map<string, number> {
  const map = new Map<string, number>();
  allDefinitionQuestions(detail).forEach((question, index) => {
    if (question?.id) map.set(question.id, index);
  });
  return map;
}

function domainLabel(detail: Detail, code: string): string {
  const domain = (detail.definition?.domains || []).find((item: any) => item.code === code);
  return domain ? `${domain.code} - ${domain.name}` : code;
}

function questionText(detail: Detail, response: Record<string, any>): string {
  const question = questionMap(detail).get(response.question_id) || {};
  return cleanText(
    question.statement || question.question || question.prompt || response.question_text || response.answer_text || response.question_id,
    900,
  );
}

function scaleLabel(detail: Detail, value: unknown): string {
  const numeric = Number(value);
  const scale = detail.definition?.response_scale || [];
  const match = scale.find((item: any) => Number(item.value) === numeric);
  return match?.label || ["Not true / Never", "Rarely true", "Sometimes true", "Mostly true", "Consistently true"][numeric] || "Answer";
}

function responseAnswerLabel(detail: Detail, response: Record<string, any>): string {
  const value = response.answer_value;
  if (value !== null && value !== undefined && value !== "" && response.question_role === "core") {
    return `${valueText(value)} - ${scaleLabel(detail, value)}`;
  }
  if (response.display_answer) return valueText(response.display_answer);
  const text = cleanText(response.answer_text || "", 700);
  if (text.includes(" - ")) return text.split(" - ")[0].trim();
  if (text.includes(" — ")) return text.split(" — ")[0].trim();
  if (text) return text;
  if (value !== null && value !== undefined && value !== "") return valueText(value);
  return "No answer";
}

function sortedResponses(detail: Detail, role: string): Record<string, any>[] {
  const order = questionOrderMap(detail);
  return detail.responses
    .filter((response) => response.question_role === role)
    .sort((a, b) => (order.get(a.question_id) ?? 9999) - (order.get(b.question_id) ?? 9999));
}

function pickIntake(intake: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = valueText(intake[key]);
    if (value) return value;
  }
  return "";
}

function personalContextRows(detail: Detail): { label: string; value: string }[] {
  const intake = intakeAnswers(detail);
  const energy = energyProfile(detail);
  const goalRange = energy.goal_calorie_range_kcal || energy.goal_calorie_range || {};
  const tdee = energy.estimated_TDEE_range_kcal || energy.tdee_range || {};
  const rows = [
    { label: "Primary goal", value: pickIntake(intake, ["GO1", "primary_goal", "goal", "main_goal"]) },
    { label: "Current weight", value: pickIntake(intake, ["BD4", "current_weight_kg", "weight_kg", "current_weight"]) },
    { label: "Target weight", value: pickIntake(intake, ["BD4_TARGET", "target_weight_kg", "target_weight", "goal_weight"]) },
    { label: "Work hours each week", value: pickIntake(intake, ["EN8", "work_hours_per_week", "work_hours"]) },
    { label: "Sleep pattern", value: pickIntake(intake, ["SL1", "average_sleep", "sleep_hours"]) },
    { label: "Blue screens before bed", value: pickIntake(intake, ["SL7", "blue_screens_before_bed"]) },
    { label: "Weekly schedule constraints", value: pickIntake(intake, ["EN5", "schedule_constraints", "time_windows"]) },
    { label: "Routine usually collapses through", value: pickIntake(intake, ["EN7", "routine_collapse"]) },
    { label: "Training availability", value: pickIntake(intake, ["TR3", "training_days_available", "TR5", "workout_time"]) },
    { label: "Available equipment", value: pickIntake(intake, ["TR6", "equipment"]) },
    { label: "Food pattern to respect", value: pickIntake(intake, ["NU8", "nutrition_struggles", "NU9", "food_preferences"]) },
    { label: "Spiritual rhythm to strengthen", value: pickIntake(intake, ["SS2", "spiritual_rhythm"]) },
  ];
  if (goalRange.low && goalRange.high) rows.splice(3, 0, { label: "Estimated starting calorie range", value: `${goalRange.low}-${goalRange.high} kcal (coach-reviewed starting point)` });
  if (tdee.low && tdee.high) rows.splice(3, 0, { label: "Estimated energy need", value: `${tdee.low}-${tdee.high} kcal (estimate, not exact metabolism)` });
  return rows.filter((row) => row.value);
}

function scoreLevel(score: number): string {
  if (score >= 80) return "strong";
  if (score >= 65) return "developing";
  if (score >= 50) return "fragile";
  return "needs first attention";
}

function pillarFocusText(detail: Detail, pillar: "BODY" | "SOUL" | "SPIRIT"): string {
  const score = scoreOfPillar(detail, pillar);
  const level = scoreLevel(score);
  const intake = intakeAnswers(detail);
  if (pillar === "BODY") {
    const sleep = pickIntake(intake, ["SL1", "SL6"]);
    const training = pickIntake(intake, ["TR3", "TR5", "TR6"]);
    const nutrition = pickIntake(intake, ["NU8", "NU9", "NU10"]);
    return `Body is currently ${level} (${score}). Start with sleep rhythm, protein/whole-food structure and repeatable movement. ${sleep ? `Sleep signal: ${sleep}. ` : ""}${training ? `Training context: ${training}. ` : ""}${nutrition ? `Nutrition context: ${nutrition}.` : ""}`;
  }
  if (pillar === "SOUL") {
    const stress = pickIntake(intake, ["SS1", "EN7", "EN2"]);
    return `Soul is currently ${level} (${score}). Your plan should reduce friction, protect simple routines and create a comeback path after stress. ${stress ? `Main pattern to watch: ${stress}.` : ""}`;
  }
  const rhythm = pickIntake(intake, ["SS2"]);
  return `Spirit is currently ${level} (${score}). Keep health connected to worship: Scripture before noise, honest prayer and one daily act of stewardship. ${rhythm ? `Rhythm to strengthen: ${rhythm}.` : ""}`;
}

function personalizedPlanLevers(detail: Detail): { title: string; body: string }[] {
  const gap = primaryGap(detail);
  const intake = intakeAnswers(detail);
  const levers = [
    { title: "Primary focus", body: gap ? `${gap.domain_name || gap.name || gap.domain_code} is your first capacity signal. Begin there before adding complexity.` : "Start with coach review of your intake, capacity scores and weekly constraints." },
    { title: "Body lever", body: pillarFocusText(detail, "BODY") },
    { title: "Soul lever", body: pillarFocusText(detail, "SOUL") },
    { title: "Spirit lever", body: pillarFocusText(detail, "SPIRIT") },
  ];
  const routineCollapse = pickIntake(intake, ["EN7", "routine_collapse"]);
  if (routineCollapse) levers.push({ title: "Fallback plan", body: `When your routine collapses through ${routineCollapse}, return to the smallest next step: one real-food meal, one walk, one prayer, one protected bedtime.` });
  if (hasSafetyPause(detail)) levers.unshift({ title: "Safety routing", body: "Your answers include safety context. Do not treat this as a willpower issue. Let a GodHealth coach review before progressing calories, fasting or training." });
  return levers;
}

function planDraft(detail: Detail): Record<string, any> {
  return detail.engine_run?.plan_draft || detail.engine_run?.generated_plan || {};
}

function big3(detail: Detail): Record<string, any>[] {
  const draft = planDraft(detail);
  const fromDraft = draft.big3 || draft.priorities;
  if (Array.isArray(fromDraft) && fromDraft.length) return fromDraft.slice(0, 3);
  const fromRun = detail.run.big3_candidates?.priorities || detail.run.big3_candidates?.big3;
  if (Array.isArray(fromRun) && fromRun.length) return fromRun.slice(0, 3);
  const gap = primaryGap(detail);
  return gap ? [{
    title: gap.domain_name || gap.name || gap.domain_code,
    pillar: gap.pillar,
    reason: "This is the lowest capacity signal in your assessment.",
    action: "Start with one small daily action in this area before adding more.",
  }] : [];
}

function energyProfile(detail: Detail): Record<string, any> {
  return detail.energy_profile?.profile || detail.energy_profile || planDraft(detail).energy_profile || {};
}

function hasSafetyPause(detail: Detail): boolean {
  const safety = detail.run.safety_flags || {};
  return Boolean(safety.stop_normal_recommendation_flow || safety.requires_urgent_support || safety.medical_review_required);
}

function nutritionText(detail: Detail): string {
  const energy = energyProfile(detail);
  const goal = energy.goal_calorie_range_kcal || energy.goal_calorie_range || {};
  const protein = planDraft(detail).nutrition?.protein_target;
  if (hasSafetyPause(detail)) {
    return "Coach review is recommended before calorie, fasting or training targets are used. Begin with simple regular meals, hydration, sleep rhythm and gentle movement if safe.";
  }
  const calories = goal.low && goal.high ? `${goal.low}-${goal.high} kcal starting range` : "coach-reviewed calorie range";
  const proteinText = typeof protein === "object" && (protein.low_g || protein.high_g)
    ? `${protein.low_g || "-"}-${protein.high_g || "-"}g protein`
    : "a clear protein target";
  return `Use ${calories} only as an estimated coaching starting point, with ${proteinText}, whole foods, plants, fibre and consistent meal timing. Adjust through coach review, not daily emotion.`;
}

function trainingText(detail: Detail): string {
  const draft = planDraft(detail);
  const training = draft.training || {};
  const template = training.exercise_template || training.sessions_per_week || "";
  if (hasSafetyPause(detail)) return "Keep training conservative until coach or qualified review is complete. Prioritize safe walking, mobility and recovery when appropriate.";
  if (template) return cleanText(template, 420);
  return "Start with two simple full-body strength sessions per week plus low-friction walking. Progress only when sleep, stress and recovery support it.";
}

function sleepText(detail: Detail): string {
  const intake = intakeAnswers(detail);
  const blueScreens = cleanText(intake.SL7 || intake.blue_screens_before_bed || "", 80);
  const base = "Build toward a steady sleep opportunity, a calmer final hour and a consistent wake time. Adults commonly need a 7-9 hour sleep opportunity.";
  return blueScreens ? `${base} Blue-screen pattern: ${blueScreens}.` : base;
}

function spiritText(detail: Detail): string {
  const gap = primaryGap(detail);
  if (gap?.pillar === "SPIRIT") return "Keep the first step simple: Scripture before noise, honest prayer before performance, and one act of obedience today.";
  return "Connect every health action to stewardship. Your body is not a project for vanity; it is a temple for kingdom purpose.";
}

function includesAny(value: unknown, words: string[]): boolean {
  const text = String(value ?? "").toLowerCase();
  return words.some((word) => text.includes(word.toLowerCase()));
}

function intakeText(detail: Detail): string {
  return Object.values(intakeAnswers(detail)).map((value) => valueText(value)).join(" | ").toLowerCase();
}

function calorieRange(detail: Detail): { low: number | null; high: number | null; label: string } {
  const energy = energyProfile(detail);
  const goal = energy.goal_calorie_range_kcal || energy.goal_calorie_range || {};
  const low = Number(goal.low);
  const high = Number(goal.high);
  if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0) {
    return { low: Math.round(low), high: Math.round(high), label: `${Math.round(low)}-${Math.round(high)} kcal coach-reviewed range` };
  }
  return { low: null, high: null, label: "coach-reviewed calorie range" };
}

function proteinTarget(detail: Detail): { low: number | null; high: number | null; label: string } {
  const protein = planDraft(detail).nutrition?.protein_target || energyProfile(detail).protein_target || {};
  const low = Number(protein.low_g);
  const high = Number(protein.high_g);
  if (protein.blocked || includesAny(intakeText(detail), ["kidney", "renal"])) {
    return { low: null, high: null, label: "protein target needs qualified review" };
  }
  if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0) {
    return { low: Math.round(low), high: Math.round(high), label: `${Math.round(low)}-${Math.round(high)}g protein/day coach-reviewed target` };
  }
  const defaultProtein = Number(protein.default_g);
  if (Number.isFinite(defaultProtein) && defaultProtein > 0) {
    return { low: defaultProtein, high: defaultProtein, label: `${Math.round(defaultProtein)}g protein/day coach-reviewed target` };
  }
  return { low: null, high: null, label: "clear protein target after coach review" };
}

function dietStyle(detail: Detail): "vegan" | "vegetarian" | "fish" | "mixed" {
  const text = intakeText(detail);
  if (includesAny(text, ["vegan", "plant-based only", "plant based only"])) return "vegan";
  if (includesAny(text, ["vegetarian", "no meat"])) return "vegetarian";
  if (includesAny(text, ["pesc", "fish", "no red meat"])) return "fish";
  return "mixed";
}

function nutritionGapText(detail: Detail): string {
  const text = intakeText(detail);
  const signals: string[] = [];
  if (includesAny(text, ["fast food", "takeaway", "ready meals", "processed", "snacks", "sweets", "desserts", "soda", "sugary"])) {
    signals.push("replace convenience food with real-food plates");
  }
  if (includesAny(text, ["low", "little fruit", "little vegetable", "not much fruit", "not much vegetables"])) {
    signals.push("build toward 250-300g vegetables and 250-300g fruit in the main meal");
  }
  if (includesAny(text, ["stress", "craving", "emotional", "binge"])) {
    signals.push("make the meal high-protein and high-fibre so cravings have less power");
  }
  if (includesAny(text, ["busy", "no time", "travel", "shift"])) {
    signals.push("choose simple bowls and oven meals that can be prepared ahead");
  }
  return signals.length ? signals.slice(0, 3).join("; ") : "keep the meal simple: protein, plants, whole-food carbs, olive oil and water";
}

function mealPlanCaution(detail: Detail): string {
  const text = intakeText(detail);
  if (hasSafetyPause(detail) || includesAny(text, [
    "pregnant",
    "breastfeeding",
    "postpartum",
    "eating disorder",
    "binge",
    "purge",
    "underweight",
    "diabetes",
    "hypogly",
    "faint",
    "kidney",
    "renal",
    "medication requiring food",
  ])) {
    return "Because your answers include safety context, do not use one-meal-per-day fasting without coach or qualified review. Use this as a one-main-meal GodHealth plate template and add regular nourishment as needed.";
  }
  const fasting = pickIntake(intakeAnswers(detail), ["FA1", "fasting_interest", "time_restricted_eating"]);
  if (fasting && includesAny(fasting, ["no", "not interested", "never"])) {
    return "Your answers do not show interest in fasting. Use this as one main GodHealth meal per day, not a forced fasting prescription.";
  }
  return "This one-main-meal rhythm is educational coaching guidance. If this becomes your only meal, use coach review to make sure energy, protein and recovery stay appropriate.";
}

type Meal = {
  day: string;
  title: string;
  category: string;
  time: string;
  nutrition: string;
  ingredients: string[];
  steps: string[];
  scripture: string;
};

const CLEAN_MEAT_MEALS: Meal[] = [
  {
    day: "Day 1",
    title: "Grilled Chicken with Sweet Potato & Fresh Figs",
    category: "Clean Meat",
    time: "32 min",
    nutrition: "Base estimate: 760 kcal - Protein 48g - Fat 34g - Carbs 67g",
    ingredients: ["160g chicken breast", "250g sweet potato", "265g fresh figs", "2 tbsp extra virgin olive oil", "1 tsp fresh mint", "Celtic sea salt & black pepper"],
    steps: ["Season chicken with mint, salt, pepper and a little olive oil.", "Grill 12-15 minutes until cooked through.", "Cube and roast sweet potato at 200C for 20-25 minutes.", "Serve with quartered figs and remaining olive oil."],
    scripture: "Genesis 1:29 - whole plants and fruit as God-given nourishment.",
  },
  {
    day: "Day 5",
    title: "Oven-Roasted Turkey with Leek & Dates",
    category: "Clean Meat",
    time: "45 min",
    nutrition: "Base estimate: 770 kcal - Protein 48g - Fat 34g - Carbs 67g",
    ingredients: ["170g turkey breast", "260g leek", "280g dates", "2 tbsp extra virgin olive oil", "1 tsp dill", "Celtic sea salt & black pepper"],
    steps: ["Season turkey with dill, salt, pepper and olive oil.", "Roast at 200C for 30-35 minutes.", "Slice and saute leek for 5-7 minutes.", "Serve turkey with leek, chopped dates and remaining olive oil."],
    scripture: "Deuteronomy 14:20 - clean birds used with wisdom and moderation.",
  },
];

const FISH_MEALS: Meal[] = [
  {
    day: "Day 2",
    title: "Baked Cod with Sweet Potato & Fresh Figs",
    category: "Vegetarian + Fish",
    time: "32 min",
    nutrition: "Base estimate: 760 kcal - Protein 48g - Fat 34g - Carbs 67g",
    ingredients: ["270g cod fillet", "250g sweet potato", "265g fresh figs", "2 tbsp extra virgin olive oil", "1 tsp fresh mint", "Celtic sea salt & black pepper"],
    steps: ["Season cod with mint, salt, pepper and a little olive oil.", "Bake at 190C for 15-20 minutes until it flakes easily.", "Roast cubed sweet potato at 200C for 20-25 minutes.", "Serve with fresh figs and remaining olive oil."],
    scripture: "Leviticus 11:9 - fish with fins and scales.",
  },
  {
    day: "Day 6",
    title: "Grilled Herring with Leek & Dates",
    category: "Vegetarian + Fish",
    time: "22 min",
    nutrition: "Base estimate: 770 kcal - Protein 48g - Fat 34g - Carbs 67g",
    ingredients: ["270g herring fillet", "260g leek", "280g dates", "2 tbsp extra virgin olive oil", "1 tsp dill", "Celtic sea salt & black pepper"],
    steps: ["Season herring with dill, salt, pepper and olive oil.", "Grill 10-12 minutes, turning once.", "Saute leek 5-7 minutes.", "Serve with chopped dates and remaining olive oil."],
    scripture: "Leviticus 11:9 - simple fish, plants and oil.",
  },
];

const VEGETARIAN_MEALS: Meal[] = [
  {
    day: "Day 3",
    title: "Egg & Cottage Cheese Bowl with Leek & Dates",
    category: "Vegetarian",
    time: "14 min",
    nutrition: "Base estimate: 760 kcal - Protein 48g - Fat 34g - Carbs 67g",
    ingredients: ["2 eggs, scrambled or boiled", "250g cottage cheese", "20g walnuts", "10g pumpkin seeds", "275g leek", "295g dates", "1 tbsp extra virgin olive oil"],
    steps: ["Prepare eggs and mix with cottage cheese.", "Toast walnuts and seeds for 2-3 minutes if desired.", "Saute sliced leek for 5-7 minutes.", "Assemble with dates, olive oil and a pinch of salt."],
    scripture: "Proverbs 27:27 - dairy as provision and nourishment.",
  },
  {
    day: "Day 7",
    title: "Yogurt & Lentil Bowl with Cucumber & Melon",
    category: "Vegetarian",
    time: "8 min",
    nutrition: "Base estimate: 770 kcal - Protein 48g - Fat 34g - Carbs 67g",
    ingredients: ["250g Greek yogurt 0%", "150g cooked lentils", "20g pumpkin seeds", "290g cucumber", "300g melon", "1 tbsp extra virgin olive oil", "1 tsp mustard seed"],
    steps: ["Stir lentils into Greek yogurt.", "Toast pumpkin seeds if desired.", "Slice cucumber and cube melon.", "Assemble with olive oil, mustard seed and a little salt."],
    scripture: "Ezekiel 4:9 - legumes and seeds as slow, steady nourishment.",
  },
];

const VEGAN_MEALS: Meal[] = [
  {
    day: "Day 4",
    title: "Tofu & Tempeh Stir-Fry with Leek & Dates",
    category: "Vegan",
    time: "14 min",
    nutrition: "Base estimate: 760 kcal - Protein 48g - Fat 34g - Carbs 67g",
    ingredients: ["200g firm tofu, cubed", "100g tempeh, sliced", "275g leek", "295g dates", "1 tbsp extra virgin olive oil", "1 tsp saffron threads", "Celtic sea salt"],
    steps: ["Stir-fry tofu and tempeh for 5-6 minutes until golden.", "Saute leek for 5-7 minutes.", "Pit and chop dates.", "Assemble with olive oil, saffron and a little salt."],
    scripture: "Genesis 1:29 - seed-bearing plants as God-given food.",
  },
  {
    day: "Day 7",
    title: "Lentil & Nut Bowl with Cucumber & Melon",
    category: "Vegan",
    time: "13 min",
    nutrition: "Base estimate: 770 kcal - Protein 48g - Fat 34g - Carbs 67g",
    ingredients: ["300g cooked lentils", "30g pumpkin seeds", "20g almonds", "290g cucumber", "300g melon", "1 tbsp extra virgin olive oil", "1 tsp mustard seed"],
    steps: ["Warm lentils gently for 5 minutes.", "Toast pumpkin seeds and almonds if desired.", "Slice cucumber and cube melon.", "Assemble with olive oil, mustard seed and a little salt."],
    scripture: "Ezekiel 4:9 - lentils, seeds and grains as Biblical staples.",
  },
];

function personalizedAddOn(detail: Detail): string {
  const range = calorieRange(detail);
  const protein = proteinTarget(detail);
  const style = dietStyle(detail);
  const goal = pickIntake(intakeAnswers(detail), ["GL1", "primary_goal", "goal", "main_goal"]).toLowerCase();
  const recoveryAddOn = style === "vegan"
    ? "add 200g tofu or 300g cooked lentils, 30g almonds and 1 apple"
    : "add 250g Greek yogurt, 30g almonds and 1 apple";
  const higherEnergyAddOn = style === "vegan"
    ? "add 200g tofu or 300g cooked lentils, 30g almonds, 1 apple and 75-125g whole grains"
    : "add 250g Greek yogurt, 30g almonds, 1 apple and 2 slices whole-grain/Ezekiel bread";
  if (hasSafetyPause(detail)) return "Add regular meals or snacks as your coach/qualified professional recommends; do not restrict to one meal automatically.";
  if (range.low && range.low >= 1600) {
    return `If coach-approved intake needs more energy: ${higherEnergyAddOn}.`;
  }
  if (range.low && range.low >= 1200) {
    return `To avoid under-eating while keeping one clear main meal: ${recoveryAddOn}.`;
  }
  if (includesAny(goal, ["muscle", "strength", "performance"])) {
    return "Performance add-on: add 250g sweet potato or 75-125g whole grains around training, plus water/tea.";
  }
  if (includesAny(goal, ["fat", "weight", "belly"])) {
    return `Fat-loss structure: keep oils measured, eat slowly, and protect ${protein.label}; do not cut below your coach-reviewed range.`;
  }
  return "Stewardship add-on: if hunger, training or recovery needs more support, add Greek yogurt or an extra portion of legumes/whole grains after coach review.";
}

function createMealPlan(detail: Detail): Meal[] {
  const style = dietStyle(detail);
  if (style === "vegan") return [
    { ...VEGAN_MEALS[0], day: "Day 1" },
    { ...VEGAN_MEALS[1], day: "Day 2" },
    { ...VEGAN_MEALS[0], day: "Day 3", title: "Tofu & Tempeh Stir-Fry with Broccoli & Pomegranate" },
    { ...VEGAN_MEALS[1], day: "Day 4", title: "Lentil & Nut Bowl with Spinach, Onion & Grapes" },
    { ...VEGAN_MEALS[0], day: "Day 5", title: "Tofu & Tempeh Bowl with Sweet Potato & Figs" },
    { ...VEGAN_MEALS[1], day: "Day 6", title: "Lentil & Almond Bowl with Green Beans & Apple" },
    { ...VEGAN_MEALS[0], day: "Day 7", title: "Tempeh Stewardship Bowl with Leek & Melon" },
  ];
  if (style === "vegetarian") return [
    { ...VEGETARIAN_MEALS[0], day: "Day 1" },
    { ...VEGETARIAN_MEALS[1], day: "Day 2" },
    { ...VEGETARIAN_MEALS[0], day: "Day 3", title: "Egg & Cottage Cheese Bowl with Broccoli & Pomegranate" },
    { ...VEGETARIAN_MEALS[1], day: "Day 4", title: "Yogurt & Lentil Bowl with Spinach, Onion & Grapes" },
    { ...VEGETARIAN_MEALS[0], day: "Day 5", title: "Egg & Cottage Cheese Bowl with Sweet Potato & Figs" },
    { ...VEGETARIAN_MEALS[1], day: "Day 6", title: "Yogurt & Lentil Bowl with Green Beans & Apple" },
    { ...VEGETARIAN_MEALS[0], day: "Day 7", title: "Egg Stewardship Bowl with Leek & Melon" },
  ];
  if (style === "fish") return [
    { ...FISH_MEALS[0], day: "Day 1" },
    { ...VEGETARIAN_MEALS[0], day: "Day 2" },
    { ...FISH_MEALS[1], day: "Day 3" },
    { ...VEGETARIAN_MEALS[1], day: "Day 4" },
    { ...FISH_MEALS[0], day: "Day 5", title: "Baked Cod with Broccoli & Pomegranate" },
    { ...FISH_MEALS[1], day: "Day 6", title: "Grilled Herring with Green Beans & Apple" },
    { ...VEGETARIAN_MEALS[0], day: "Day 7", title: "Egg & Cottage Cheese Stewardship Bowl" },
  ];
  return [
    CLEAN_MEAT_MEALS[0],
    FISH_MEALS[0],
    VEGETARIAN_MEALS[0],
    VEGAN_MEALS[0],
    CLEAN_MEAT_MEALS[1],
    FISH_MEALS[1],
    VEGETARIAN_MEALS[1],
  ];
}

function phaseWeeks(detail: Detail): Record<string, string>[] {
  const priorities = big3(detail);
  const first = priorities[0]?.title || priorities[0]?.name || "your primary gap";
  const second = priorities[1]?.title || priorities[1]?.name || "your second priority";
  const third = priorities[2]?.title || priorities[2]?.name || "your third priority";
  return [
    { week: "1", phase: "PHASE 1 - FOUNDATION", title: "Full Basics & Identity", action: "Set your baseline, choose one morning anchor, simplify your first daily actions and connect the journey to stewardship identity." },
    { week: "2", phase: "PHASE 1 - FOUNDATION", title: "Sharpen Your Nutrition", action: nutritionText(detail) },
    { week: "3", phase: "PHASE 1 - FOUNDATION", title: "Extend Your Fasting", action: hasSafetyPause(detail) ? "Do not use fasting targets until coach review is complete. Focus on meal rhythm, hydration and stable nourishment." : "Only use fasting if it fits your context and coach review. Keep it gentle, structured and never driven by punishment." },
    { week: "4", phase: "PHASE 1 - FOUNDATION", title: "Order & Sleep + Check-in 1", action: `${sleepText(detail)} Review what helped and what created friction.` },
    { week: "5", phase: "PHASE 2 - TRANSFORMATION", title: "Increase Your Strength", action: trainingText(detail) },
    { week: "6", phase: "PHASE 2 - TRANSFORMATION", title: "Renewing Of The Mind", action: `Put focused attention on ${first}. Create a pause before reaction: breathe, name the emotion, pray honestly, then choose the next wise action.` },
    { week: "7", phase: "PHASE 2 - TRANSFORMATION", title: "Renew Your Vision", action: "Reset the reason behind the habits. Make the goal bigger than the mirror: energy, discipline, obedience and daily availability to God." },
    { week: "8", phase: "PHASE 2 - TRANSFORMATION", title: "The Arena: Design Your Environment + Check-in 2", action: `Make ${second} easier by changing the environment: prepare food, calendar training, protect evenings and ask for support.` },
    { week: "9", phase: "PHASE 3 - LEGACY", title: "Rest As A Strategy", action: "Treat recovery as part of obedience. Increase only what your sleep, stress and recovery can support." },
    { week: "10", phase: "PHASE 3 - LEGACY", title: "Temple Upgrade", action: spiritText(detail) },
    { week: "11", phase: "PHASE 3 - LEGACY", title: "Legacy & Sustainability", action: `Build a clear if-then plan for ${third}. When you miss, return at the next meal, walk, prayer or bedtime.` },
    { week: "12", phase: "PHASE 3 - LEGACY", title: "Integration, Testimony & Review", action: "Review what changed, what still needs coaching, and which three habits must remain non-negotiable for the next cycle." },
  ];
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; maxWidth?: number; lineHeight?: number; maxLines?: number },
): number {
  const lines = options.maxWidth ? wrap(text, options.font, options.size, options.maxWidth) : [ascii(text)];
  const visible = options.maxLines ? lines.slice(0, options.maxLines) : lines;
  const lineHeight = options.lineHeight ?? options.size * 1.34;
  visible.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - (index * lineHeight),
      font: options.font,
      size: options.size,
      color: options.color ?? C.cream,
    });
  });
  return y - (visible.length * lineHeight);
}

function basePage(pdf: PDFDocument, fonts: Fonts, pageNumber: number): PDFPage {
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: C.forest });
  page.drawRectangle({ x: 18, y: 18, width: PAGE.width - 36, height: PAGE.height - 36, borderColor: C.gold, borderWidth: 0.55, opacity: 0.6 });
  page.drawText("GODHEALTH - KINGDOM CAPACITY ASSESSMENT", { x: 42, y: 27, font: fonts.sans, size: 7, color: C.muted });
  page.drawText(String(pageNumber), { x: PAGE.width - 50, y: 27, font: fonts.sans, size: 7, color: C.muted });
  return page;
}

function title(page: PDFPage, fonts: Fonts, eyebrow: string, text: string, y = 775): number {
  page.drawText(ascii(eyebrow).toUpperCase(), { x: 48, y, font: fonts.sansBold, size: 8, color: C.gold });
  return drawText(page, text, 48, y - 30, { font: fonts.serifBold, size: 27, color: C.gold2, maxWidth: PAGE.width - 96, lineHeight: 30 }) - 10;
}

function card(page: PDFPage, x: number, y: number, width: number, height: number, primary = false): void {
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color: primary ? C.panel2 : C.panel,
    borderColor: primary ? C.gold2 : C.gold,
    borderWidth: primary ? 1.1 : 0.55,
    opacity: 0.98,
  });
}

function metricCard(page: PDFPage, fonts: Fonts, x: number, y: number, label: string, value: string): void {
  card(page, x, y, 116, 78);
  page.drawText(ascii(label).toUpperCase(), { x: x + 13, y: y - 21, font: fonts.sansBold, size: 7.2, color: C.gold });
  page.drawText(ascii(value), { x: x + 13, y: y - 55, font: fonts.serifBold, size: 24, color: C.cream });
}

function insightCard(page: PDFPage, fonts: Fonts, y: number, heading: string, body: string): number {
  card(page, 48, y, PAGE.width - 96, 96);
  page.drawText(ascii(heading).toUpperCase(), { x: 66, y: y - 23, font: fonts.sansBold, size: 8, color: C.gold2 });
  drawText(page, body, 66, y - 43, { font: fonts.sans, size: 9.2, color: C.cream, maxWidth: PAGE.width - 132, lineHeight: 12.4, maxLines: 4 });
  return y - 110;
}

function bar(page: PDFPage, fonts: Fonts, x: number, y: number, label: string, value: number, width = 220): void {
  page.drawText(ascii(label), { x, y, font: fonts.sansBold, size: 10, color: C.cream });
  page.drawText(`${value}`, { x: x + width - 20, y, font: fonts.sansBold, size: 10, color: C.gold2 });
  page.drawRectangle({ x, y: y - 15, width, height: 8, color: C.dark, opacity: 0.55 });
  page.drawRectangle({ x, y: y - 15, width: Math.max(4, width * Math.min(100, Math.max(0, value)) / 100), height: 8, color: C.gold2 });
}

function divider(page: PDFPage, x: number, y: number, width: number): void {
  page.drawRectangle({ x, y, width, height: 0.7, color: C.gold, opacity: 0.82 });
}

function scoreRing(page: PDFPage, fonts: Fonts, x: number, y: number, value: number, label: string): void {
  page.drawCircle({ x, y, size: 67, color: C.dark, opacity: 0.62 });
  page.drawCircle({ x, y, size: 67, borderColor: C.gold, borderWidth: 1.5 });
  page.drawCircle({ x, y, size: 55, borderColor: C.gold2, borderWidth: 0.8, opacity: 0.88 });
  page.drawCircle({ x, y, size: 42, color: C.panel, opacity: 0.9 });
  const score = `${Math.max(0, Math.min(100, value))}%`;
  page.drawText(score, {
    x: x - fonts.serifBold.widthOfTextAtSize(score, 31) / 2,
    y: y - 3,
    font: fonts.serifBold,
    size: 31,
    color: C.gold2,
  });
  const labelText = ascii(label).toUpperCase();
  page.drawText(labelText, {
    x: x - fonts.sansBold.widthOfTextAtSize(labelText, 7) / 2,
    y: y - 24,
    font: fonts.sansBold,
    size: 7,
    color: C.muted,
  });
}

function rowHeight(text: string, font: PDFFont, size: number, maxWidth: number, lineHeight: number, maxLines: number): number {
  return Math.min(wrap(text, font, size, maxWidth).length, maxLines) * lineHeight;
}

function detailCard(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  heading: string,
  body: string,
  options: { maxLines?: number; minHeight?: number; primary?: boolean } = {},
): number {
  const maxLines = options.maxLines ?? 5;
  const bodyHeight = rowHeight(body, fonts.sans, 8.7, PAGE.width - 132, 11.6, maxLines);
  const height = Math.max(options.minHeight ?? 68, 38 + bodyHeight);
  card(page, 48, y, PAGE.width - 96, height, options.primary);
  page.drawText(ascii(heading).toUpperCase(), { x: 66, y: y - 20, font: fonts.sansBold, size: 8, color: C.gold2 });
  drawText(page, body, 66, y - 39, { font: fonts.sans, size: 8.7, color: C.cream, maxWidth: PAGE.width - 132, lineHeight: 11.6, maxLines });
  return y - height - 13;
}

function renderKeyValuePages(
  pdf: PDFDocument,
  fonts: Fonts,
  rows: { label: string; value: string }[],
  eyebrow: string,
  heading: string,
  emptyText: string,
): void {
  let page = basePage(pdf, fonts, pdf.getPageCount() + 1);
  let y = title(page, fonts, eyebrow, heading);
  if (!rows.length) {
    drawText(page, emptyText, 48, y, { font: fonts.sans, size: 11, color: C.cream, maxWidth: 500 });
    return;
  }
  rows.forEach((row) => {
    const label = cleanText(row.label, 220);
    const value = cleanText(row.value, 950);
    const valueLines = Math.min(wrap(value, fonts.sans, 8.4, 470).length, 4);
    const height = Math.max(54, 31 + valueLines * 10.8);
    if (y - height < 62) {
      page = basePage(pdf, fonts, pdf.getPageCount() + 1);
      y = title(page, fonts, eyebrow, "Continued", 775);
    }
    card(page, 48, y, PAGE.width - 96, height);
    drawText(page, label, 64, y - 17, { font: fonts.sansBold, size: 8, color: C.gold2, maxWidth: 470, maxLines: 1 });
    drawText(page, value, 64, y - 34, { font: fonts.sans, size: 8.4, color: C.cream, maxWidth: 470, lineHeight: 10.8, maxLines: 4 });
    y -= height + 10;
  });
}

function renderResponsePages(
  pdf: PDFDocument,
  fonts: Fonts,
  detail: Detail,
  responses: Record<string, any>[],
  eyebrow: string,
  heading: string,
  emptyText: string,
): void {
  let page = basePage(pdf, fonts, pdf.getPageCount() + 1);
  let y = title(page, fonts, eyebrow, heading);
  if (!responses.length) {
    drawText(page, emptyText, 48, y, { font: fonts.sans, size: 11, color: C.cream, maxWidth: 500 });
    return;
  }
  responses.forEach((response, index) => {
    const question = questionText(detail, response);
    const answer = responseAnswerLabel(detail, response);
    const questionMeta = questionMap(detail).get(response.question_id) || {};
    const meta = questionMeta.domain_code ? domainLabel(detail, questionMeta.domain_code) : response.question_role;
    const height = Math.max(
      72,
      45 +
        rowHeight(question, fonts.sans, 8.1, 455, 10.7, 3) +
        rowHeight(answer, fonts.sansBold, 8.5, 455, 11, 2),
    );
    if (y - height < 62) {
      page = basePage(pdf, fonts, pdf.getPageCount() + 1);
      y = title(page, fonts, eyebrow, "Continued", 775);
    }
    card(page, 48, y, PAGE.width - 96, height);
    page.drawText(`${index + 1}. ${ascii(response.question_id)} - ${ascii(meta)}`, { x: 62, y: y - 17, font: fonts.sansBold, size: 7.8, color: C.gold2 });
    const afterQuestion = drawText(page, question, 62, y - 33, { font: fonts.sans, size: 8.1, color: C.cream, maxWidth: 455, lineHeight: 10.7, maxLines: 3 });
    drawText(page, `Answer: ${answer}`, 62, afterQuestion - 5, { font: fonts.sansBold, size: 8.5, color: C.gold2, maxWidth: 455, lineHeight: 11, maxLines: 2 });
    y -= height + 10;
  });
}

function renderMealDayCard(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  meal: Meal,
  addOn: string,
  primary = false,
): number {
  const height = 180;
  card(page, 48, y, PAGE.width - 96, height, primary);
  page.drawText(ascii(meal.day).toUpperCase(), { x: 64, y: y - 20, font: fonts.sansBold, size: 8, color: C.gold2 });
  page.drawText(ascii(meal.category).toUpperCase(), { x: 455, y: y - 20, font: fonts.sansBold, size: 7.3, color: C.gold });
  drawText(page, meal.title, 64, y - 42, { font: fonts.serifBold, size: 16, color: C.cream, maxWidth: 455, lineHeight: 18, maxLines: 1 });
  divider(page, 64, y - 53, PAGE.width - 128);
  drawText(page, `${meal.time} - ${meal.nutrition}`, 64, y - 69, {
    font: fonts.sansBold,
    size: 8,
    color: C.gold2,
    maxWidth: 455,
    lineHeight: 10.5,
    maxLines: 1,
  });
  drawText(page, `Eat: ${meal.ingredients.join("; ")}`, 64, y - 88, {
    font: fonts.sans,
    size: 8.2,
    color: C.cream,
    maxWidth: 455,
    lineHeight: 10.8,
    maxLines: 3,
  });
  drawText(page, `Prepare: ${meal.steps.join(" ")}`, 64, y - 122, {
    font: fonts.sans,
    size: 7.9,
    color: C.muted,
    maxWidth: 455,
    lineHeight: 10.2,
    maxLines: 2,
  });
  drawText(page, `Personal note: ${addOn}`, 64, y - 145, {
    font: fonts.sansBold,
    size: 7.8,
    color: C.gold2,
    maxWidth: 455,
    lineHeight: 10.2,
    maxLines: 1,
  });
  drawText(page, `Biblical anchor: ${meal.scripture}`, 64, y - 163, {
    font: fonts.sans,
    size: 7.6,
    color: C.muted,
    maxWidth: 455,
    lineHeight: 10,
    maxLines: 1,
  });
  return y - height - 13;
}

function renderMealPlanPages(pdf: PDFDocument, fonts: Fonts, detail: Detail): void {
  const meals = createMealPlan(detail);
  const range = calorieRange(detail);
  const protein = proteinTarget(detail);
  const caution = mealPlanCaution(detail);
  const addOn = personalizedAddOn(detail);
  const style = dietStyle(detail);
  const gap = primaryGap(detail);

  let page = basePage(pdf, fonts, pdf.getPageCount() + 1);
  let y = title(page, fonts, "Personal Biblical meal plan", "Your 7-day GodHealth food rhythm");
  drawText(page, "Built from the GodHealth Nutrition Guidelines: Biblical whole foods, modern nutrition principles, simple preparation, and one clear main meal per day.", 48, y, {
    font: fonts.sans,
    size: 10,
    color: C.cream,
    maxWidth: 500,
    lineHeight: 13.5,
  });
  y -= 56;

  card(page, 48, y, PAGE.width - 96, 124, true);
  page.drawText("PERSONALIZED TARGETS", { x: 66, y: y - 22, font: fonts.sansBold, size: 8, color: C.gold2 });
  drawText(page, `Food style detected from your answers: ${style}. Primary capacity signal: ${gap?.domain_name || gap?.domain_code || "coach review"}. Nutrition focus: ${nutritionGapText(detail)}.`, 66, y - 43, {
    font: fonts.sans,
    size: 9,
    color: C.cream,
    maxWidth: PAGE.width - 132,
    lineHeight: 12,
    maxLines: 3,
  });
  drawText(page, `Calories: ${range.label}. Protein: ${protein.label}. Fruit/veg: each meal is built around 250-300g vegetables plus 250-300g fruit where possible.`, 66, y - 82, {
    font: fonts.sansBold,
    size: 8.4,
    color: C.gold2,
    maxWidth: PAGE.width - 132,
    lineHeight: 11.4,
    maxLines: 3,
  });
  y -= 142;

  y = detailCard(page, fonts, y, "Important safety note", caution, { primary: hasSafetyPause(detail), maxLines: 4, minHeight: 72 });
  y = detailCard(page, fonts, y, "GodHealth plate rule", "Every meal follows the same structure from the nutrition guidelines: a clear protein source, 250-300g plants, a whole-food carb, extra virgin olive oil, Biblical herbs/spices, water or tea, and no highly processed foods.", { maxLines: 4, minHeight: 72 });
  y = detailCard(page, fonts, y, "Foods to avoid this week", "Avoid pork/unclean meats, shellfish, heavy alcohol, smoking/drugs, industrial trans fats, sugary drinks, candy, packaged snacks and highly processed convenience food. Keep the week simple and clean.", { maxLines: 4, minHeight: 72 });

  page = basePage(pdf, fonts, pdf.getPageCount() + 1);
  y = title(page, fonts, "7-day meal plan", "Exactly what to eat");
  meals.forEach((meal, index) => {
    if (y < 230) {
      page = basePage(pdf, fonts, pdf.getPageCount() + 1);
      y = title(page, fonts, "7-day meal plan", "Continued", 775);
    }
    y = renderMealDayCard(page, fonts, y, meal, addOn, index === 0);
  });

  page = basePage(pdf, fonts, pdf.getPageCount() + 1);
  y = title(page, fonts, "Shopping and prep", "Make the week easy to obey");
  y = detailCard(page, fonts, y, "Simple shopping list", "Protein: chicken or turkey, cod or herring, eggs, cottage cheese or Greek yogurt, lentils, tofu and tempeh. Plants: sweet potato, leek, cucumber, melon, figs, dates, broccoli, green beans, spinach, onion and pomegranate. Fats: extra virgin olive oil, walnuts, almonds, pumpkin seeds. Seasoning: mint, dill, coriander, mustard seed, saffron, Celtic sea salt and black pepper.", { primary: true, maxLines: 7, minHeight: 112 });
  y = detailCard(page, fonts, y, "One preparation block", "Once or twice this week, cook lentils, roast sweet potatoes, wash fruit, slice vegetables and portion protein. A prepared environment lowers friction when stress or tiredness rises.", { maxLines: 4, minHeight: 72 });
  y = detailCard(page, fonts, y, "Bad-day fallback", "If the full meal feels too hard: choose one protein, one fruit, one vegetable and water. Do not quit the day. Return to stewardship at the next decision.", { maxLines: 4, minHeight: 72 });
  detailCard(page, fonts, y, "Biblical anchor", "Whether therefore ye eat, or drink, or whatsoever ye do, do all to the glory of God. - 1 Corinthians 10:31 KJV", { primary: true, maxLines: 3, minHeight: 68 });
}

async function buildPdf(detail: Detail): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const gap = primaryGap(detail);
  const priorities = big3(detail);
  const intake = answerRows(detail);
  const safetyResponses = sortedResponses(detail, "safety_gate");
  const coreResponses = sortedResponses(detail, "core");
  const safePaused = hasSafetyPause(detail);
  const clientName = detail.client.name || "GodHealth Client";

  let page = basePage(pdf, fonts, 1);
  page.drawRectangle({ x: 0, y: 545, width: PAGE.width, height: 296, color: C.forest2 });
  page.drawText("GODHEALTH", { x: 48, y: 770, font: fonts.serifBold, size: 22, color: C.gold2 });
  drawText(page, "Personal 12-Week Transformation Plan", 48, 700, { font: fonts.serifBold, size: 38, color: C.gold2, maxWidth: 470, lineHeight: 41 });
  drawText(page, `Prepared for ${clientName}`, 48, 594, { font: fonts.sansBold, size: 13, color: C.cream, maxWidth: 450 });
  drawText(page, "Built from your Kingdom Capacity Assessment answers: intake, safety gates, Body, Soul and Spirit scores, and your lowest capacity signals.", 48, 565, { font: fonts.sans, size: 10, color: C.cream, maxWidth: 460, lineHeight: 14 });
  scoreRing(page, fonts, 120, 448, kci(detail), "Overall KCI");
  metricCard(page, fonts, 224, 476, "Body", String(scoreOfPillar(detail, "BODY")));
  metricCard(page, fonts, 354, 476, "Soul", String(scoreOfPillar(detail, "SOUL")));
  metricCard(page, fonts, 224, 382, "Spirit", String(scoreOfPillar(detail, "SPIRIT")));
  metricCard(page, fonts, 354, 382, "Primary Gap", gap?.domain_code || "Review");
  drawText(page, safePaused
    ? "Safety note: your assessment includes answers that require careful review before normal recommendations. Use this document as preparation for a GodHealth conversation."
    : "This is educational coaching guidance, not medical care. Use it with wisdom, prayer and coach review.",
    48, 292, { font: fonts.sansBold, size: 11, color: safePaused ? C.gold2 : C.cream, maxWidth: 500, lineHeight: 15 });

  page = basePage(pdf, fonts, 2);
  let y = title(page, fonts, "Capacity snapshot", "Where your plan begins");
  const gapTitle = gap ? `${gap.domain_code} - ${gap.domain_name || gap.name || "Primary gap"}` : "Coach review";
  y = insightCard(page, fonts, y, "Primary alignment gap", `${gapTitle}. This is a coaching signal from your answers, not a diagnosis.`);
  bar(page, fonts, 64, y - 18, "Body", scoreOfPillar(detail, "BODY"), 200);
  bar(page, fonts, 64, y - 58, "Soul", scoreOfPillar(detail, "SOUL"), 200);
  bar(page, fonts, 64, y - 98, "Spirit", scoreOfPillar(detail, "SPIRIT"), 200);
  let py = y - 18;
  priorities.slice(0, 3).forEach((item, index) => {
    card(page, 305, py + 16, 230, 69);
    page.drawText(`#${index + 1}`, { x: 319, y: py - 3, font: fonts.sansBold, size: 8, color: C.gold2 });
    drawText(page, item.title || item.name || item.domain_code || "Priority", 349, py, { font: fonts.serifBold, size: 15, color: C.cream, maxWidth: 165, lineHeight: 16, maxLines: 1 });
    drawText(page, item.reason || item.action || "Generated from your assessment answers.", 319, py - 22, { font: fonts.sans, size: 7.8, color: C.muted, maxWidth: 195, lineHeight: 10.5, maxLines: 3 });
    py -= 82;
  });
  y -= 150;
  y = insightCard(page, fonts, y, "Nutrition", nutritionText(detail));
  y = insightCard(page, fonts, y, "Training", trainingText(detail));
  y = insightCard(page, fonts, y, "Sleep and recovery", sleepText(detail));
  insightCard(page, fonts, y, "Spirit rhythm", spiritText(detail));

  page = basePage(pdf, fonts, pdf.getPageCount() + 1);
  y = title(page, fonts, "Personal strategy", "Built from your actual answers");
  drawText(page, "These are the most important levers GodHealth should consider first. They are generated from your intake, safety answers, core scores and lowest capacity signals.", 48, y, {
    font: fonts.sans,
    size: 10,
    color: C.cream,
    maxWidth: 500,
    lineHeight: 13.5,
  });
  y -= 54;
  personalizedPlanLevers(detail).forEach((lever, index) => {
    if (y < 108) {
      page = basePage(pdf, fonts, pdf.getPageCount() + 1);
      y = title(page, fonts, "Personal strategy", "Continued", 775);
    }
    y = detailCard(page, fonts, y, `${index + 1}. ${lever.title}`, lever.body, { primary: index === 0, maxLines: 5, minHeight: 74 });
  });

  renderKeyValuePages(
    pdf,
    fonts,
    personalContextRows(detail),
    "Personal context",
    "High-signal answers used for personalization",
    "No high-signal personal context was found for this run.",
  );

  renderMealPlanPages(pdf, fonts, detail);

  renderKeyValuePages(
    pdf,
    fonts,
    intake,
    "Complete intake",
    "Every intake answer submitted",
    "No personal intake answers were found for this run.",
  );

  const weeks = phaseWeeks(detail);
  page = basePage(pdf, fonts, pdf.getPageCount() + 1);
  y = title(page, fonts, "12-week journey", "Reveal, Restore, Rebuild, Reinforce");
  weeks.forEach((week) => {
    if (y < 100) {
      page = basePage(pdf, fonts, pdf.getPageCount() + 1);
      y = title(page, fonts, "12-week journey", "Continued", 775);
    }
    card(page, 48, y, PAGE.width - 96, 84, week.week === "1");
    page.drawText(`WEEK ${week.week}`, { x: 64, y: y - 20, font: fonts.sansBold, size: 8, color: C.gold2 });
    page.drawText(ascii(week.phase), { x: 128, y: y - 20, font: fonts.sansBold, size: 8, color: C.gold });
    drawText(page, week.title, 64, y - 42, { font: fonts.serifBold, size: 15, color: C.cream, maxWidth: 455, maxLines: 1 });
    drawText(page, week.action, 64, y - 61, { font: fonts.sans, size: 8.5, color: C.muted, maxWidth: 460, lineHeight: 11.2, maxLines: 2 });
    y -= 96;
  });

  renderResponsePages(
    pdf,
    fonts,
    detail,
    safetyResponses,
    "Safety answers",
    "Safety routing used before normal recommendations",
    "No safety answers were found for this run.",
  );

  renderResponsePages(
    pdf,
    fonts,
    detail,
    coreResponses,
    "24 core question scores",
    "Every score used for Body, Soul and Spirit",
    "No core question scores were found for this run.",
  );

  page = basePage(pdf, fonts, pdf.getPageCount() + 1);
  y = title(page, fonts, "Next step", "Bring the plan into real life");
  y = insightCard(page, fonts, y, "First 7 days", "Choose one Body action, one Soul action and one Spirit action from week 1. Keep it small enough that you can repeat it even when motivation is low.");
  y = insightCard(page, fonts, y, "Coach review", "Use this PDF to prepare for your GodHealth Strategy Call or coaching conversation. Your coach can refine targets, safety notes and the Big 3.");
  y = insightCard(page, fonts, y, "Biblical foundation", '"What? know ye not that your body is the temple of the Holy Ghost which is in you, which ye have of God, and ye are not your own?" - 1 Corinthians 6:19 KJV');
  y = drawText(page, "Evidence-informed note: nutrition, calorie and training guidance is estimated from your submitted answers and general evidence-based coaching principles. It is not a diagnosis, treatment plan or substitute for qualified medical care.", 48, y - 8, { font: fonts.sans, size: 8.8, color: C.muted, maxWidth: 500, lineHeight: 12 });
  divider(page, 48, y - 9, PAGE.width - 96);
  drawText(page, "Evidence foundations used: Mifflin-St Jeor calorie estimation when eligible; WHO movement and nutrition baselines; adult 7-9 hour sleep opportunity; progressive resistance training principles; safety gates override normal automated recommendations.", 48, y - 27, {
    font: fonts.sans,
    size: 8.4,
    color: C.muted,
    maxWidth: 500,
    lineHeight: 11.5,
  });

  pdf.setTitle("GodHealth Personal 12-Week Transformation Plan");
  pdf.setAuthor("GodHealth");
  pdf.setSubject("Kingdom Capacity Assessment personalized educational plan");
  const bytes = await pdf.save();
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_PDF_BYTES) throw new Error("INVALID_PDF_SIZE");
  return bytes;
}

async function loadDetail(supabase: any, userId: string, runId: string | null): Promise<Detail> {
  let runQuery = supabase.from("kca_assessment_runs").select("*");
  if (runId) {
    runQuery = runQuery.eq("id", runId).single();
  } else {
    runQuery = runQuery.eq("user_id", userId).eq("definition_version", "3.0.0").order("submitted_at", { ascending: false, nullsFirst: false }).limit(1).single();
  }
  const { data: run, error: runError } = await runQuery;
  if (runError || !run) throw runError || new Error("RUN_NOT_FOUND");

  if (run.user_id !== userId) {
    const { data: coach } = await supabase.from("kca_coaches").select("user_id,role").eq("user_id", userId).maybeSingle();
    if (!coach) throw new Error("NOT_AUTHORIZED");
  }

  const [{ data: intake }, { data: engineRun }, { data: energy }, { data: responses }, { data: definition }, { data: userData }] = await Promise.all([
    supabase.from("kca_personal_intakes").select("*").eq("run_id", run.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("kca_plan_engine_runs").select("*").eq("run_id", run.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("kca_energy_profiles").select("*").eq("run_id", run.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("kca_responses").select("*").eq("run_id", run.id).order("created_at", { ascending: true }),
    supabase.from("kca_assessment_definitions").select("definition").eq("definition_version", run.definition_version || "3.0.0").maybeSingle(),
    supabase.auth.admin.getUserById(run.user_id),
  ]);

  const user = userData?.user;
  const context = run.context || {};
  const intakeJson = intake?.intake || engineRun?.input_snapshot?.intake || context;
  const name = cleanText(intakeJson?.client_name || context.client_name || user?.user_metadata?.full_name || user?.email || "GodHealth Client", 120);
  return {
    run,
    intake,
    engine_run: engineRun,
    energy_profile: energy,
    responses: Array.isArray(responses) ? responses : [],
    definition: definition?.definition || null,
    client: { email: user?.email || "", name },
  };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  const requestId = crypto.randomUUID();
  try {
    validateOrigin(request);
    validatePublishableKey(request);
    const authHeader = request.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) throw new Error("NOT_AUTHENTICATED");

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_REQUEST_BYTES) return json(request, { error: "Request too large." }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return json(request, { error: "Request too large." }, 413);
    const payload = raw ? JSON.parse(raw) : {};
    const requestedRunId = cleanText(payload?.run_id || payload?.id || payload?.run?.id, 80);
    if (requestedRunId && !UUID_PATTERN.test(requestedRunId)) throw new Error("INVALID_RUN_ID");

    const supabaseUrl = env("SUPABASE_URL");
    const supabase = createClient(supabaseUrl, secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) throw new Error("NOT_AUTHENTICATED");

    const detail = await loadDetail(supabase, userData.user.id, requestedRunId || null);
    const pdf = await buildPdf(detail);
    const bucket = Deno.env.get("KCA_REPORT_BUCKET")?.trim() || "kca-reports";
    const reportPath = `${detail.run.user_id}/${detail.run.id}/godhealth-12-week-transformation-plan.pdf`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(reportPath, pdf, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const ttl = Math.max(900, Math.min(Number(Deno.env.get("KCA_REPORT_URL_TTL_SECONDS") || "604800"), 2_592_000));
    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(reportPath, ttl, { download: "godhealth-12-week-transformation-plan.pdf" });
    if (signedError || !signed?.signedUrl) throw signedError || new Error("SIGNED_URL_FAILED");

    await supabase.from("kca_assessment_runs").update({
      twelve_week_plan_pdf_url: signed.signedUrl,
      twelve_week_plan_pdf_path: reportPath,
      twelve_week_plan_pdf_generated_at: new Date().toISOString(),
    }).eq("id", detail.run.id);

    await supabase.from("kca_audit_events").insert({
      run_id: detail.run.id,
      user_id: userData.user.id,
      event_type: "kca_12_week_pdf_generated",
      metadata: { request_id: requestId, requester_id: userData.user.id, report_path: reportPath },
    });

    return json(request, { ok: true, run_id: detail.run.id, report_pdf_url: signed.signedUrl, report_pdf_path: reportPath }, 200);
  } catch (error) {
    const internal = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ request_id: requestId, error: internal }));
    if (internal === "ORIGIN_NOT_ALLOWED") return json(request, { error: "Origin not allowed." }, 403);
    if (internal === "INVALID_PUBLIC_KEY") return json(request, { error: "Invalid public key." }, 401);
    if (internal === "NOT_AUTHENTICATED") return json(request, { error: "Please sign in again before downloading your report." }, 401);
    if (internal === "NOT_AUTHORIZED") return json(request, { error: "You do not have access to this report." }, 403);
    if (internal === "INVALID_RUN_ID") return json(request, { error: "Invalid assessment report." }, 400);
    return json(request, { error: "The 12-week PDF could not be generated yet." }, 500);
  }
});
