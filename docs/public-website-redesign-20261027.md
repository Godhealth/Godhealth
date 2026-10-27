# Public GodHealth website redesign — 27 October 2026

## Scope and recovery

Production repository: `Godhealth/Godhealth`. Base commit: `7c5980f12e78951fc0cf980132e456261cab8170`.
Recovery branch: `backup/pre-public-redesign-20261027`.

Only public marketing pages and their new isolated presentation assets change. The Kingdom Vitality Scan, client application, coach dashboard, Kingdom Capacity Assessment, Supabase configuration, API/lead logic, n8n references, Blueprint branch and sales repository remain unchanged. No database migrations or automation edits.

## Reference audit

Observed reference: https://www.acquisition.com/about-alex-hormozi-acquisition

The public XML sitemap at https://www.acquisition.com/sitemap.xml contained **611 URL entries** when retrieved on 27 October 2026. This is an inventory count, not a claim that every URL is a distinct live editorial page, indexed by Google or independently inspected in a browser.

Heuristic path classification (mutually exclusive, based on URL names):

| Group | URLs |
| --- | ---: |
| Workshop pages and campaign variants | 176 |
| Opt-ins and roadmap variants | 121 |
| Training lesson pages | 75 |
| Thank-you, follow-up and pre-call pages | 36 |
| Other brand, product, media, resource and utility URLs | 203 |

The core homepage, founder biography, team/firm page, roadmap opt-in, training hub and workshop offer were read directly. Founder-page desktop layout and live navigation were inspected in the browser. Not all 611 pages were individually reviewed.

### Transferable structure, not copied content

- A short, immediately understandable outcome at the top.
- A named audience and a specific next action.
- Visible distinctions between free help, self-guided products and high-touch help.
- Relevant proof before additional persuasion, using only real business facts.
- Founder identity, experience and a separate deeper biography.
- Product/offer details on a dedicated page instead of making every page sell everything.
- Resources organized as a useful library, with individual pages answering particular questions.
- Consistent navigation and footer links across the public site.
- Objection handling near the decision point, clear scope and no invented outcomes.

The reference uses brief action-led phrases, first-person CTA language, concrete formats and direct questions. GodHealth translates that approach into its own vocabulary: busy Christians, food, workouts, energy, support, personal plan, next step. No Acquisition.com text, photography, statistics, trademarked framework or claims are transplanted.

## GodHealth source materials

Read the three user-supplied PDFs: Avatar Worksheet v3, Offer Worksheet ($397 first 30 days / $797 final 8 weeks), and USP Worksheet. The implementation uses the current offer document where the older avatar file mentions a different investment.

Positioning: personal Christian lifestyle coaching for busy men and women who want to lose excess fat, rebuild energy and stop the restart cycle. Mechanism: assess daily obstacles, personalize a realistic plan, coach follow-through. Differentiators: short home-friendly workouts, custom nutrition, weekly private coaching and PT, daily support, monthly Christian mindset support.

Founder facts and all four complete testimonials are retained from the supplied material and existing website. No fictional transformations are presented as client proof. Existing AI before/after illustrations are not used as results evidence.

## New information architecture

| Canonical route | Visitor need |
| --- | --- |
| `/` | Immediately understand the audience, problem, help and next step |
| `/coaching` | Understand personal support, delivery, fit, investment and booking |
| `/method` | Understand the assessment → plan → follow-through process |
| `/about-robin` | Understand the founder's real background and scope |
| `/client-stories` | Read the four complete existing testimonials |
| `/resources` | Find free resources and practical guides |
| `/start-here` | Choose one useful starting point |
| `/faq` | Get clear answers before deciding |
| `/contact` | Contact the business or book a call |
| `/guides/christian-fat-loss` | Build a realistic fat-loss starting routine |
| `/guides/healthy-eating-busy-christians` | Simplify recurring food decisions |
| `/guides/30-minute-home-workouts` | Plan manageable training and progression |
| `/guides/consistent-health-habits` | Build a normal-day and busy-day habit plan |
| `/guides/sleep-and-energy` | Reflect on routine without diagnosing fatigue |
| `/privacy.html` | Retain the existing privacy-policy content |

