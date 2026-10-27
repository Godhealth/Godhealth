# Full website navigation restored — 27 October 2026

Production base: `273136505bfc1ee7a24c2076ad42f80f744d16ed`.

## Requested behavior

Keep the full multipage website. Restore access to every page from the homepage,
show the complete link directory in its footer, update the supporting pages to
the current offer, and replace the top reading-progress strip with the free
7-Step Fat Loss Blueprint announcement.

## Implementation

- All 15 public pages and the 404 page now use one shared header and footer.
  Homepage-only anchor navigation and its reduced footer have been removed.
- The header links to Coaching, Our method, Client stories, Resources and About
  Robin. Resources also exposes Start here, FAQ, Contact, Blueprint, Vitality Scan
  and the Nutrition Bundle. The main button still books the free online call.
- The footer directly links every public page, all five individual guides, the
  free resources, contact details, client login and existing assessment route.
- The free Blueprint announcement appears above the header on every public page.
  The reading-progress strip and its script/CSS have been removed. Subtle readable
  scroll movement remains and respects reduced-motion preferences.
- About Robin, client stories, resources, start-here, FAQ, contact and all five
  guides reflect fat loss, renewed energy, healthy aging and consistency through
  honoring God with the body. Coaching and method retain full service detail.
- The current offer is virtual and personalized: assessment, instantly generated
  downloadable 12-week starting plan, coach refinement, weekly coaching and PT of
  30 minutes or less, monthly mindset/visualization with Patricia, and daily support.
  The published coaching price remains a $250 USD starting investment.
- Existing testimonials are preserved word for word. Existing verified NIV verses
  are reused in appropriate supporting pages with source links and credit.
- Privacy-policy body, functional apps, assessment/scan engines, APIs, funnel,
  payments, Supabase configuration and automation code remain unchanged.

## Checks before preview

- Public build and JavaScript syntax checks pass.
- Static validation passes: 15 public pages, 17 unique image files, 718 local
  references, and 72 protected files unchanged.
- Every public page has one Blueprint announcement, real multipage navigation,
  all 15 public routes in its footer, and no reading-progress strip.
- No obsolete coaching investment figures appear in generated public pages.

Responsive browser review and final deployment status are recorded in the release
conversation. QA wrapper pages are used only in the preview branch, never main.
