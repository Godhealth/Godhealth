export type PillarKey = "physical" | "mental" | "spiritual";

export type ScanAnswer = {
  pts?: number;
  value?: number;
  root?: string;
  text?: string;
};

export type ScanAnswers = Record<string, ScanAnswer>;

export type ReportLead = {
  id: string;
  first_name: string;
  email: string;
};

type ScoreQuestion = {
  pillars: PillarKey[];
  area: string;
  verse: { ref: string; text: string };
  focus: string;
};

export type PillarInsight = {
  key: PillarKey;
  name: string;
  score: number;
  rank: string;
  strength: string;
  growth: string;
  nextStep: string;
};

export type PlanDay = {
  day: number;
  title: string;
  intro: string;
  actions: Record<PillarKey, string>;
};

export type ReportModel = {
  lead: ReportLead;
  overall: number;
  scores: Record<PillarKey, number>;
  primaryKey: PillarKey;
  primaryName: string;
  summary: string;
  gapCopy: string;
  verse: { ref: string; text: string };
  versePractice: string;
  pillars: PillarInsight[];
  plan: PlanDay[];
  completedAt: string;
};

const PILLAR_NAMES: Record<PillarKey, string> = {
  physical: "Body",
  mental: "Soul",
  spiritual: "Spirit",
};

const QUESTIONS: Record<string, ScoreQuestion> = {
  q1: {
    pillars: ["spiritual"],
    area: "your daily walk with God",
    verse: {
      ref: "John 15:5",
      text: "I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing.",
    },
    focus: "Spend ten phone-free minutes in Scripture and honest prayer.",
  },
  q2: {
    pillars: ["mental", "spiritual"],
    area: "how you respond to setbacks",
    verse: {
      ref: "Romans 5:3-4",
      text: "Tribulation worketh patience; And patience, experience; and experience, hope.",
    },
    focus: "When something goes wrong, pray and take one constructive step that same day.",
  },
  qbelief: {
    pillars: ["mental", "spiritual"],
    area: "your belief that change is possible",
    verse: {
      ref: "Matthew 19:26",
      text: "With men this is impossible; but with God all things are possible.",
    },
    focus: "Keep one small promise to yourself and God today.",
  },
  q3: {
    pillars: ["physical"],
    area: "the way you eat",
    verse: {
      ref: "1 Corinthians 10:31",
      text: "Whether therefore ye eat, or drink, or whatsoever ye do, do all to the glory of God.",
    },
    focus: "Plan one simple whole-food meal built around protein and vegetables.",
  },
  q4: {
    pillars: ["physical"],
    area: "daily movement",
    verse: {
      ref: "1 Timothy 4:8",
      text: "For bodily exercise profiteth little: but godliness is profitable unto all things.",
    },
    focus: "Complete a comfortable 20-minute walk.",
  },
  q5: {
    pillars: ["mental", "physical"],
    area: "the stewardship of your body",
    verse: {
      ref: "1 Corinthians 6:19",
      text: "What? know ye not that your body is the temple of the Holy Ghost which is in you?",
    },
    focus: "Choose one caring action that builds strength rather than punishes your body.",
  },
  q6: {
    pillars: ["mental", "physical"],
    area: "sleep and recovery",
    verse: {
      ref: "Psalm 4:8",
      text: "I will both lay me down in peace, and sleep: for thou, LORD, only makest me dwell in safety.",
    },
    focus: "Begin a screen-free wind-down 45 minutes before a realistic bedtime.",
  },
  q7: {
    pillars: ["mental"],
    area: "stress and your thought life",
    verse: {
      ref: "Philippians 4:6-7",
      text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.",
    },
    focus: "Take five minutes to breathe slowly, name the pressure and pray about it.",
  },
  q8: {
    pillars: ["mental", "spiritual"],
    area: "support and accountability",
    verse: {
      ref: "Ecclesiastes 4:9-10",
      text: "Two are better than one; because they have a good reward for their labour. For if they fall, the one will lift up his fellow.",
    },
    focus: "Share one honest commitment with a trusted person.",
  },
  q9: {
    pillars: ["spiritual", "mental", "physical"],
    area: "intentional self-control",
    verse: {
      ref: "Matthew 6:17-18",
      text: "But thou, when thou fastest, anoint thine head, and wash thy face; That thou appear not unto men to fast.",
    },
    focus: "Practise intentional self-control around one food choice and use the moment to pray.",
  },
  q11: {
    pillars: ["physical"],
    area: "daily hydration",
    verse: {
      ref: "John 7:38",
      text: "He that believeth on me, as the scripture hath said, out of his belly shall flow rivers of living water.",
    },
    focus: "Drink water after waking and keep a filled bottle visible.",
  },
  q13: {
    pillars: ["physical", "mental"],
    area: "your daily rhythm",
    verse: {
      ref: "Ecclesiastes 3:1",
      text: "To every thing there is a season, and a time to every purpose under the heaven.",
    },
    focus: "Keep one steady wake, meal or bedtime anchor.",
  },
  q15: {
    pillars: ["mental", "spiritual"],
    area: "connection and service",
    verse: {
      ref: "Galatians 5:13",
      text: "By love serve one another.",
    },
    focus: "Create one moment of real connection or service.",
  },
  qtheo: {
    pillars: ["spiritual"],
    area: "how you see your body before God",
    verse: {
      ref: "1 Corinthians 6:20",
      text: "For ye are bought with a price: therefore glorify God in your body, and in your spirit, which are God's.",
    },
    focus: "Thank God for your body and make one choice from stewardship instead of guilt.",
  },
};

