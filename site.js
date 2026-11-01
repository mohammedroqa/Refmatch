/** Landing-page navigation, film playback, and historical what-if preview. */
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
function closeMenu() {
  menu.setAttribute('aria-expanded', 'false');
  nav.classList.remove('is-open');
}
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
});
nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
});
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);

const film = document.querySelector('#refmatch-film');
document.querySelectorAll('[data-watch]').forEach(link => link.addEventListener('click', () => {
  if (film.ended) film.currentTime = 0;
  film.play().catch(() => {
    document.querySelector('#playback-status').textContent = 'Use the video player’s Play control, or download the film.';
  });
}));

// The landing board uses the same historical source and engine as the app.
const { recommend } = await import('./demo/engine.js');
const { defaultFixtureId } = await import('./demo/data.js');
const baseline = recommend(defaultFixtureId);
const leadingId = baseline.recommended.id;
const shortlist = document.querySelector('.shortlist');
const candidates = [...document.querySelectorAll('[data-candidate]')];
const exclusion = document.querySelector('#exclude-leading');
document.querySelector('.what-if span:last-child').textContent = `Exclude ${baseline.recommended.name} from this scenario?`;
let selected = leadingId;

function updateBoard(announce = false) {
  const result = recommend(defaultFixtureId, exclusion.checked ? { [leadingId]: false } : {});
  const visible = result.ranked.slice(0, 3);
  if (!visible.some(candidate => candidate.id === selected)) selected = visible[0].id;
  visible.forEach((candidate, index) => {
    const row = candidates[index];
    row.dataset.candidate = candidate.id;
    row.classList.toggle('is-selected', candidate.id === selected);
    row.classList.toggle('is-best', index === 0);
    row.setAttribute('aria-pressed', String(candidate.id === selected));
    row.querySelector('.candidate-rank').textContent = `0${index + 1}`;
    row.querySelector('.candidate-identity strong').textContent = candidate.name;
    row.querySelector('.candidate-status').textContent = index === 0 ? 'Recommended for the next match' : `${candidate.history.comparableCount} comparable assignments`;
    const score = row.querySelector('.candidate-score');
    const unit = document.createElement('small'); unit.textContent = '%';
    score.replaceChildren(document.createTextNode(String(candidate.score)), unit);
    shortlist.append(row);
  });
  const candidate = result.ranked.find(item => item.id === selected);
  document.querySelector('#reason-title').textContent = `Why ${candidate.name}?`;
  document.querySelector('#reason-copy').textContent = candidate.positive[0].text;
  document.querySelector('#reason-flag').textContent = candidate.flag.text;
  const metrics = ['fouls', 'passes', 'cards'];
  document.querySelectorAll('.risk-strip strong').forEach((node, index) => {
    const unit = document.createElement('small'); unit.textContent = '/100';
    node.replaceChildren(document.createTextNode(String(result.risk[metrics[index]].score)), unit);
  });
  if (announce) document.querySelector('#ranking-status').textContent = `${result.recommended.name} leads the historical scenario at ${result.recommended.score}% fit. Actual availability remains unknown.`;
}
candidates.forEach(button => button.addEventListener('click', () => { selected = button.dataset.candidate; updateBoard(); button.focus(); }));
exclusion.addEventListener('change', () => { selected = null; updateBoard(true); });
updateBoard();
