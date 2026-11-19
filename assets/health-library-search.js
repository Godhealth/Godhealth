(() => {
  const form = document.querySelector('[data-library-search]');
  if (!form) return;
  const input = form.querySelector('input');
  const status = form.querySelector('[role="status"]');
  const cards = [...document.querySelectorAll('#health-topics .gs-topic-cards article, #practical-guides .gh-resource-card')];
  if (!input || !status || !cards.length) return;
  const normalize = value => (value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const groups = [
    ['weight loss', 'fat loss', 'losing weight'],
    ['exercise', 'fitness', 'workout', 'movement', 'training'],
    ['nutrition', 'food', 'diet', 'meals', 'eating'],
    ['sleep', 'energy', 'fatigue', 'tired', 'circadian', 'recovery'],
    ['fasting', 'intermittent fasting', 'spiritual fasting'],
    ['emotional eating', 'stress eating'],
    ['consistency', 'discipline', 'habits', 'routine']
  ];
  const termsFor = value => {
    const normalized = normalize(value);
    const tokens = normalized.split(' ').filter(Boolean);
    return tokens.map(token => {
      const group = groups.find(items => items.some(item => normalize(item).split(' ').includes(token)));
      return group ? [...new Set(group.flatMap(item => normalize(item).split(' ')))] : [token];
    });
  };
  function filter() {
    const query = termsFor(input.value);
    let count = 0;
    for (const card of cards) {
      const text = normalize(card.textContent);
      const visible = query.every(alternatives => alternatives.some(term => text.split(' ').includes(term)));
      card.hidden = !visible;
      if (visible) count++;
    }
    status.textContent = query.length ? count + ' matching resources.' + (count ? '' : ' Try another term or clear the search.') : cards.length + ' resources available.';
  }
  form.addEventListener('submit', event => { event.preventDefault(); filter(); });
  input.addEventListener('input', filter);
  form.addEventListener('reset', () => queueMicrotask(filter));
  form.hidden = false;
  filter();
})();