# GodHealth KCA V4 — isolated prototype

This folder is a **non-production prototype**. No V3 files, database migrations, scores, plans, or client records are changed.

Open `index.html` locally to test the mobile-first questionnaire. Data is stored only in the current browser session; it is not sent to Supabase or used to create coaching prescriptions.

## Design guarantees
- BODY → SOUL → SPIRIT, with early safety routing.
- Preserve the original 24 core question IDs and their 0–4 score values.
- Keep sauna (RC1) and cold exposure (RC2) as optional context.
- Do not automatically prescribe fasting, calories, or training.
- No live integration or V3 migration without separate approval.
- The questionnaire is a prototype: final field dependencies, validation, accessibility and coach report mapping require testing.
