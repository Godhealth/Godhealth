/*
 * GodHealth Kingdom Capacity Assessment v3 personalization helpers.
 *
 * This file intentionally does not contain the canonical V3 question
 * definition. Production clients must receive that definition through the
 * protected Supabase RPC after authentication + entitlement checks.
 */
(function(global){
  "use strict";

  const ENGINE_VERSION = "3.0.0";
  const SCALE_LABELS = [
    "Not true right now",
    "Rarely true",
    "Sometimes true",
    "Mostly true",
    "Consistently true"
  ];

  const PILLAR_ORDER = ["BODY", "SOUL", "SPIRIT"];
  const DOMAIN_PILLARS = {
    B1:"BODY", B2:"BODY", B3:"BODY", B4:"BODY",
    S1:"SOUL", S2:"SOUL", S3:"SOUL", S4:"SOUL",
    P1:"SPIRIT", P2:"SPIRIT", P3:"SPIRIT", P4:"SPIRIT"
  };

  function clampNumber(value, min, max){
    const number = Number(value);
    if(!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function round2(value){
    return Math.round(Number(value) * 100) / 100;
  }

  function display(value){
    return Math.round(Number(value));
  }

  function coreQuestions(definition){
    return (definition.capacity_core || [])
      .filter(question => question.question_role === "core" && question.include_in_core_score !== false)
      .slice()
      .sort((a,b) => Number(a.core_order || 0) - Number(b.core_order || 0));
  }

  function domains(definition){
    return (definition.domains || []).map(domain => ({
      ...domain,
      pillar: domain.pillar || DOMAIN_PILLARS[domain.code]
    }));
  }

  function countDefinition(definition){
    return {
      domains: (definition.domains || []).length,
      core: coreQuestions(definition).length,
      coach_clarifiers: (definition.coach_clarifiers || []).length,
      safety_gates: (definition.safety_gates || []).length,
      intake_fields: (definition.personal_transformation_intake || []).length,
      automatic_deep_dive: automaticDeepDiveQuestions(definition).length
    };
  }

  function assertDefinition(definition){
    if(!definition || definition.schema_version !== "3.0.0"){
      throw new Error("Expected GodHealth KCA V3 definition.");
    }
    const core = coreQuestions(definition);
    if(core.length !== 24) throw new Error("V3 must contain exactly 24 scored core items.");
    const perDomain = {};
    for(const question of core){
      perDomain[question.domain_code] = (perDomain[question.domain_code] || 0) + 1;
    }
    for(const domain of domains(definition)){
      if(perDomain[domain.code] !== 2){
        throw new Error(`V3 domain ${domain.code} must contain exactly 2 scored core items.`);
      }
    }
    if(automaticDeepDiveQuestions(definition).length !== 0){
      throw new Error("V3 must not expose automatic deep-dive questions to clients.");
    }
    return true;
  }

  function automaticDeepDiveQuestions(definition){
    const all = [
      ...(definition.questions || []),
      ...(definition.deep_dive_questions || []),
      ...(definition.adaptive_deep_dive || [])
    ];
    return all.filter(question => question.question_role === "deep_dive" && question.auto_client_visible !== false);
  }

  function scoreAssessment(definition, answers){
    assertDefinition(definition);
    const core = coreQuestions(definition);
    const domainScores = {};
    const grouped = {};
    for(const question of core){
      const raw = answers ? answers[question.id] : undefined;
      const numeric = Number(raw);
      if(!Number.isFinite(numeric) || numeric < 0 || numeric > 4){
        throw new Error(`Invalid or missing answer for ${question.id}`);
      }
      if(!grouped[question.domain_code]) grouped[question.domain_code] = [];
      grouped[question.domain_code].push(numeric);
    }
    for(const domain of domains(definition)){
      const values = grouped[domain.code] || [];
      if(values.length !== 2){
        throw new Error(`Domain ${domain.code} must have exactly 2 core answers.`);
      }
      const internal = round2((values.reduce((sum, value) => sum + value, 0) / 2) * 25);
      domainScores[domain.code] = {
        domain_code: domain.code,
        domain_name: domain.name,
        pillar: domain.pillar,
        internal,
        display: display(internal),
        status: "complete"
      };
    }
    const pillarScores = {};
    for(const pillar of PILLAR_ORDER){
      const items = Object.values(domainScores).filter(score => score.pillar === pillar);
      const internal = round2(items.reduce((sum, item) => sum + item.internal, 0) / items.length);
      pillarScores[pillar] = { pillar, internal, display: display(internal), status:"complete" };
    }
    const kciInternal = round2(PILLAR_ORDER.reduce((sum, pillar) => sum + pillarScores[pillar].internal, 0) / 3);
    return {
      engine_version: ENGINE_VERSION,
      assessment_version: definition.schema_version,
      disclaimer: definition.scoring && definition.scoring.disclaimer,
      domain_scores: domainScores,
      pillar_scores: pillarScores,
      kci: { internal: kciInternal, display: display(kciInternal), status:"complete" }
    };
  }

  function routeSafety(definition, safetyAnswers){
    const flags = [];
    const restrictions = new Set();
    let stopNormalRecommendationFlow = false;
    for(const gate of (definition.safety_gates || [])){
      const value = String((safetyAnswers || {})[gate.id] || "no").toLowerCase();
      if(value === "yes" || value === "true"){
        flags.push({
          gate_id: gate.id,
          action_code: gate.action_code,
          message: gate.if_yes,
          coach_review_required: true
        });
        restrictions.add("coach_review_required");
        restrictions.add("no_autonomous_calorie_prescription");
        restrictions.add("no_autonomous_fasting_prescription");
        restrictions.add("no_autonomous_training_prescription");
        if(gate.action_code === "eating_disorder_scope"){
          restrictions.add("no_fasting_recommendations");
          restrictions.add("no_caloric_restriction_recommendations");
          restrictions.add("no_weight_loss_recommendations");
          restrictions.add("specialist_or_qualified_care_workflow_required");
        }
        if(gate.action_code === "mental_health_urgent"){
          restrictions.add("urgent_support_routing_only");
          stopNormalRecommendationFlow = true;
        }
      }
    }
    return {
      has_flags: flags.length > 0,
      flags,
      restrictions: Array.from(restrictions),
      stop_normal_recommendation_flow: stopNormalRecommendationFlow
    };
  }

  function mifflinStJeor({ age, sex, height_cm, weight_kg }){
    const a = Number(age), h = Number(height_cm), w = Number(weight_kg);
    if(!Number.isFinite(a) || !Number.isFinite(h) || !Number.isFinite(w)) return null;
    if(String(sex).toLowerCase() === "male") return round2(10 * w + 6.25 * h - 5 * a + 5);
    if(String(sex).toLowerCase() === "female") return round2(10 * w + 6.25 * h - 5 * a - 161);
    return null;
  }

  function inferPal(intake){
    const occupation = String(valueOf(intake, "PR7") || "").toLowerCase();
    const steps = Number(valueOf(intake, "PR8") || 0);
    const strength = Number(valueOf(intake, "TR1") || 0);
    const cardio = Number(valueOf(intake, "TR2") || 0);
    let level = "sedentary";
    let pal = 1.4;
    if(occupation.includes("mix") || steps >= 5000 || strength >= 1 || cardio >= 60){ level = "light"; pal = 1.5; }
    if(occupation.includes("standing") || steps >= 8000 || strength >= 2 || cardio >= 150){ level = "moderate"; pal = 1.6; }
    if(occupation.includes("demanding") || steps >= 11000 || strength >= 4 || cardio >= 240){ level = "active"; pal = 1.75; }
    if(steps >= 15000 && (strength >= 5 || cardio >= 360)){ level = "very_active"; pal = 1.9; }
    return { level, value: pal, label: `${level.replace("_"," ")} (${pal})` };
  }

  function valueOf(intake, id){
    if(!intake) return undefined;
    if(Array.isArray(intake)){
      const row = intake.find(item => item && item.id === id);
      return row && row.value;
    }
    return intake[id];
  }

  function textContains(intake, terms){
    const haystack = JSON.stringify(intake || {}).toLowerCase();
    return terms.some(term => haystack.includes(term));
  }

  function bmi(intake){
    const height = Number(valueOf(intake, "PR3"));
    const weight = Number(valueOf(intake, "PR4"));
    if(!height || !weight) return null;
    return round2(weight / Math.pow(height / 100, 2));
  }

  function buildEnergyProfile(intake, safetyRoute){
    const age = Number(valueOf(intake, "PR1"));
    const sex = valueOf(intake, "PR2");
    const height = Number(valueOf(intake, "PR3"));
    const weight = Number(valueOf(intake, "PR4"));
    const goal = String(valueOf(intake, "GL1") || "").toLowerCase();
    const ree = mifflinStJeor({ age, sex, height_cm: height, weight_kg: weight });
    const pal = inferPal(intake);
    const midpoint = ree ? Math.round(ree * pal.value) : null;
    const currentBmi = bmi(intake);
    const hardBlocks = [];
    if(age && age < 18) hardBlocks.push("age_under_18");
    if(!ree) hardBlocks.push("unsupported_energy_equation_input");
    if(safetyRoute && safetyRoute.has_flags) hardBlocks.push("safety_review_required");
    if(currentBmi && currentBmi < 18.5) hardBlocks.push("bmi_under_18_5");
    if(textContains(intake, ["pregnant", "postpartum", "breastfeeding"])) hardBlocks.push("pregnancy_postpartum_or_breastfeeding_context");
    if(textContains(intake, ["unexplained weight loss", "unintentional weight loss"])) hardBlocks.push("unexplained_weight_loss");
    if(textContains(intake, ["diabetes", "glucose", "insulin", "kidney", "renal", "diuretic"])) hardBlocks.push("condition_or_medication_review_required");

    const tdeeRange = midpoint ? {
      low: Math.round(midpoint * 0.90),
      mid: midpoint,
      high: Math.round(midpoint * 1.10),
      label: "estimated range, not exact metabolism"
    } : null;

    let goalRange = null;
    if(midpoint && hardBlocks.length === 0){
      if(goal === "fat loss"){
        goalRange = { low: Math.round(midpoint * 0.80), high: Math.round(midpoint * 0.90), approval_required: true };
      }else if(goal === "strength/muscle gain"){
        goalRange = { low: Math.round(midpoint * 1.05), high: Math.round(midpoint * 1.10), approval_required: true };
      }else{
        goalRange = { low: Math.round(midpoint * 0.95), high: Math.round(midpoint * 1.05), approval_required: true };
      }
      if(goalRange.low < 1200 || goalRange.high < 1200){
        hardBlocks.push("target_under_1200_specialist_review_required");
        goalRange = null;
      }
    }

    return {
      estimated_REE_kcal: ree,
      proposed_activity_factor: pal,
      estimated_TDEE_range_kcal: tdeeRange,
      goal_calorie_range_kcal: goalRange,
      confidence: hardBlocks.length ? "coach/clinical review required" : "estimated — coach approval required",
      calibration_status: "requires 14 days, at least 8 morning weights, and adherence context before adjustment",
      hard_blocks: hardBlocks,
      bmi: currentBmi
    };
  }

  function buildNutrition(intake, energyProfile){
    const weight = Number(valueOf(intake, "PR4"));
    const proteinMeals = String(valueOf(intake, "NU5") || "");
    const fruitVeg = String(valueOf(intake, "NU3") || "");
    const fibre = String(valueOf(intake, "NU4") || "");
    const kidney = textContains(intake, ["kidney", "renal"]);
    const healthyProteinAllowed = weight > 0 && !kidney && !(energyProfile.hard_blocks || []).includes("condition_or_medication_review_required");
    const proteinTarget = healthyProteinAllowed
      ? { low_g: Math.round(weight * 1.4), high_g: Math.round(weight * 2.0), default_g: Math.round(weight * 1.6), note:"Evidence-supported range for healthy exercising adults; coach must approve." }
      : { blocked: true, note:"Relevant medical context requires coach/clinical review before a high-protein target." };
    const gaps = [];
    if(["<2 portions/day","2-3 portions/day","not sure"].includes(fruitVeg)) gaps.push("Build toward WHO guidance: at least 400 g fruit and vegetables per day.");
    if(["rarely","1-3 times/week","4-6 times/week"].includes(fibre)) gaps.push("Increase naturally fibre-rich foods; adult benchmark is at least 25 g fibre/day.");
    if(["0","1"].includes(proteinMeals)) gaps.push("Add a meaningful protein source to more main meals.");
    return {
      protein_target: proteinTarget,
      who_benchmarks: {
        fruit_veg: "Aim >=400 g/day (roughly 5 portions) for adults.",
        fibre: "Aim >=25 g/day naturally occurring dietary fibre.",
        free_sugars: "<10% of energy.",
        saturated_fat: "<10% of energy.",
        trans_fat: "<1% of energy; avoid industrial trans fat.",
        salt: "<5 g/day."
      },
      who_gap_priorities: gaps.slice(0,3),
      meal_structure: "Chosen around schedule, hunger, family context, preferences and sustainability.",
      personal_10_meals: [
        "Protein breakfast bowl", "Greek yogurt + fruit", "Eggs + vegetables", "Chicken rice bowl", "Tuna salad wrap",
        "Lean beef potato plate", "Salmon + vegetables", "Turkey chili", "High-protein smoothie", "Simple church/social meal fallback"
      ],
      prep_shopping_actions: ["Choose 2 proteins, 2 vegetables, 1 fruit, 1 fibre-rich carb for the next 3 days.", "Prepare one fallback meal before the busiest day."]
    };
  }

  function buildTraining(intake, safetyRoute){
    const currentStrength = Number(valueOf(intake, "TR1") || 0);
    const availableDays = clampNumber(valueOf(intake, "TR4") || 2, 1, 6);
    const time = String(valueOf(intake, "TR5") || "30 min");
    const experience = String(valueOf(intake, "TR3") || "none");
    const sleep = Number(valueOf(intake, "SL1") || 7);
    const recovery = Number(valueOf(intake, "SL6") || 5);
    const safetyBlocked = safetyRoute && safetyRoute.has_flags;
    const novice = currentStrength === 0 || ["none","<6 months"].includes(experience);
    const limitedRecovery = sleep < 6.5 || recovery < 5;
    const sessions = safetyBlocked ? 0 : novice || limitedRecovery ? Math.min(2, availableDays) : Math.min(3, availableDays);
    return {
      sessions_per_week: sessions,
      session_duration: time,
      exercise_template: safetyBlocked
        ? "No automated training prescription until coach/clinical review."
        : sessions <= 2
          ? "Two simple full-body sessions: squat/hinge, push, pull, carry/core; gradual effort."
          : "Three structured strength sessions with progressive overload, adjusted to recovery.",
      cardio_or_movement: "Build toward WHO activity guidance using walking, steps, or preferred cardio.",
      recovery_days: sessions ? Math.max(1, 7 - sessions) : null,
      injury_constraints: valueOf(intake, "TR9") || "Coach checks movement limits before finalizing.",
      respects_constraints: true
    };
  }

  function buildRecovery(intake){
    const sex = String(valueOf(intake, "PR2") || "").toLowerCase();
    const sleepHours = Number(valueOf(intake, "SL1") || 0);
    const apnea = String(valueOf(intake, "SL5") || "").toLowerCase();
    return {
      sleep_target: "Adults generally need a 7–9 hour sleep opportunity; personalize around schedule and responsibilities.",
      current_sleep_hours: sleepHours || null,
      apnea_like_symptoms_flag: apnea === "yes" || apnea === "not sure",
      apnea_message: (apnea === "yes" || apnea === "not sure") ? "Snoring, gasping or breathing pauses with daytime fatigue should be discussed with a qualified medical professional." : null,
      hydration_benchmark: sex === "female" ? "EFSA benchmark: about 2.0 L/day total water from food + beverages." : sex === "male" ? "EFSA benchmark: about 2.5 L/day total water from food + beverages." : "Use total water from food + beverages; personalize for body size, climate, sweat and health context.",
      sweat_rate_formula: "(pre_kg - post_kg + fluid_L - urine_L) / hours"
    };
  }

  function calculateSweatRate({ pre_kg, post_kg, fluid_L, urine_L, hours }){
    const value = (Number(pre_kg) - Number(post_kg) + Number(fluid_L || 0) - Number(urine_L || 0)) / Number(hours || 1);
    return round2(value);
  }

  function buildFasting(intake, safetyRoute, energyProfile){
    const interest = String(valueOf(intake, "FA1") || "no").toLowerCase();
    const blocked = interest === "no" || (safetyRoute && safetyRoute.has_flags) || (energyProfile.hard_blocks || []).some(code => ["bmi_under_18_5","pregnancy_postpartum_or_breastfeeding_context","condition_or_medication_review_required"].includes(code));
    return {
      interested: interest,
      recommended: !blocked && interest !== "no",
      note: blocked ? "No fasting recommendation is generated from this intake." : "If coach-approved, fasting remains optional and simple; no automated advanced or multi-day fasting."
    };
  }

  function lowestGaps(snapshot){
    return Object.values(snapshot.domain_scores || {}).sort((a,b) => a.internal - b.internal);
  }

  function generateBig3Candidates(definition, snapshot, intake, safetyRoute){
    const gaps = lowestGaps(snapshot);
    const priorities = [];
    const goal = valueOf(intake, "GL1") || "combined/other";
    const collapse = Array.isArray(valueOf(intake, "EN7")) ? valueOf(intake, "EN7").join(", ") : valueOf(intake, "EN7");
    const add = (title, domain, why, action, fallback) => {
      if(priorities.length >= 3) return;
      priorities.push({
        title,
        domain_code: domain && domain.domain_code,
        pillar: domain && domain.pillar,
        why,
        weekly_action: action,
        frequency_or_dose: title.includes("Sleep") ? "5 nights/week" : title.includes("Protein") || title.includes("Meal") ? "1–2 meals/day" : "3–5 times/week",
        measurement: title.includes("Sleep") ? "sleep opportunity + sleep quality" : title.includes("Protein") || title.includes("Meal") ? "meals completed" : "sessions/minutes completed",
        likely_barrier: collapse || "busy weeks and low motivation",
        environment_modification: "Make the next right action visible, prepared and easy before the day starts.",
        bad_week_fallback: fallback
      });
    };
    if(safetyRoute && safetyRoute.has_flags){
      add("Safety Review First", gaps[0], "Your answers indicate a context that needs coach/qualified-care review before normal plan progression.", "Do not change calories, fasting or training intensity until reviewed.", "Keep a simple rhythm: sleep, prayer, gentle walking if safe.");
    }
    for(const gap of gaps){
      if(priorities.length >= 3) break;
      if(gap.domain_code === "B2" || gap.domain_name.toLowerCase().includes("sleep")){
        add("Sleep Anchor", gap, "Sleep is a high-leverage foundation for energy, appetite, training and prayer rhythm.", "Set one protected bedtime/wake anchor and remove phone friction.", "Protect a 20-minute earlier wind-down.");
      }else if(gap.domain_code === "B1"){
        add("Meal Structure", gap, "Nutrition consistency supports energy, appetite control and body stewardship.", "Build one repeatable protein + plants meal before the hardest part of your day.", "Use the simplest go-to meal available.");
      }else if(gap.domain_code === "B3"){
        add("Strength Foundation", gap, "Movement and strength help rebuild physical capacity without forcing a perfection plan.", "Complete simple full-body strength work within your available time.", "Do one 10-minute walk and one set each of squat/push/pull.");
      }else if(gap.domain_code === "S2"){
        add("Stress Pause", gap, "Stress appears to be a likely pressure point for habits and follow-through.", "Use a 2-minute pause before reactive eating, scrolling or quitting.", "One breath prayer before the next choice.");
      }else if(gap.domain_code === "S3"){
        add("Comeback Protocol", gap, "Consistency grows when missed days have a planned return path.", "Create a written if-then plan for the moment you usually restart.", "Return at the next meal, walk or prayer moment.");
      }else if(gap.pillar === "SPIRIT"){
        add("Daily Surrender Rhythm", gap, "Your health has more strength when it is connected to stewardship and walking with Jesus.", "Attach Scripture/prayer to one existing daily habit.", "Read one verse and pray one honest sentence.");
      }else{
        add(`${gap.domain_name} Anchor`, gap, `This is one of your lowest actionable gaps for your ${goal} goal.`, "Practice one small weekly behavior that reduces friction in this area.", "Do the smallest visible version today.");
      }
    }
    while(priorities.length < 3){
      add("Foundational Stewardship Anchor", gaps[priorities.length] || gaps[0], "This gives you one simple next step without overcomplicating the week.", "Choose one Body, Soul or Spirit habit and repeat it for seven days.", "One small faithful action today.");
    }
    return {
      client_visible: false,
      coach_approval_required: true,
      candidate_count: priorities.length,
      priorities
    };
  }

  function generatePlanDraft(definition, snapshot, intake, safetyRoute){
    const energyProfile = buildEnergyProfile(intake, safetyRoute);
    const nutrition = buildNutrition(intake, energyProfile);
    const training = buildTraining(intake, safetyRoute);
    const recovery = buildRecovery(intake);
    const fasting = buildFasting(intake, safetyRoute, energyProfile);
    const big3 = generateBig3Candidates(definition, snapshot, intake, safetyRoute);
    const phases = (definition.personalization_engine && definition.personalization_engine.plan_phases) || [];
    const weeks = [];
    for(let week = 1; week <= 12; week++){
      const phase = phases.find(item => {
        const range = String(item.weeks || "");
        if(range === "0-1") return week === 1;
        const parts = range.split("-").map(Number);
        return parts.length === 2 && week >= parts[0] && week <= parts[1];
      }) || phases[phases.length - 1] || { phase:"REBUILD", purpose:"consistent stewardship" };
      weeks.push({
        week,
        phase: phase.phase,
        purpose: phase.purpose,
        focus: big3.priorities.map(item => item.title),
        bad_week_fallback: "Keep the smallest Body, Soul and Spirit version alive: one simple meal, one walk, one honest prayer."
      });
    }
    return {
      engine_version: "GodHealth Personal Plan Engine v1",
      coach_approval_status: "draft_requires_coach_approval",
      client_visible: false,
      summary: {
        primary_goal: valueOf(intake, "GL1"),
        secondary_goals: valueOf(intake, "GL2"),
        calling_why: valueOf(intake, "GL4"),
        constraints: valueOf(intake, "GL8"),
        safety_status: safetyRoute.has_flags ? "coach/clinical review required" : "ready for coach review",
        capacity_gaps: lowestGaps(snapshot).slice(0,3)
      },
      energy_profile: energyProfile,
      nutrition,
      training,
      recovery,
      optional_strategies: { fasting, sauna_cold:"Captured as context only; never prioritized over foundations." },
      big3: big3.priorities,
      weeks
    };
  }

  function clientResults(snapshot, approvedPlan){
    return {
      score_snapshot: snapshot,
      plan_locked: !approvedPlan,
      approved_plan: approvedPlan || null,
      message: approvedPlan
        ? "Your coach-approved GodHealth roadmap is ready."
        : "Your score snapshot is ready. Your personalized roadmap is being reviewed by your GodHealth coach before it becomes visible."
    };
  }

  function requires14DayCalibration(data){
    const weights = (data && data.morning_weights) || [];
    const adherence = (data && data.adherence_days) || [];
    return {
      eligible: weights.length >= 8 && adherence.length >= 8,
      rule: "Never adjust calories from one weigh-in. Use at least 14 days, >=8 morning weights and adherence context."
    };
  }

  const api = {
    ENGINE_VERSION,
    SCALE_LABELS,
    PILLAR_ORDER,
    coreQuestions,
    countDefinition,
    assertDefinition,
    automaticDeepDiveQuestions,
    scoreAssessment,
    routeSafety,
    mifflinStJeor,
    inferPal,
    buildEnergyProfile,
    buildNutrition,
    buildTraining,
    buildRecovery,
    buildFasting,
    calculateSweatRate,
    generateBig3Candidates,
    generatePlanDraft,
    clientResults,
    requires14DayCalibration
  };

  if(typeof module !== "undefined" && module.exports) module.exports = api;
  global.KCA_V3 = api;
})(typeof window !== "undefined" ? window : globalThis);
