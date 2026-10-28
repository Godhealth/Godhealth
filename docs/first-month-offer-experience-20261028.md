# First-month offer and scroll experience — 28 October 2026

Production base: `59996174e1c46e5c0891c6336781352d8e25e6a1`.

- The homepage offer now shows $250 USD for the first 30 days in a dedicated
  price card beside the six support items. The visitor chooses whether to
  continue for the remaining 60 days if the support suits them. Continuation
  pricing is explained before that decision; no later amount is published.
- The same card is used on Coaching. Price references in FAQ, Start here,
  Contact and metadata specify the first 30 days. The instantly downloadable
  personalized plan remains a 12-week starting roadmap; it does not imply
  that $250 includes all 90 days of coaching.
- Book-call buttons use the sales site's existing purchase-button visual
  treatment: #b8944f gold, light border, square corners, shadow/glow, diagonal
  shine and moving arrow. Source: Godhealth/godhealth-sales-page commit
  `bbd33acece69491cf732f8f49859f453ffae8713`, assets/styles.css. The live Vercel
  deployment was confirmed to use that commit. Button destinations are unchanged.
- Gentle scroll entries, staggered cards, heading-line reveals, an active
  offer-step highlight, calm color blocks and selective bold/color emphasis
  strengthen the existing presentation. Text remains visible throughout.
- Button loops run only while visible and pause when the document is inactive.
  Reduced-motion preferences disable decorative movement. No dependencies,
  tracking, form, payment, subscription or automation changes are introduced.
- All 15 public routes, their shared navigation/footer, the free Blueprint bar,
  video, four original testimonials and verified NIV text remain available.

Before preview: build, JS syntax and whitespace checks pass. Static validation
passes 15 public pages, 17 unique images, 733 local references and 72 protected
functional/configuration files unchanged. Browser review and deployment status
are recorded in the release conversation. Responsive QA wrappers are preview-only.