15 public pages plus a custom 404; 12 new substantive public routes. The existing scan URL remains available and is included in the sitemap. Client and coach login routes are not marketing pages and are not redesigned.

## Search and performance work

- Pre-rendered HTML; core content and links do not depend on JavaScript.
- Unique titles, descriptions and self-referencing canonicals.
- Semantic headings, one H1, readable routes, breadcrumbs and linked resource cluster.
- Organization/WebSite/WebPage data; accurate Person and Service data; Article data on guides. No invented ratings, unsupported medical credentials or FAQ rich-result promises.
- Updated public sitemap; preserved crawl access; no indexing promise.
- Responsive layouts, alt text, image dimensions, lazy loading below the fold and no new heavy framework.
- The existing Manrope family is subset and self-hosted (five WOFF weights, approximately 85 KB total), with the font license included. No external font stylesheet is needed by the new public pages.
- Original intro video is click-to-play with sound, native controls and `preload="none"`; no autoplay bandwidth.
- Scoped CSS and JS; original shared styles/scripts kept intact for legacy/functional pages.
- Existing attribution is carried only via an allowlist of campaign identifiers. No name, email, phone or other PII is forwarded. Existing analytics is not reinstalled; no new/duplicate Meta Lead event is emitted.

Google does not reward a page count by itself. Search work targets helpful, original pages with a distinct purpose. Search Console submission and real indexing/ranking are separate external steps and are not reported as completed.

## Sources for the educational guides

- https://www.cdc.gov/physical-activity-basics/guidelines/adults.html
- https://www.cdc.gov/physical-activity-basics/adding-adults/index.html
- https://www.niddk.nih.gov/health-information/weight-management/choosing-a-safe-successful-weight-loss-program
- https://www.niddk.nih.gov/health-information/weight-management/healthy-eating-physical-activity-for-life/health-tips-for-adults
- https://www.niddk.nih.gov/health-information/diet-nutrition/changing-habits-better-health
- https://www.nhlbi.nih.gov/health/sleep/how-much-sleep
- https://developers.google.com/search/docs/essentials
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content

## Deliberate constraints

The offer document leaves refund/cancellation details of the Love It or Leave It offer unresolved. Correct pricing is shown without inventing refund eligibility or a guarantee of physical results. Exact written service terms should be confirmed before enrollment.

The plan examples are explicitly illustrative. Lifestyle assessments are not medical diagnostics. Faith-based food convictions are explicitly separated from scientific claims. There are no disease-cure claims, guilt-based spiritual claims, fake urgency or invented scarcity.

## Rebuild

`node scripts/build-public-site.mjs`

Generated HTML is committed so the existing static Vercel project does not need a new framework, build setting, dependency installation or migration.

## Verification completed before release

- Static validation: 15 public pages, 12 image sources, 542 local links, unique metadata, valid JSON-LD and one H1 per page.
- Baseline hash comparison: 72 protected functional/configuration files unchanged.
- Browser: all 15 pages checked at 390px device-frame width; no horizontal overflow.
- Additional home widths: 320, 375, 430, 768 and 1024px. A narrow-header overflow found at 320px was corrected and retested (305px content width = 305px scroll width).
- Mobile navigation opens, follows the Coaching link and closes; desktop Resources submenu works.
- FAQ expands and shows the current $397 / $797 / $1,194 pricing.
- Existing intro video plays: 148.491 seconds, unmuted, playing, media readyState 4.
- Attribution smoke test: allowed UTM values reach Calendly; an unrelated query parameter does not.
- Browser error review found extension-origin metadata messages, not public-site JavaScript errors.

Responsive checks use actual narrow browser iframe viewports, not physical iPhones. No real lead was submitted, appointment booked, payment made or production client data written during QA.
