# GodHealth Kingdom Capacity Assessment V4 — release checklist

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
3. Current recipe selection is **not** a constrained macro/micronutrient optimizer. It adjusts serving sizes using estimated maintenance energy and reports USDA-calculated totals, discrepancies and missing nutrients. **No individual RDA or micronutrient sufficiency claims.**
4. Calorie estimation uses population equations and limited activity inputs; it is not a dietetic prescription. Do not auto-prescribe a deficit. Clinical flags, eating-disorder history and allergies trigger coach holds.
5. Weekly checkboxes and reminders are **printable worksheets only**. No notifications or persistent client records are created.
6. The generated file is HTML that the client can print to PDF; the prototype does not generate a server-side PDF.
7. Validate print layout on desktop/mobile, browser storage privacy, keyboard access, error handling and real user experience before launch.
8. No production Supabase, client-dashboard, V3 or live-site migration has been performed.

## Human sign-off required before production
- [ ] Food taxonomy and all proposed ingredient approvals
- [ ] Dietitian review of food composition, target calculations, allergies and special diets
- [ ] Medical/mental-health referral and safety language review
- [ ] Faith/Scripture content review
- [ ] Full accessibility and browser/mobile QA, including report PDF print
- [ ] Privacy/security review and consent for any future cloud storage
- [ ] Owner approves a separate, staged rollout plan

Development branch: `feature/kca-v4-isolated-prototype`. Pull request #9.