const PILLAR_QUESTIONS: Record<PillarKey, string[]> = {
  physical: ["q3", "q4", "q5", "q6", "q9", "q11", "q13"],
  mental: ["q2", "qbelief", "q5", "q6", "q7", "q8", "q9", "q13", "q15"],
  spiritual: ["q1", "q2", "qbelief", "q8", "q9", "q15", "qtheo"],
};

function clampScore(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error("The scan contains an invalid score.");
  }
  return parsed;
}

function answerScore(answers: ScanAnswers, id: string): number {
  const answer = answers[id];
  if (!answer) throw new Error(`Missing required answer: ${id}`);
  return clampScore(answer.pts, 1, 4);
}

function sentenceArea(area: string): string {
  return area.charAt(0).toUpperCase() + area.slice(1);
}

export function buildReportModel(lead: ReportLead, answers: ScanAnswers): ReportModel {
  const earned: Record<PillarKey, number> = { physical: 0, mental: 0, spiritual: 0 };
  const maximum: Record<PillarKey, number> = { physical: 0, mental: 0, spiritual: 0 };
  let baseTotal = 0;

  for (const [id, question] of Object.entries(QUESTIONS)) {
    const score = answerScore(answers, id);
    baseTotal += score;
    for (const pillar of question.pillars) {
      earned[pillar] += score;
      maximum[pillar] += 4;
    }
  }

  const scaleAnswer = answers.q10;
  if (!scaleAnswer) throw new Error("Missing final alignment answer.");
  const scaleScore = clampScore(scaleAnswer.pts ?? scaleAnswer.value, 1, 10);
  const overall = Math.round(((baseTotal + scaleScore) / ((Object.keys(QUESTIONS).length * 4) + 10)) * 100);
  const scores: Record<PillarKey, number> = {
    physical: Math.round((earned.physical / maximum.physical) * 100),
    mental: Math.round((earned.mental / maximum.mental) * 100),
    spiritual: Math.round((earned.spiritual / maximum.spiritual) * 100),
  };

  const order = (Object.keys(scores) as PillarKey[])
    .sort((a, b) => scores[a] - scores[b]);
  const primaryKey = order[0];
  const primaryName = PILLAR_NAMES[primaryKey];

  const weakestByPillar = {} as Record<PillarKey, string>;
  const pillars = order.map((key, index): PillarInsight => {
    const ids = [...PILLAR_QUESTIONS[key]]
      .sort((a, b) => answerScore(answers, a) - answerScore(answers, b));
    const weakest = ids[0];
    const strongest = [...ids]
      .sort((a, b) => answerScore(answers, b) - answerScore(answers, a))[0];
    weakestByPillar[key] = weakest;
    const weakAreas = ids
      .filter((id) => answerScore(answers, id) <= 2)
      .slice(0, 2)
      .map((id) => QUESTIONS[id].area);
    const growthAreas = weakAreas.length ? weakAreas : [QUESTIONS[weakest].area];
    const strongestScore = answerScore(answers, strongest);
    const strongestArea = QUESTIONS[strongest].area;
    const strength = strongestScore >= 4
      ? `${sentenceArea(strongestArea)} is a clear strength. Protect this rhythm and use it to support the other pillars.`
      : strongestScore === 3
        ? `${sentenceArea(strongestArea)} is your best current foundation. Repetition can turn it into a stable strength.`
        : `Honest awareness is your starting strength. Begin by building ${strongestArea} one small step at a time.`;
    const growth = growthAreas.length > 1
      ? `Your clearest growth opportunities are ${growthAreas[0]} and ${growthAreas[1]}. Work on the first before adding more.`
      : `Your clearest growth opportunity is ${growthAreas[0]}.`;

    return {
      key,
      name: PILLAR_NAMES[key],
      score: scores[key],
      rank: index === 0 ? "Primary Alignment Gap" : index === 1 ? "Second Pillar" : "Supporting Pillar",
      strength,
      growth,
      nextStep: QUESTIONS[weakest].focus,
    };
  });

  const primaryQuestion = QUESTIONS[weakestByPillar[primaryKey]];
  const summary = overall >= 80
    ? "You already have a strong foundation. Protect what works and strengthen the area that is lagging behind."
    : overall >= 60
      ? "You have a workable foundation, with one clear area that deserves focused attention before you try to change everything."
      : "Your answers suggest that simple structure may help more than another burst of motivation. Start small and rebuild one rhythm at a time.";
  const gapCopy: Record<PillarKey, string> = {
    physical: "Your Body score suggests that energy, nutrition, sleep or movement may deserve attention first.",
    mental: "Your Soul score suggests that mindset, stress, discipline or daily structure may deserve attention first.",
    spiritual: "Your Spirit score suggests that prayer, Scripture and connection with God may deserve attention first.",
  };
  const versePractice: Record<PillarKey, string> = {
    physical: "Read this before your first health choice each morning. Ask what choice would honour God with your body, then complete the smallest action from your plan.",
    mental: "Write this verse somewhere visible. When pressure rises, read it slowly, turn the words into a short prayer and choose your next action from a calmer place.",
    spiritual: "Read the verse before checking your phone each morning. Pray it back to God in your own words, then spend ten quiet minutes in Scripture and prayer.",
  };

  const focusFor = (key: PillarKey) => QUESTIONS[weakestByPillar[key]].focus;
  const plan: PlanDay[] = [
    {
      day: 1,
      title: "Create your starting point",
      intro: "Set one clear intention for each pillar. Begin with your Primary Alignment Gap.",
      actions: {
        physical: "Choose the exact time for tomorrow's body action and prepare what you need.",
        mental: "Write one sentence describing the calm, disciplined response you want to practise.",
        spiritual: `Read ${primaryQuestion.verse.ref} slowly and choose a fixed ten-minute Scripture-and-prayer moment.`,
      },
    },
    {
      day: 2,
      title: "Prepare the path",
      intro: "Reduce friction so aligned choices become easier.",
      actions: {
        physical: "Prepare one simple meal, fill your water bottle and place walking shoes where you can see them.",
        mental: "Write tomorrow's three priorities and remove one predictable distraction.",
        spiritual: "Place your KJV verse somewhere visible before you go to sleep.",
      },
    },
    {
      day: 3,
      title: "Work your personal growth areas",
      intro: "Practise the clearest next step from each pillar result.",
      actions: {
        physical: focusFor("physical"),
        mental: focusFor("mental"),
        spiritual: focusFor("spiritual"),
      },
    },
    {
      day: 4,
      title: "Build recovery and stillness",
      intro: "Balance intentional effort with intentional rest.",
      actions: {
        physical: "Take a comfortable walk and protect a realistic bedtime tonight.",
        mental: "Take a ten-minute phone-free pause to breathe, reflect and release mental pressure.",
        spiritual: "Bring one worry to God and end the day with three specific points of gratitude.",
      },
    },
    {
      day: 5,
      title: "Strengthen through support",
      intro: "Use healthy challenge and honest connection instead of relying on willpower alone.",
      actions: {
        physical: "Complete suitable resistance movement at your own level, or repeat your walking rhythm.",
        mental: "Tell one trusted person what you are building and ask for a simple check-in.",
        spiritual: "Pray with, encourage or serve one person without seeking recognition.",
      },
    },
    {
      day: 6,
      title: "Practise integrated alignment",
      intro: "Bring Body, Soul and Spirit into the same decision.",
      actions: {
        physical: "Before one meal or movement choice, pause instead of acting automatically.",
        mental: "Name the thought or emotion influencing the choice and decide what response serves alignment.",
        spiritual: "Ask God for wisdom and self-control, then take the smallest aligned action immediately.",
      },
    },
    {
      day: 7,
      title: "Review, give thanks and continue",
      intro: "Turn this seven-day experiment into a rhythm you can carry forward.",
      actions: {
        physical: "Write down which body habit gave you the most stability and schedule it for next week.",
        mental: "Note your main trigger, your strongest response and one lesson you want to remember.",
        spiritual: "Thank God for the progress you noticed and choose one Scripture-and-prayer rhythm to protect.",
      },
    },
  ];

  return {
    lead,
    overall,
    scores,
    primaryKey,
    primaryName,
    summary,
    gapCopy: gapCopy[primaryKey],
    verse: primaryQuestion.verse,
    versePractice: versePractice[primaryKey],
    pillars,
    plan,
    completedAt: new Date().toISOString(),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function scoreState(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Building";
  return "Focus First";
}

function footer(page: number): string {
  return `<footer><span>GodHealth - Vitality for the Kingdom</span><span>${page}</span></footer>`;
}

export function buildReportHtml(model: ReportModel): string {
  const pillarCards = model.pillars.map((pillar) => `
    <article class="pillar-card ${pillar.key === model.primaryKey ? "primary" : ""}">
      <div class="pillar-heading">
        <div><span class="eyebrow">${escapeHtml(pillar.rank)}</span><h3>${escapeHtml(pillar.name)}</h3></div>
        <div class="pillar-score">${pillar.score}<small>/100</small></div>
      </div>
      <div class="insight-grid">
        <div class="insight"><strong>What is supporting you</strong><p>${escapeHtml(pillar.strength)}</p></div>
        <div class="insight growth"><strong>Where you can grow</strong><p>${escapeHtml(pillar.growth)}</p></div>
      </div>
      <div class="next-step"><strong>Your next step</strong><span>${escapeHtml(pillar.nextStep)}</span></div>
    </article>`);

  const scoreRows = (["physical", "mental", "spiritual"] as PillarKey[]).map((key) => `
    <div class="score-row">
      <div class="score-head"><strong>${PILLAR_NAMES[key]}</strong><span>${scoreState(model.scores[key])} &nbsp; ${model.scores[key]}</span></div>
      <div class="track"><div class="fill" style="width:${model.scores[key]}%"></div></div>
    </div>`).join("");

  const pillarOrder = model.pillars.map((pillar) => pillar.key);
  const planDays = model.plan.map((day) => `
    <article class="day-card">
      <div class="day-badge">DAY<br><strong>${day.day}</strong></div>
      <div class="day-body">
        <h3>${escapeHtml(day.title)}</h3>
        <p class="day-intro">${escapeHtml(day.intro)}</p>
        <div class="day-actions">
          ${pillarOrder.map((key) => `
            <div class="day-action">
              <strong>${PILLAR_NAMES[key]}</strong>
              <span>${escapeHtml(day.actions[key])}</span>
            </div>`).join("")}
        </div>
      </div>
    </article>`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Kingdom Vitality Report - ${escapeHtml(model.lead.first_name)}</title>
  <style>
    @page{size:A4;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#06150d;color:#f7f0dc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.5}
    h1,h2,h3,p{margin:0}
    h1,h2,h3,.serif{font-family:Georgia,"Times New Roman",serif}
    .page{position:relative;width:210mm;height:297mm;padding:17mm 17mm 20mm;overflow:hidden;background:
      radial-gradient(circle at 85% 8%,rgba(207,164,66,.13),transparent 27%),
      linear-gradient(155deg,#0d2d1d 0%,#06150d 56%,#041008 100%);page-break-after:always}
    .page:last-child{page-break-after:auto}
    .page:before{content:"";position:absolute;inset:5mm;border:1px solid rgba(220,181,88,.18);pointer-events:none}
    .brand{text-align:center;color:#e1bc63;font-family:Georgia,"Times New Roman",serif;font-weight:700;letter-spacing:.16em;font-size:11pt}
    .brand-mark{width:12mm;height:12mm;margin:0 auto 3mm;display:grid;place-items:center;border:1px solid rgba(230,197,116,.52);border-radius:50%;color:#e6c574;font-size:16pt;box-shadow:0 0 20px rgba(218,180,90,.12)}
    .eyebrow{display:block;color:#d7af54;font-size:7.5pt;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
    .title{text-align:center;margin-top:10mm}
    .title h1{margin-top:2mm;color:#efd487;font-size:27pt;line-height:1.08}
    .title p{max-width:140mm;margin:3mm auto 0;color:#c9c1ad;font-size:10pt}
    .score-ring{--score:${model.overall};width:55mm;height:55mm;margin:11mm auto 7mm;border-radius:50%;display:grid;place-items:center;position:relative;
      background:conic-gradient(from -90deg,#f7e6a7 0%,#bf8126 calc(var(--score)*.55%),#efd076 calc(var(--score)*1%),rgba(216,178,85,.12) 0);
      border:1px solid rgba(247,221,148,.6);box-shadow:0 0 0 2mm rgba(217,180,90,.035),0 8mm 18mm -9mm #000,0 0 12mm -5mm rgba(229,196,109,.75)}
    .score-ring:before{content:"";position:absolute;inset:4mm;border-radius:50%;background:radial-gradient(circle at 38% 28%,#234b34,transparent 42%),linear-gradient(155deg,#103722,#061a10 70%);border:1px solid rgba(245,219,145,.35)}
    .score-inner{position:relative;text-align:center}
    .score-inner b{display:block;color:#f3db98;font:700 34pt/1 Georgia,"Times New Roman",serif}
    .score-inner span{display:block;margin-top:2mm;color:#c9c1ad;font-size:6.5pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
    .summary{text-align:center;max-width:145mm;margin:0 auto}
    .summary h2{font-size:19pt;color:#f7f0dc}
    .summary p{margin-top:2mm;color:#c9c1ad}
    .scores{margin:9mm auto 0;max-width:155mm;padding:7mm;border:1px solid rgba(220,181,88,.28);border-radius:5mm;background:rgba(0,0,0,.16)}
    .score-row+.score-row{margin-top:4mm}
    .score-head{display:flex;justify-content:space-between;gap:5mm;margin-bottom:1.7mm}
    .score-head strong{color:#f7f0dc}
    .score-head span{color:#d9b45a;font-size:8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
    .track{height:2.4mm;border-radius:99px;background:rgba(0,0,0,.48);overflow:hidden}
    .fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#b97824,#f1d27d)}
    .gap{max-width:155mm;margin:5mm auto 0;padding:5mm 6mm;border:1px solid rgba(224,186,94,.35);border-radius:4mm;background:rgba(214,174,75,.08)}
    .gap h3{margin-top:1mm;color:#f2dc9f;font-size:17pt}
    .gap p{margin-top:1mm;color:#c9c1ad}
    .section-title{margin-bottom:6mm}
    .section-title h2{margin-top:1.5mm;color:#efd487;font-size:24pt;line-height:1.08}
    .section-title p{max-width:155mm;margin-top:2mm;color:#c9c1ad}
    .pillar-card{break-inside:avoid;margin-top:5mm;padding:6mm;border:1px solid rgba(218,180,90,.24);border-radius:5mm;background:rgba(4,19,12,.64)}
    .pillar-card.primary{border-color:rgba(237,205,121,.62);box-shadow:0 6mm 12mm -9mm rgba(213,169,66,.65)}
    .pillar-heading{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:4mm;border-bottom:1px solid rgba(218,180,90,.16)}
    .pillar-heading h3{margin-top:1mm;font-size:19pt}
    .pillar-score{color:#efd487;font:700 25pt/1 Georgia,"Times New Roman",serif}
    .pillar-score small{font:700 7pt Arial,sans-serif;color:#9f998a}
    .insight-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm}
    .insight{padding:4mm;border:1px solid rgba(218,180,90,.14);border-radius:3mm;background:rgba(0,0,0,.14)}
    .insight strong{display:block;color:#d9b45a;font-size:7pt;letter-spacing:.12em;text-transform:uppercase}
    .insight p{margin-top:1.5mm;color:#c9c1ad;font-size:9pt}
    .next-step{display:grid;grid-template-columns:30mm 1fr;gap:3mm;margin-top:4mm;padding:4mm;border-radius:3mm;background:rgba(218,180,90,.08)}
    .next-step strong{color:#efd487;font-size:8pt;letter-spacing:.1em;text-transform:uppercase}
    .next-step span{color:#ded6c2;font-size:9pt}
    .scripture{margin-top:10mm;padding:9mm;border:1px solid rgba(231,198,114,.48);border-radius:6mm;background:linear-gradient(145deg,rgba(49,55,28,.9),rgba(7,27,17,.95))}
    .scripture blockquote{margin:5mm 0 0;color:#f4ead1;font:italic 17pt/1.45 Georgia,"Times New Roman",serif}
    .scripture .ref{margin-top:3mm;color:#d9b45a;font-size:8pt;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
    .practice{margin-top:5mm;padding-top:5mm;border-top:1px solid rgba(218,180,90,.2);color:#c9c1ad}
    .practice strong{color:#efd487}
    .day-card{break-inside:avoid;display:grid;grid-template-columns:15mm 1fr;gap:4mm;margin-top:4mm;padding:5mm;border:1px solid rgba(218,180,90,.2);border-radius:4mm;background:rgba(4,19,12,.67)}
    .day-badge{height:15mm;display:grid;place-items:center;text-align:center;border-radius:3mm;background:linear-gradient(145deg,rgba(218,180,90,.22),rgba(218,180,90,.07));color:#d9b45a;font-size:6.5pt;font-weight:700;letter-spacing:.1em}
    .day-badge strong{font-size:12pt;line-height:.8}
    .day-body h3{color:#f5edd9;font-size:13pt}
    .day-intro{margin-top:1mm;color:#aaa493;font-size:8.5pt}
    .day-actions{margin-top:2.5mm}
    .day-action{display:grid;grid-template-columns:17mm 1fr;gap:2mm;padding:1.8mm 0;border-top:1px solid rgba(218,180,90,.12)}
    .day-action strong{color:#d9b45a;font-size:7pt;letter-spacing:.1em;text-transform:uppercase}
    .day-action span{color:#d5cdbb;font-size:8.5pt}
    .plan-continuation .day-card{margin-top:3mm;padding:4mm}
    .plan-continuation .day-action{padding:1.2mm 0}
    .plan-continuation .section-title{margin-bottom:4mm}
    .disclaimer{margin-top:6mm;padding:4mm;border-left:1.2mm solid #cfa847;background:rgba(218,180,90,.06);color:#aaa493;font-size:8pt}
    footer{position:absolute;left:17mm;right:17mm;bottom:10mm;display:flex;justify-content:space-between;color:#7f7b70;font-size:7pt;letter-spacing:.08em;text-transform:uppercase}
  </style>
</head>
<body>
  <section class="page">
    <div class="brand-mark">✦</div><div class="brand">GODHEALTH</div>
    <header class="title">
      <span class="eyebrow">Personal Alignment Report</span>
      <h1>Your Kingdom Vitality Results</h1>
      <p>Prepared for ${escapeHtml(model.lead.first_name)} from their personal scan responses.</p>
    </header>
    <div class="score-ring"><div class="score-inner"><b>${model.overall}%</b><span>Overall Alignment</span></div></div>
    <div class="summary"><h2>${escapeHtml(model.lead.first_name)}, here is your starting point.</h2><p>${escapeHtml(model.summary)}</p></div>
    <div class="scores">${scoreRows}</div>
    <div class="gap"><span class="eyebrow">Primary Alignment Gap</span><h3>${escapeHtml(model.primaryName)}</h3><p>${escapeHtml(model.gapCopy)}</p></div>
    ${footer(1)}
  </section>

  <section class="page">
    <div class="section-title"><span class="eyebrow">Your Three Pillars</span><h2>Where you stand - and where to grow</h2><p>Begin with your Primary Alignment Gap. Let the stronger pillars support your growth rather than trying to change everything at once.</p></div>
    ${pillarCards.slice(0, 2).join("")}
    ${footer(2)}
  </section>

  <section class="page">
    <div class="section-title"><span class="eyebrow">Your Supporting Pillar</span><h2>Complete your alignment overview</h2></div>
    ${pillarCards[2]}
    <div class="section-title" style="margin-top:10mm"><span class="eyebrow">A KJV Scripture For Your Result</span><h2>Truth to carry into practice</h2></div>
    <div class="scripture">
      <span class="eyebrow">Selected for your ${escapeHtml(model.primaryName)} result</span>
      <blockquote>"${escapeHtml(model.verse.text)}"</blockquote>
      <p class="ref">${escapeHtml(model.verse.ref)} - KJV</p>
      <p class="practice"><strong>Put it into practice:</strong> ${escapeHtml(model.versePractice)}</p>
    </div>
    ${footer(3)}
  </section>

  <section class="page">
    <div class="section-title"><span class="eyebrow">Body - Soul - Spirit</span><h2>Your Personal 7-Day Alignment Plan</h2><p>Every day brings all three pillars together. Your Primary Alignment Gap is listed first inside each day.</p></div>
    ${planDays.slice(0, 3).join("")}
    ${footer(4)}
  </section>

  <section class="page plan-continuation">
    <div class="section-title"><span class="eyebrow">Continue The Rhythm</span><h2>Days 4-7</h2><p>Completion over perfection. If you miss a day, continue with the next step instead of starting over.</p></div>
    ${planDays.slice(3).join("")}
    <p class="disclaimer">This report is educational, Biblical and science-informed. It does not diagnose, treat or replace medical care. Choose actions appropriate for your circumstances and seek qualified professional guidance when needed.</p>
    ${footer(5)}
  </section>
</body>
</html>`;
}
