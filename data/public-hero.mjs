import { googleRating } from './public-ui.mjs';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const heroVisuals = {
  'Client stories': ['godhealth-nature-walk.jpg', 'A sunlit woodland path', 'REAL PEOPLE. PERSONAL SUPPORT.', 'Your next chapter starts with a little support.'],
  'Free resources': ['godhealth-nourishing-table.jpg', 'Simple whole foods on a nourishing breakfast table', 'SMALL STEPS. EVERYDAY PROGRESS.', 'Food. Movement. Sleep. A rhythm that fits.'],
  'Start here': ['godhealth-desert-sunrise.jpg', 'Warm morning light over a peaceful landscape', 'YOUR NEXT STEP CAN BE SIMPLE.', 'Start where you are. Grow from there.'],
  'Frequently asked questions': ['robin-coaching-conversation-v2.jpg', 'Robin Kramps listening in a personal coaching conversation', 'A REAL PERSON. CLEAR ANSWERS.', 'Ask freely. Feel comfortable with your next step.'],
  'Contact': ['robin-coaching-conversation-v2.jpg', 'Robin Kramps ready for a personal conversation', 'WE ARE HERE TO LISTEN.', 'Your goals. Your questions. Your next step.'],
};

export function heroPhoto({ file, alt, eyebrow, caption, position = '' }) {
  return `<figure class="gx-hero-photo"${position ? ` style="--gx-photo-position:${escape(position)}"` : ''}><img src="/assets/${escape(file)}" alt="${escape(alt)}" width="1200" height="660" fetchpriority="high" decoding="async"><figcaption><span>${escape(eyebrow)}</span><strong>${escape(caption)}</strong></figcaption></figure>`;
}

export function publicHero({ label, title, description = '', breadcrumb = '', actions = '', meta = '', visual = '', variant = '', rating = true }) {
  return `<section class="gx-hero${variant ? ` gx-hero--${escape(variant)}` : ''}"><div class="gx-hero-top"><div class="gx-hero-atmosphere" aria-hidden="true"><span></span><span></span></div><div class="gh-container gx-hero-copy">${breadcrumb}<p class="gh-kicker">${label}</p><h1>${title}</h1>${description ? `<p class="gx-hero-lead">${description}</p>` : ''}${actions ? `<div class="gx-hero-actions">${actions}</div>` : ''}${meta}${rating ? googleRating() : ''}</div></div>${visual ? `<div class="gx-hero-stage"><div class="gh-container">${visual}</div></div>` : ''}</section>`;
}
