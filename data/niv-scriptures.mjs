// Full short NIV verses, verified against the linked YouVersion/Bible.com pages on 2026-10-27.
export const nivScriptures = {
  honor: {reference:'1 Corinthians 6:20', text:'you were bought at a price. Therefore honor God with your bodies.', url:'https://www.bible.com/bible/111/1CO.6.20.NIV'},
  glory: {reference:'1 Corinthians 10:31', text:'So whether you eat or drink or whatever you do, do it all for the glory of God.', url:'https://www.bible.com/bible/111/1CO.10.31.NIV'},
  days: {reference:'Psalm 90:12', text:'Teach us to number our days, that we may gain a heart of wisdom.', url:'https://www.bible.com/bible/111/PSA.90.12.NIV'},
  practice: {reference:'James 1:22', text:'Do not merely listen to the word, and so deceive yourselves. Do what it says.', url:'https://www.bible.com/bible/111/JAS.1.22.NIV'},
  counsel: {reference:'Proverbs 15:22', text:'Plans fail for lack of counsel, but with many advisers they succeed.', url:'https://www.bible.com/bible/111/PRO.15.22.NIV'},
  mindset: {reference:'Colossians 3:2', text:'Set your minds on things above, not on earthly things.', url:'https://www.bible.com/bible/111/COL.3.2.NIV'},
};
export function scripture(id, modifier = '') {
  const verse = nivScriptures[id];
  if (!verse) throw new Error(`Unknown Scripture reference: ${id}`);
  return `<figure class="gh-scripture ${modifier}" data-scripture="${id}"><blockquote>${verse.text}</blockquote><figcaption><a href="${verse.url}" target="_blank" rel="noopener noreferrer">${verse.reference} <span>(NIV)</span></a></figcaption></figure>`;
}
export const scriptureCredit = () => '<p class="gh-scripture-credit">NIV Scripture quotations © 1973, 1978, 1984, 2011 Biblica, Inc. All rights reserved worldwide.</p>';
