// Standalone visual prototype only. No production APIs, user data, game launches or persistence.
const search = document.querySelector('#game-search');
const count = document.querySelector('#result-count');
const cards = [...document.querySelectorAll('.game-card')];
if (search && count) {
  search.addEventListener('input', () => {
    const q = search.value.trim().toLocaleLowerCase('pt-PT');
    let visible = 0;
    for (const card of cards) {
      const match = card.textContent.toLocaleLowerCase('pt-PT').includes(q);
      card.hidden = !match;
      if (match) visible++;
    }
    count.textContent = `${visible} títulos demonstrativos`;
  });
}
