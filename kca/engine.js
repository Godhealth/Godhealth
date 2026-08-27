/*
 * GodHealth Kingdom Capacity Assessment v2 engine.
 * Source of truth: kca/config-v2.json copied from the v2 handoff package.
 * This file intentionally contains no DOM, analytics or network side effects.
 */
(function(root, factory){
  if(typeof module === "object" && module.exports) module.exports = factory();
  else root.GodHealthKCAEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  const VERSION = "2.0.0";
  const MAX_CORE_VALUE = 4;
  const CORE_DOMAIN_MAX = 12;
  const FORBIDDEN_OUTPUT_TERMS = [
    "diagnosis",
    "diagnose",
    "root cause",
    "disease prediction",
    "treatment directive",
    "medication change",
    "salvation score",
    "spiritual worth",
    "god's approval"
  ];

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function assertDefinition(definition){
    if(!definition || !Array.isArray(definition.domains) || !Array.isArray(definition.questions)){
      throw new Error("Invalid KCA definition.");
    }
    const counts = countDefinition(definition);
    const expected = definition.assessment_definition || {};
    if(expected.definition_version !== VERSION) throw new Error("Unsupported KCA definition version.");
    if(counts.domains !== 12) throw new Error("KCA v2 requires 12 domains.");
    if(counts.core !== 36) throw new Error("KCA v2 requires 36 core questions.");
    if(counts.deep_dive !== 24) throw new Error("KCA v2 requires 24 deep-dive questions.");
    if(counts.coach_clarification !== 12) throw new Error("KCA v2 requires 12 coach clarification prompts.");
    if((definition.safety_gates || []).length !== 6) throw new Error("KCA v2 requires 6 safety gates.");
    return true;
  }

  function countDefinition(definition){
    const counts = { domains:(definition.domains || []).length, core:0, deep_dive:0, coach_clarification:0, safety_gates:(definition.safety_gates || []).length };
    for(const question of definition.questions || []){
      if(question.question_role === "core") counts.core += 1;
      if(question.question_role === "deep_dive") counts.deep_dive += 1;
      if(question.question_role === "coach_clarification") counts.coach_clarification += 1;
    }
    return counts;
  }

  function questionsByRole(definition, role){
    return (definition.questions || [])
      .filter(question => question.question_role === role)
      .sort((a,b) => {
        const domainCompare = String(a.domain_code).localeCompare(String(b.domain_code));
        if(domainCompare) return domainCompare;
        return Number(a.role_order || 0) - Number(b.role_order || 0);
      });
  }

  function coreQuestions(definition){
    return questionsByRole(definition, "core");
  }

  function deepDiveQuestions(definition){
    return questionsByRole(definition, "deep_dive");
  }

  function coachClarificationQuestions(definition){
    return questionsByRole(definition, "coach_clarification");
  }

  function clientBaselineQuestions(definition){
    return (definition.questions || [])
      .filter(question => question.auto_client_visible && !question.coach_only && question.question_role !== "coach_clarification")
      .sort((a,b) => {
        const pillarOrder = { BODY:1, SOUL:2, SPIRIT:3 };
        const domainCompare = (pillarOrder[a.pillar] || 9) - (pillarOrder[b.pillar] || 9) || String(a.domain_code).localeCompare(String(b.domain_code));
        if(domainCompare) return domainCompare;
        const roleOrder = (a.question_role === "core" ? 1 : 2) - (b.question_role === "core" ? 1 : 2);
        if(roleOrder) return roleOrder;
        return Number(a.role_order || 0) - Number(b.role_order || 0);
      });
  }

  function validateAnswerValue(value){
    return Number.isInteger(value) && value >= 0 && value <= MAX_CORE_VALUE;
  }

  function scoreDomain(definition, domainCode, answers, exemptions){
    const domain = (definition.domains || []).find(item => item.code === domainCode);
    if(!domain) throw new Error("Unknown domain: " + domainCode);
    const exempt = new Set((exemptions && exemptions[domainCode]) || []);
    const coreIds = domain.core_question_ids.filter(id => !exempt.has(id));
    if(coreIds.length < 2) return { domain_code:domainCode, status:"insufficient_data", internal:null, display:null, answered:0, max:coreIds.length * MAX_CORE_VALUE };
    let sum = 0;
    let answered = 0;
    for(const id of coreIds){
      const value = answers[id];
      if(!validateAnswerValue(value)) return { domain_code:domainCode, status:"incomplete", internal:null, display:null, answered, max:coreIds.length * MAX_CORE_VALUE };
      sum += value;
      answered += 1;
    }
    const max = coreIds.length * MAX_CORE_VALUE;
    const internal = (100 * sum) / max;
    return {
      domain_code:domainCode,
      pillar:domain.pillar,
      name:domain.name,
      status:"complete",
      internal:Number(internal.toFixed(4)),
      display:Math.round(internal),
      answered,
      max
    };
  }

  function scoreAssessment(definition, answers, exemptions){
    assertDefinition(definition);
    const domainScores = {};
    for(const domain of definition.domains){
      domainScores[domain.code] = scoreDomain(definition, domain.code, answers || {}, exemptions || {});
    }
    const pillarScores = {};
    for(const pillar of ["BODY","SOUL","SPIRIT"]){
      const items = definition.domains.filter(domain => domain.pillar === pillar).map(domain => domainScores[domain.code]);
      if(items.some(item => item.status !== "complete")){
        pillarScores[pillar] = { status:"incomplete", internal:null, display:null };
      } else {
        const internal = items.reduce((sum,item) => sum + item.internal, 0) / items.length;
        pillarScores[pillar] = { status:"complete", internal:Number(internal.toFixed(4)), display:Math.round(internal) };
      }
    }
    const complete = Object.values(pillarScores).every(item => item.status === "complete");
    const kciInternal = complete ? Object.values(pillarScores).reduce((sum,item) => sum + item.internal, 0) / 3 : null;
    return {
      assessment_version: definition.assessment_definition.definition_version,
      complete,
      domain_scores: domainScores,
      pillar_scores: pillarScores,
      kci: complete ? { status:"complete", internal:Number(kciInternal.toFixed(4)), display:Math.round(kciInternal) } : { status:"incomplete", internal:null, display:null }
    };
  }

  function getBand(definition, score){
    const bands = definition.interpretation_bands || [];
    return bands.find(band => score >= band.min && score <= band.max) || null;
  }

  function domainCoreValues(definition, domainCode, answers){
    const domain = definition.domains.find(item => item.code === domainCode);
    return domain.core_question_ids.map(id => answers[id]);
  }

  function goalRelevanceScore(definition, domainCode, context){
    const primaryGoal = context && context.primary_goal;
    if(!primaryGoal || !definition.goal_mappings || !definition.goal_mappings[primaryGoal]) return 0;
    const mapping = definition.goal_mappings[primaryGoal];
    if((mapping.primary || []).includes(domainCode)) return 2;
    if((mapping.secondary || []).includes(domainCode)) return 1;
    return 0;
  }

  function assignAdaptiveDeepDive(definition, answers, context){
    const snapshot = scoreAssessment(definition, answers || {});
    if(!snapshot.complete) throw new Error("All 36 core answers are required before adaptive assignment.");
    const cap = Number(definition.adaptive_deep_dive && definition.adaptive_deep_dive.max_auto_deep_dive_questions) || 12;
    const triggered = [];
    for(const domain of definition.domains){
      const score = snapshot.domain_scores[domain.code].internal;
      const values = domainCoreValues(definition, domain.code, answers || {});
      if(score <= 59) triggered.push({ domain, rule:"AD1", slots:2, score, relevance:goalRelevanceScore(definition, domain.code, context || {}) });
      else if(score >= 60 && score <= 74 && values.some(value => value <= 1)) triggered.push({ domain, rule:"AD2", slots:1, score, relevance:goalRelevanceScore(definition, domain.code, context || {}) });
    }
    triggered.sort((a,b) => a.score - b.score || b.relevance - a.relevance || a.domain.code.localeCompare(b.domain.code));
    const assigned = [];
    const reasons = {};
    for(const item of triggered){
      if(assigned.length >= cap) break;
      const id = item.domain.deep_dive_question_ids[0];
      if(id){
        assigned.push(id);
        reasons[id] = { domain_code:item.domain.code, rule:item.rule, pass:1, reason:"First adaptive deep-dive for triggered domain." };
      }
    }
    for(const item of triggered.filter(item => item.rule === "AD1")){
      if(assigned.length >= cap) break;
      const id = item.domain.deep_dive_question_ids[1];
      if(id){
        assigned.push(id);
        reasons[id] = { domain_code:item.domain.code, rule:item.rule, pass:2, reason:"Second adaptive deep-dive for priority-support domain." };
      }
    }
    return {
      assignment_version: VERSION,
      frozen: true,
      assigned_question_ids: assigned.slice(0, cap),
      reasons,
      triggered_domains: triggered.map(item => ({ domain_code:item.domain.code, rule:item.rule, core_domain_score:item.score }))
    };
  }

  function validateSubmission(definition, coreAnswers, assignedDeepDiveIds, deepDiveAnswers){
    const missingCore = coreQuestions(definition).filter(question => !validateAnswerValue(coreAnswers && coreAnswers[question.id])).map(question => question.id);
    const missingDeepDive = (assignedDeepDiveIds || []).filter(id => !validateAnswerValue(deepDiveAnswers && deepDiveAnswers[id]));
    return { valid: missingCore.length === 0 && missingDeepDive.length === 0, missing_core:missingCore, missing_deep_dive:missingDeepDive };
  }

  function routeSafety(definition, safetyAnswers){
    const flags = [];
    const restrictions = [];
    let stopNormalRecommendationFlow = false;
    for(const gate of definition.safety_gates || []){
      if(String((safetyAnswers || {})[gate.id]).toLowerCase() === "yes" || (safetyAnswers || {})[gate.id] === true){
        flags.push({ gate_id:gate.id, action_code:gate.action_code, message:gate.if_yes });
        if(gate.id === "G4"){
          restrictions.push("no_fasting_recommendations", "no_caloric_restriction_recommendations", "no_weight_loss_recommendations", "specialist_or_qualified_care_workflow_required");
        }
        if(gate.id === "G5"){
          stopNormalRecommendationFlow = true;
          restrictions.push("urgent_support_routing_only", "normal_recommendation_flow_stopped");
        }
        if(gate.id === "G6") restrictions.push("no_medication_change_advice");
      }
    }
    return {
      has_flags: flags.length > 0,
      flags,
      restrictions: Array.from(new Set(restrictions)),
      stop_normal_recommendation_flow: stopNormalRecommendationFlow
    };
  }

  function leverageForDomain(definition, domainCode, domainScores){
    let best = { points:0, reason_code:null, reason:null };
    for(const rule of definition.leverage_rules || []){
      if(rule.candidate !== domainCode) continue;
      let matches = false;
      if(rule.trigger_any_below_60){
        matches = rule.trigger_any_below_60.some(code => domainScores[code] && domainScores[code].internal < 60);
      }
      if(rule.trigger_count_other_below_60){
        const count = Object.keys(domainScores).filter(code => code !== domainCode && domainScores[code] && domainScores[code].internal < 60).length;
        matches = count >= rule.trigger_count_other_below_60;
      }
      if(matches && Number(rule.points || 0) > best.points) best = { points:Number(rule.points || 0), reason_code:rule.id, reason:rule.reason };
    }
    return best;
  }

  function candidateGoalRelevance(definition, domainCode, context){
    let points = 0;
    const reasonCodes = [];
    const primary = context && context.primary_goal;
    const supporting = (context && context.supporting_goals) || [];
    if(primary && definition.goal_mappings && definition.goal_mappings[primary]){
      const map = definition.goal_mappings[primary];
      if((map.primary || []).includes(domainCode) || (map.secondary || []).includes(domainCode)){
        points = Math.max(points, 20);
        reasonCodes.push("primary_goal_relevance");
      }
    }
    for(const goal of supporting){
      const map = definition.goal_mappings && definition.goal_mappings[goal];
      if(map && ((map.primary || []).includes(domainCode) || (map.secondary || []).includes(domainCode))){
        points = Math.max(points, 10);
        reasonCodes.push("supporting_goal_relevance");
      }
    }
    return { points:Math.min(points,20), reason_codes:Array.from(new Set(reasonCodes)) };
  }

  function readinessForDomain(domainCode, context){
    const domainReadiness = context && context.domain_readiness && context.domain_readiness[domainCode];
    if(Number.isFinite(domainReadiness)) return { points:Math.max(0, Math.min(10, Number(domainReadiness))), reason_code:"domain_readiness" };
    const general = context && context.general_readiness;
    if(Number.isFinite(general)) return { points:Math.max(0, Math.min(10, Number(general))), reason_code:"general_readiness" };
    return { points:5, reason_code:"readiness_defaulted" };
  }

  function generateBig3Candidates(definition, scoreSnapshot, context, safetyRoute){
    if(!scoreSnapshot.complete) throw new Error("A complete core score snapshot is required before Big 3 candidate generation.");
    if(safetyRoute && safetyRoute.stop_normal_recommendation_flow){
      return { coach_approval_required:true, client_visible:false, candidates:[], suppressed_by_safety:true, reason:"urgent_support_routing_only" };
    }
    const candidates = [];
    for(const domain of definition.domains){
      const score = scoreSnapshot.domain_scores[domain.code].internal;
      const need = Number((40 * (1 - score / 100)).toFixed(4));
      const leverage = leverageForDomain(definition, domain.code, scoreSnapshot.domain_scores);
      const goal = candidateGoalRelevance(definition, domain.code, context || {});
      const readiness = readinessForDomain(domain.code, context || {});
      const adjustment = 0;
      let eligible = true;
      const safetyRestrictions = safetyRoute && safetyRoute.restrictions || [];
      if(safetyRestrictions.includes("specialist_or_qualified_care_workflow_required") && domain.code === "B1") eligible = false;
      candidates.push({
        domain_code:domain.code,
        pillar:domain.pillar,
        name:domain.name,
        eligible,
        components:{
          need,
          cross_domain_leverage: leverage.points,
          goal_relevance: goal.points,
          readiness: readiness.points,
          coach_context_adjustment: adjustment
        },
        reason_codes:[leverage.reason_code, readiness.reason_code].concat(goal.reason_codes).filter(Boolean),
        transparent_reasons:[leverage.reason].filter(Boolean),
        priority_score:Number((need + leverage.points + goal.points + readiness.points + adjustment).toFixed(4))
      });
    }
    candidates.sort((a,b) => Number(b.eligible) - Number(a.eligible) || b.priority_score - a.priority_score || a.domain_code.localeCompare(b.domain_code));
    return { coach_approval_required:true, client_visible:false, candidates:candidates.slice(0,5), suppressed_by_safety:false };
  }

  function approveBig3(candidateResult, approvals){
    const approved = (approvals || []).slice(0, 3).map((approval, index) => ({
      rank:index + 1,
      domain_code:approval.domain_code,
      action:approval.action,
      success_measure:approval.success_measure,
      coach_reason:approval.coach_reason || "coach_review"
    }));
    return { client_visible:true, coach_approved:true, approved_at:new Date().toISOString(), big3:approved };
  }

  function clientResults(definition, scoreSnapshot, publication){
    const pillars = scoreSnapshot.pillar_scores;
    const domains = Object.values(scoreSnapshot.domain_scores).filter(item => item.status === "complete");
    const strong = domains.slice().sort((a,b) => b.internal - a.internal).slice(0,3);
    const lowest = domains.slice().sort((a,b) => a.internal - b.internal)[0];
    const big3 = publication && publication.coach_approved ? publication.big3 : null;
    return {
      title:"Kingdom Capacity Snapshot",
      disclaimer:"These scores summarize reported patterns in this assessment. They are educational coaching signals, not medical care, a treatment plan, or a statement about your identity in Christ.",
      body:pillars.BODY.display,
      soul:pillars.SOUL.display,
      spirit:pillars.SPIRIT.display,
      kci:scoreSnapshot.kci.display,
      strong_foundations: strong.map(item => ({ domain_code:item.domain_code, name:item.name, score:item.display })),
      alignment_gap: lowest ? { domain_code:lowest.domain_code, name:lowest.name, score:lowest.display } : null,
      big3,
      big3_locked: !big3,
      scripture_for_reflection: lowest ? scriptureForDomain(definition, lowest.domain_code) : [],
      next_step:"Review your snapshot with a GodHealth coach before turning it into a personalized plan."
    };
  }

  function scriptureForDomain(definition, domainCode){
    const domain = definition.domains.find(item => item.code === domainCode);
    return domain ? domain.scripture_refs : [];
  }

  function createWeek12Comparison(definition, baselineSnapshot, week12Answers){
    const week12 = scoreAssessment(definition, week12Answers || {});
    const domain_delta = {};
    for(const code of Object.keys(baselineSnapshot.domain_scores)){
      domain_delta[code] = Number((week12.domain_scores[code].internal - baselineSnapshot.domain_scores[code].internal).toFixed(4));
    }
    const pillar_delta = {};
    for(const pillar of ["BODY","SOUL","SPIRIT"]){
      pillar_delta[pillar] = Number((week12.pillar_scores[pillar].internal - baselineSnapshot.pillar_scores[pillar].internal).toFixed(4));
    }
    return {
      definition_version: definition.assessment_definition.definition_version,
      core_question_ids: coreQuestions(definition).map(question => question.id),
      adaptive_deep_dive_default:"off",
      baseline_immutable:true,
      week12_snapshot:week12,
      domain_delta,
      pillar_delta,
      kci_delta:Number((week12.kci.internal - baselineSnapshot.kci.internal).toFixed(4))
    };
  }

  function versionDefinitionOnEdit(definition, activeRunCount, editDescription){
    if(!activeRunCount) return { definition:clone(definition), new_version_created:false };
    const next = clone(definition);
    const parts = String(next.assessment_definition.definition_version || VERSION).split(".").map(Number);
    parts[2] = (parts[2] || 0) + 1;
    next.assessment_definition.definition_version = parts.join(".");
    next.assessment_definition.supersedes = definition.assessment_definition.definition_version;
    next.assessment_definition.change_reason = editDescription || "Question wording changed after active runs existed.";
    return { definition:next, new_version_created:true, historical_runs_immutable:true };
  }

  function createMemoryAutosave(){
    const store = {};
    return {
      save(key, value){ store[key] = clone(value); return { ok:true, key }; },
      load(key){ return clone(store[key]); },
      clear(key){ delete store[key]; return { ok:true, key }; }
    };
  }

  function sanitizeAnalyticsPayload(payload){
    const blocked = new Set(["answers", "core_answers", "deep_dive_answers", "safety_answers", "safety_details", "health_context", "free_text_constraints", "prayer_responses", "scripture_responses"]);
    const clean = {};
    for(const [key, value] of Object.entries(payload || {})){
      if(!blocked.has(key)) clean[key] = value;
    }
    return clean;
  }

  function containsForbiddenOutput(text){
    const lower = String(text || "").toLowerCase();
    return FORBIDDEN_OUTPUT_TERMS.filter(term => lower.includes(term));
  }

  function safeClientLanguageSample(){
    return [
      "This assessment is educational and coaching-oriented.",
      "Scores summarize reported patterns and do not define anyone’s standing before God.",
      "Your Alignment Gap is a current constraint to review with a coach.",
      "Safety flags may require appropriate qualified support before normal coaching recommendations."
    ].join(" ");
  }

  return {
    VERSION,
    assertDefinition,
    countDefinition,
    questionsByRole,
    coreQuestions,
    deepDiveQuestions,
    coachClarificationQuestions,
    clientBaselineQuestions,
    scoreAssessment,
    getBand,
    assignAdaptiveDeepDive,
    validateSubmission,
    routeSafety,
    generateBig3Candidates,
    approveBig3,
    clientResults,
    scriptureForDomain,
    createWeek12Comparison,
    versionDefinitionOnEdit,
    createMemoryAutosave,
    sanitizeAnalyticsPayload,
    containsForbiddenOutput,
    safeClientLanguageSample
  };
});
