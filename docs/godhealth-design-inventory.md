# GodHealth design inventory for Kingdom Capacity Assessment v2

Date: 2026-08-27

This inventory was created before implementing the Kingdom Capacity Assessment v2, as required by the v2 handoff package.

## Existing design system found in the current website

- Typography:
  - Display/headings: `Cormorant Garamond`
  - Body/UI: `Inter`
- Core palette:
  - `--forest-deep: #04160e`
  - `--forest: #0a2417`
  - `--forest-soft: #0f3221`
  - `--gold-1: #b88a2e`
  - `--gold-2: #d9b45a`
  - `--gold-3: #f1d693`
  - `--ink: #f7f3ea`
  - `--cream: #fbf5e8`
  - `--cream-2: #f5ead4`
  - `--charcoal: #211b12`
- Layout:
  - Main wrapper: `width:min(1120px, calc(100% - 40px)); margin:auto`
  - Sections use responsive vertical padding around `clamp(70px, 9vw, 112px)`
  - Mobile layout collapses grid components to one column.
- Components to reuse:
  - Sticky premium header with gold `GodHealth` wordmark and hamburger menu.
  - Gold CTA button style using a multi-stop gold gradient, rounded pill radius and subtle shine.
  - Premium dark cards with forest gradients, gold border lines and inner highlights.
  - Cream cards on light sections with the same gold border language.
  - Reveal animation: opacity + translateY with IntersectionObserver.
  - Form inputs: rounded dark fields, gold focus states, centered question flow.
  - Footer business details and privacy link.

## Existing functions that must remain intact

- Homepage hero video controls and unmute behavior.
- Existing Kingdom Vitality Scan at `/kingdom-vitality-scan.html`.
- Strategy Call flow and Calendly redirect on `/coaching/`.
- WhatsApp help widget.
- Supabase public configuration in `godhealth-config.js`.
- Blueprint lead magnet files retained in the codebase, even where no longer visually promoted.
- SEO files: `sitemap.xml` and `robots.txt`.

## KCA v2 implementation approach

- Add the KCA v2 as a separate authenticated route: `/kingdom-capacity-assessment/`.
- Keep the canonical v2 assessment definition in `kca/config-v2.json`.
- Place all assessment formulas, adaptive logic, safety routing and Big 3 candidate logic in `kca/engine.js`.
- Keep acceptance tests in `kca/run-acceptance-tests.js`.
- Add Supabase schema/migration proposal for production persistence without exposing secret keys.
- Do not modify the current homepage, scan, coaching form or WhatsApp behavior while adding KCA v2.
