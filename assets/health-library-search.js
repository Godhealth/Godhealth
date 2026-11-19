(() => {
  const form = document.querySelector('[data-library-search]');
  if (!form) return;
  const input = form.querySelector('input');
  const status = form.querySelector('[role="status"]');
  const cards = [...document.querySelectorAll('#health-topics .gs-topic-cards article, #practical-guides .gh-resource-card')];
  const normalize = value => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  const aliases = {'weight loss':'fat loss','workout':'exercise fitness movement','nutrition':'food diet meals','sleep':'energy recovery tired','fasting':'faith prayer','emotional eating':'stress habits'};
  function filter() {
    const terms = normalize(input.value).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const card of cards) {
      let haystack = normalize(card.textContent);
      for (const [key, extra] of Object.entries(aliases)) if (haystack.includes(key)) haystack += ' ' + extra;
      const visible = terms.every(term => haystack.includes(term));
      card.hidden = !visible;
      if (visible) count++;
    }
    status.textContent = terms.length ? count + ' matching resources.' + (count ? '' : ' Try a shorter search or clear the field.') : cards.length + ' resources available.';
  }
  form.addEventListener('submit', event => { event.preventDefault(); filter(); });
  input.addEventListener('input', filter);
  form.addEventListener('reset', () => { input.value = ''; filter(); });
  filter();
})();