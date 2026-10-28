// The first-month arrangement is shared by the homepage and coaching page.
// No continuation price, refund policy or billing behavior is invented here.
export function firstMonthOffer(call) {
  return `<article class="ge-start-card" aria-label="Your first 30 days of personal coaching">
<span class="ge-offer-label">PERSONAL ONLINE COACHING</span>
<h3>Your first <span>30 days.</span></h3>
<p class="ge-price"><strong>$250</strong><span>USD<small>for the first 30 days</small></span></p>
<p class="ge-price-intro">Start with personal support.<br><strong>Then choose for yourself.</strong></p>
<ol class="ge-offer-phases"><li><span>01</span><div><strong>First 30 days</strong><p>Your personal plan and online coaching support.</p></div></li><li><span>02</span><div><strong>Next 60 days · Your choice</strong><p>Like the support? You decide whether to continue with us.</p></div></li></ol>
${call()}
<p class="ge-call-note">Free 30-minute online call · No obligation</p>
<p class="ge-price-terms">The $250 covers your first 30 days. We explain continuation pricing and terms before you choose the next 60.</p>
</article>`;
}
