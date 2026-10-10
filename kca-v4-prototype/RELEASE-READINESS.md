# GodHealth Kingdom Capacity Assessment V4 — release checklist

**Binding release criteria:** see [ACCEPTANCE-CONTRACT.md](./ACCEPTANCE-CONTRACT.md). Only evidenced completed gates count; do not declare V4 finished from CI alone.

**Status: ISOLATED PREVIEW / COACH REVIEW ONLY. Do not merge into live V3.**

## What is implemented
- 24 unchanged capacity scoring questions and expanded intake, client-side draft state, JSON export.
- 12-week Body / Soul / Spirit roadmap; at-home or gym workouts capped at 30 minutes.
- 10 original recipes, 7-day sample schedule and shopping list. Portions are preliminary and require approval.
- 26 locally bundled USDA ingredient mappings, including provenance IDs; 18 nutrient fields when available. Nutrient values are per 100g, not a clinical adequacy assessment.
- 196 conservatively screened **candidate** USDA food records in `usda-expanded-review.json`. **None are automatically authorized for client meal plans.**
- Printable premium-styled HTML report, browser Save as PDF, twelve weekly accountability worksheets, coach review/sign-off checklist.
- Automated tests: scoring, safety, planner, recipes, USDA mappings, offline nutrition, expanded candidate catalogue and end-to-end client scenarios.

## Explicit limitations / safety gates
1. A qualified reviewer must examine all 196 candidate food descriptions, species, preparation states, processing, added ingredients, nutrient completeness and theological suitability **before** expanding the production recipe library. The screen is algorithmic, not an authoritative biblical certification.
2. `skyr` currently maps to plain nonfat Greek yogurt (proxy). Several other USDA entries may not exactly match branded or cooked ingredients. Correct these variants before clinical use.
3. Recipe portions now use bounded ingredient-level optimization against a maintenance-energy reference. Explicit coach-defined macro targets and optional micronutrient constraints are supported by the engine, but individual nutrient reference ranges, upper limits and clinical adequacy are not validated or automatically prescribed. **No individual RDA or micronutrient sufficiency claims.**
4. Calorie estimation uses population equations and limited activity inputs; it is not a dietetic prescription. Do not auto-prescribe a deficit. Clinical flags, eating-disorder history and allergies trigger coach holds.
5. Weekly checkboxes and reminders are **printable worksheets only**. No notifications or persistent client records are created.
6. The generated file is HTML that the client can print to PDF; the prototype does not generate a server-side PDF.
7. Validate print layout on desktop/mobile, browser storage privacy, keyboard access, error handling and real user experience before launch.
8. No production Supabase, client-dashboard, V3 or live-site migration has been performed.

## Human sign-off required before production
- [ ] Food taxonomy and all proposed ingredient approvals
- [ ] Owner-controlled non-clinical food composition and calculation checks (external dietitian sign-off is not a required development gate; no clinical validation is implied)
- [ ] Medical/mental-health referral and safety language review
- [ ] Faith/Scripture content review
- [ ] Full accessibility and browser/mobile QA, including report PDF print
- [ ] Privacy/security review and consent for any future cloud storage
- [ ] Owner approves a separate, staged rollout plan

Development branch: `feature/kca-v4-isolated-prototype`. Pull request #9.
## Food review workflow (added)
Open `kca-v4-prototype/food-review.html` from the same hosted V4 preview as the JSON catalogue. Filter the 196 candidates, mark pending/approved/excluded/review, record evidence and preparation notes, and export the local JSON. This is a **reviewer draft**, not production authorization. The reviewer must sign off on the source, Biblical interpretation, allergen status and food preparation. Do not enable the candidate records in recipe generation based only on the local approval flag.

## Nutrient comparison source
EFSA dietary reference values: https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values and DRV Finder: https://multimedia.efsa.europa.eu/drvs/index.htm. These are population reference values, **not** individualized clinical prescriptions. Individualized reference ranges, upper limits and contraindications must not be activated without reliable, appropriate validation. The owner has not required an external dietitian for technical development; this does not authorize medical advice.

## Latest optimization implementation
- `recipes.js` now has deterministic bounded ingredient-level portion optimization against an estimated maintenance-energy reference. `optimizePortions(items, energy, macros)` can additionally optimize against **explicit coach-supplied** protein/fat/carbohydrate gram targets. These targets are not inferred from user characteristics, and a coach must validate them.
- No micronutrient sufficiency solver is active; USDA daily and seven-day totals are calculated and missing values identified, but are not automatically compared to a clinically validated set of individual DRVs/upper limits.
- `build-food-audit.cjs` generates an itemized audit for all 196 provisional foods. It does not constitute food-by-food approval. The review interface remains separate from production recipes.
- Static UI tests and CI cannot substitute for real Safari/Chrome/mobile rendering or a professional PDF page-by-page check.
