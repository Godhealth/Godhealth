// Shared offer copy. The 12-week downloadable plan and the first 30 days of
// coaching are distinct. Continuation remains the client's separate decision.
import { googleRating } from './public-ui.mjs';
export const transformationPlan = 'Your personalized 12-week transformation lifestyle plan';
export const nutritionPlan = 'Personalized Biblical and science-based nutrition plan';
export const trainingPlan = 'Personalized fat loss and muscle-building training plan for your busy schedule';
export const limitedPlaces = 'Limited to 10 clients per GodHealth coaching journey. One-to-one coaching, with maximum personal attention for each client.';
export const promotionSummary = 'Normally $350 USD, now $250 USD for your first 30 days. Offer valid through December 31, 2026. ' + limitedPlaces;
export const recipePacks = [
  ['Smoothie',30], ['Gluten-Free',45], ['5-Ingredient',40], ['Low-Carb',40],
  ['Vegan',40], ['High-Protein',52], ['Vegetarian',58],
];
export const bundleGuides = [
  'Biblical Nutrition Guide', '7-Day Transformation Blueprint',
  '30-Day Fasting & Done-for-You Meal Plan', '30-Day Kingdom Health Tracker',
  'GodHealth Food Swap Guide', 'Emergency Eating Guide', 'Quick-Start Assessment',
];
export function nutritionBundleDetails() {
  return `<details class="ge-bundle-details"><summary>See everything in the Nutrition Bundle</summary><div class="ge-bundle-contents"><div><h4>Recipe Vault · 305 recipes</h4><ul>${recipePacks.map(([name,count])=>`<li><strong>${count}</strong> ${name} recipes</li>`).join('')}</ul></div><div><h4>7 practical guides & tools</h4><ul>${bundleGuides.map(name=>`<li>${name.replaceAll('&','&amp;')}</li>`).join('')}</ul></div></div></details>`;
}
export function firstMonthOffer(call) {
  return `<article class="ge-start-card ge-start-card-wide" aria-label="Your first 30 days of personal coaching" data-offer-valid-through="2026-12-31">
<div class="ge-promotion-banner"><strong>YOUR FIRST 30 DAYS · SPECIAL OFFER</strong><span>Valid through <time datetime="2026-12-31">December 31, 2026</time></span></div>
<p class="ge-capacity-note"><strong>10 limited spots per GodHealth coaching journey.</strong><span>Because this is one-to-one coaching, we keep each journey small to give every client maximum personal attention.</span></p>
<div class="ge-price-copy">
<span class="ge-offer-label">PERSONAL ONLINE COACHING</span>
<h3>Your first <span>30 days.</span></h3>
<p class="ge-regular-price">Normally <s>$350</s> USD</p>
<p class="ge-price"><strong>$250</strong><span>USD<small>for the first 30 days</small></span></p>
<p class="ge-price-intro">Your personalized plans, the full Nutrition Bundle and personal online support.<br><strong>Built around your real life.</strong></p>${googleRating()}</div>
<div class="ge-price-decision"><ol class="ge-offer-phases"><li><span>01</span><div><strong>First 30 days · $250 USD</strong><p>Put your personal plan into practice with us.</p></div></li><li><span>02</span><div><strong>Next 60 days · Your choice</strong><p>Like the support? You decide whether to continue with us.</p></div></li></ol>
${call()}
<p class="ge-call-note">Free 30-minute online call · No obligation</p>
<p class="ge-price-terms">The $250 covers your first 30 days. We explain continuation pricing and terms before you choose the next 60.</p>
</div></article>`;
}
