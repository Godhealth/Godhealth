# Four goals, NIV Scripture and visual experience — 27 October 2026

Production base: `0ccb1955b7e2e4f49008a51220fb67f859c0c20a`.

## User direction

The focus is fat loss, regaining energy, longevity and consistency, through honoring
God with the body. Preserve the warm homepage, vertical offer overview, introduction
video, all four client stories and the single free-call destination. Add fitting NIV
passages, relevant imagery and scroll motion without obscuring the information.

## Changes

- The opening explicitly names all four goals and ties them to Christian stewardship.
- Four compact image cards explain fat loss, energy, healthy aging and consistency.
  Existing owned-site assets show nourishing food, daylight, walking and personal
  coaching. A fifth new placement pairs the method with a Bible in a woodland setting.
- Longevity is expressed as healthy aging, strength, mobility and long-term wellbeing.
  No guaranteed lifespan extension or medical outcome is promised.
- Six complete short NIV verses are distributed across the homepage, coaching page
  and method page, with NIV labels, direct source links and copyright acknowledgment.
- Scroll enhancements include small upward movements, staggered cards/offer rows,
  a progress indicator, smooth section navigation and a gentle image-crop movement.
  Content is always readable; JavaScript and motion are progressive enhancements.
  Reduced-motion preference disables these movements.
- Existing video, carousel controls, daily support, Patricia's role, instant
  downloadable starting plan and the $250 starting investment remain in place.

## NIV verification

All quotations are the complete verse, checked against YouVersion/Bible.com NIV
version 111 on 27 October 2026. Canonical text and URLs are in
`data/niv-scriptures.mjs`. The six distinct passages total 81 words.

| Placement | Reference | Official text source |
| --- | --- | --- |
| Homepage stewardship strip | 1 Corinthians 6:20 | https://www.bible.com/bible/111/1CO.6.20.NIV |
| Homepage method | 1 Corinthians 10:31 | https://www.bible.com/bible/111/1CO.10.31.NIV |
| Homepage daily practice | James 1:22 | https://www.bible.com/bible/111/JAS.1.22.NIV |
| Homepage long-term perspective | Psalm 90:12 | https://www.bible.com/bible/111/PSA.90.12.NIV |
| Coaching support | Proverbs 15:22 | https://www.bible.com/bible/111/PRO.15.22.NIV |
| Method and mindset | Colossians 3:2 | https://www.bible.com/bible/111/COL.3.2.NIV |

Scripture supplies the faith foundation; it is not presented as experimental
evidence for a medical or lifespan claim.

## Verification

- Public build completed. Static checks passed all 15 pages, 17 distinct images,
  540 local references and 72 protected files.
- Desktop browser review: all four goal labels, four homepage verses and relevant
  image files present; no horizontal overflow.
- Motion observed after section navigation: progress reached approximately 30%,
  reveal targets became visible and the Bible image crop moved with scroll position.
  A compositor issue with an initial transform-based image motion was corrected by
  using object-position instead. No content remains at zero opacity.
- Narrow iframe checks: home at 320, 390, 768 and 1024px; coaching and method at
  390px. No horizontal document overflow, one H1 and 4/1/1 Scripture blocks.
- The experience script excludes carousel cards and the video from reveal transforms.
  It does not change data, account, lead, payment or automation behavior.
- Reduced-motion behavior reviewed in source and CSS; no physical-device testing
  or medical-result claim is implied by these checks.

Preview-only device frames and external asset substitutions are excluded from the
production source. No client, assessment, PDF, API, Supabase, funnel or payment code
is changed.
