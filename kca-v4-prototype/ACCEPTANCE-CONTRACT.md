# GodHealth V4 — frozen acceptance contract

Scope frozen 2026-10-10. This contract supersedes aspirational descriptions; **passing CI alone is not release approval**. No live V3 changes or production migrations are authorized.

| Gate | Evidence required | Status |
|---|---|---|
| 1. Ingredient catalogue | 196 individual records audited with provenance, species/preparation, processing, allergens, missing nutrients, explicit approve/exclude/hold decision and review evidence. Only approved ingredients may enter generated meals. | OPEN: 196 provisional candidates; not integrated |
| 2. Nutrition calculation | Deterministic USDA mappings; 7-day totals; macro targets only when explicitly configured; micronutrient constraints with missing-data warnings, upper-limit checks where appropriate; infeasibility handling and regression tests. | PARTIAL: calculated totals and optional constraints, no personalized reference validation |
| 3. Personalized meals | Seven days, actual ingredient grams, recipes, grocery quantities, clear hold for allergies/medical flags, no unapproved foods. | PARTIAL: 10 recipes, 26 mapped foods, hold logic |
| 4. 12-week program | Body/Soul/Spirit, workouts <=30 minutes, weekly accountability, coherent score-to-plan mapping, tests. | PARTIAL: implementation and scenario tests; full content review pending |
| 5. Mobile and accessibility | Real Safari iOS, Chrome Android and desktop journeys; keyboard/focus, save/resume, export and failure tests with screenshots and defects fixed. | OPEN: static checks only |
| 6. PDF | Actual PDF output from complete representative reports; visually inspect every page, tables, text, page breaks and missing data. | OPEN: browser-print HTML, no verified actual PDF output |
| 7. End-to-end release QA | All automated tests green, representative high-risk and ordinary scenarios, privacy and fallback verification, defect log closed. | PARTIAL: CI tests green; manual QA open |
| 8. Isolated handoff | PR diff verified V3 untouched, documented rollback, version/tag, owner sign-off for any later deployment. | PARTIAL: isolated PR, no release sign-off |

## Release rules
- Owner removed mandatory external dietitian sign-off from the **development workflow**. Never represent that as medical approval or validated clinical nutrition advice.
- Missing nutrients are unknown, not zero. No automatic adequacy, deficiency or treatment claims.
- If food identity, allergens, medical history or a nutrient target cannot be checked, hold the plan for human review instead of silently guessing.
- A gate can only move to DONE with a link to test logs, review artifact, screenshot or reproducible result. Unknown evidence remains OPEN.
- This scope is frozen. Any future feature request must be separately accepted and must not retroactively move the finish line.
