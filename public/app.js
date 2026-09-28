// ClassicBet frontend — vanilla JS single-page app talking to the JSON API in /server.

const SPORT_META = {
  futebol: { name: 'Futebol', icon: '⚽' },
  basquetebol: { name: 'Basquetebol', icon: '🏀' },
  tenis: { name: 'Ténis', icon: '🎾' },
  hoquei: { name: 'Hóquei no Gelo', icon: '🏒' },
  dardos: { name: 'Dardos', icon: '🎯' },
  esports: { name: 'CS2 (eSports)', icon: '🎮' },
  voleibol: { name: 'Voleibol', icon: '🏐' },
  andebol: { name: 'Andebol', icon: '🤾' },
};
const CODE_LABEL = { 1: 'Casa', X: 'Empate', 2: 'Fora' };
const GAMES = [
  ['Royal Fortune', 'Slots', '🎰'], ['Neon Roulette', 'Roleta', '🎡'], ['Blackjack Pro', 'Blackjack', '🃏'],
  ['Golden Baccarat', 'Bacará', '♠️'], ['Mega Fruits', 'Slots', '🍒'], ['Live Roulette', 'Ao Vivo', '🎯'],
  ['Diamond 7s', 'Slots', '💎'], ['Dragon Tiger', 'Ao Vivo', '🐉'], ['Fancy Cards', 'Casino', '🂡'], ['Wild Crown', 'Novos', '👑'],
];
const TX_LABEL = {
  deposit: 'Depósito', withdrawal: 'Levantamento', withdrawal_refund: 'Levantamento devolvido',
  casino_out: 'Para o casino', casino_in: 'Do casino',
  bet: 'Aposta', payout: 'Prémio', refund: 'Reembolso',
};
const STATUS_LABEL = {
  open: 'Em aberto', won: 'Ganha', lost: 'Perdida', void: 'Anulada', pending: 'Pendente', approved: 'Aprovado',
  rejected: 'Rejeitado', scheduled: 'Agendado', live: 'Ao vivo', finished: 'Terminado', cancelled: 'Cancelado',
};

const state = {
  user: null,
  config: null,
  events: [],
  eventsLoaded: false,
  casino: { enabled: false, games: [], providers: [], loaded: false },
  casinoFilter: { provider: '', category: '', q: '' },
  casinoSession: null,
  match: { id: null, data: null, extras: null, insights: null, tab: 'mercados', es: null, timer: null, ball: null, trail: [], actions: [], live: null, streaming: false },
  slip: loadSlip(),
  mode: 'single',
  sport: '',
  adminTab: 'eventos',
  previousOdds: new Map(),
};

// ---------- utilities ----------

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const fmtOdds = (n) => Number(n).toFixed(2);
const initials = (name) => String(name || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function fmtWhen(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return `Hoje ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Amanhã ${time}`;
  return `${d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} ${time}`;
}
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loadSlip() {
  try {
    const v = JSON.parse(localStorage.getItem('classicbet_slip') || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function saveSlip() {
  try { localStorage.setItem('classicbet_slip', JSON.stringify(state.slip)); } catch { /* storage unavailable */ }
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || 'Ocorreu um erro. Tente novamente.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toast(title, msg = '', type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' error' : ''}`;
  el.innerHTML = `<strong>${esc(title)}</strong>${msg ? `<span>${esc(msg)}</span>` : ''}`;
  $('#toastWrap').append(el);
  setTimeout(() => el.remove(), 4200);
}

// ---------- modal ----------

function openModal(title, bodyHtml, { wide = false } = {}) {
  const modal = $('#modal');
  modal.className = `modal${wide ? ' wide' : ''}`;
  modal.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></div><div class="modal-body">${bodyHtml}</div>`;
  $('#modalBackdrop').classList.remove('hidden');
  setTimeout(() => $('input', modal)?.focus(), 30);
}
function closeModal() {
  $('#modalBackdrop').classList.add('hidden');
  $('#modal').innerHTML = '';
}

function openAuth(mode) {
  if (mode === 'register') {
    const max = new Date();
    max.setFullYear(max.getFullYear() - 18);
    openModal('Criar conta', `
      <form data-form="register" novalidate>
        <div class="form-error hidden"></div>
        <div class="field"><label>Nome completo</label><input name="name" required autocomplete="name" placeholder="Nome e apelido"></div>
        <div class="form-grid">
          <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="nome@email.com"></div>
          <div class="field"><label>Data de nascimento</label><input name="birthdate" type="date" required max="${max.toISOString().slice(0, 10)}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Telefone (opcional)</label><input name="phone" autocomplete="tel" placeholder="+351 900 000 000"></div>
          <div class="field"><label>Palavra-passe</label><input name="password" type="password" minlength="8" required autocomplete="new-password" placeholder="mín. 8 caracteres"></div>
        </div>
        <label class="check"><input name="acceptTerms" type="checkbox" required> <span>Tenho 18 anos ou mais e aceito os termos e condições e a política de privacidade.</span></label>
        <button class="primary-btn btn-block">CRIAR CONTA</button>
      </form>
      <div class="modal-switch">Já tem conta? <button data-action="login">Entrar</button></div>`);
  } else {
    openModal('Entrar', `
      <form data-form="login" novalidate>
        <div class="form-error hidden"></div>
        <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="nome@email.com"></div>
        <div class="field"><label>Palavra-passe</label><input name="password" type="password" required autocomplete="current-password" placeholder="••••••••"></div>
        <button class="primary-btn btn-block">ENTRAR</button>
      </form>
      <div class="modal-switch">Ainda não tem conta? <button data-action="register">Registar</button></div>`);
  }
}

function openSearch() {
  openModal('Pesquisar', `<input class="search-input" id="searchInput" placeholder="Equipa ou competição…" autocomplete="off"><div id="searchResults"></div>`, { wide: true });
  renderSearch('');
}
function renderSearch(q) {
  const box = $('#searchResults');
  if (!box) return;
  const term = q.trim().toLowerCase();
  const found = state.events.filter((e) => !term || `${e.home} ${e.away} ${e.competition}`.toLowerCase().includes(term)).slice(0, 12);
  box.innerHTML = found.length
    ? `<div class="comp-block">${found.map(eventRow).join('')}</div>`
    : '<div class="empty">Nenhum evento encontrado.</div>';
}

// ---------- event markup ----------

const isOpen = (e) => e.status === 'live' || (e.status === 'scheduled' && new Date(e.startTime) > new Date());
const inSlip = (selId) => state.slip.some((s) => s.selectionId === selId);

function oddsButtons(e, { labels = 'code' } = {}) {
  const sels = e.selections;
  if (!sels.length) return '<div class="odds-off">Apostas indisponíveis neste jogo</div>';
  return `<div class="odds${sels.length === 2 ? ' two' : ''}">${sels.map((s) => {
    const prev = state.previousOdds.get(s.id);
    const move = prev && prev !== s.odds ? (s.odds > prev ? ' up' : ' down') : '';
    const locked = !s.active || !isOpen(e);
    const label = labels === 'name' ? (s.code === '1' ? e.home : s.code === '2' ? e.away : 'Empate') : s.code;
    return `<button class="odd-btn${inSlip(s.id) ? ' selected' : ''}${move}${locked ? ' locked' : ''}" data-sel="${s.id}" ${locked ? 'disabled' : ''}>
      <small>${esc(label)}</small>${locked ? '🔒' : fmtOdds(s.odds)}</button>`;
  }).join('')}</div>`;
}

/** Club badge from the data provider, falling back to initials (see the image error listener). */
function teamBadge(logo, name, size = '') {
  const cls = `team-icon${size ? ` ${size}` : ''}`;
  if (!logo) return `<div class="${cls}">${esc(size === 'mini' ? initials(name).slice(0, 1) : initials(name))}</div>`;
  return `<div class="${cls} has-logo" data-initials="${esc(initials(name))}"><img class="team-logo" src="${esc(logo)}" alt="" loading="lazy"></div>`;
}

const flagEmoji = (cc) => String(cc || '').toUpperCase().replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));

/** Club badge, or the player's flag in tennis. */
function sideBadge(e, side, size = '') {
  const country = e[`${side}Country`];
  if (!e[`${side}Logo`] && country) return `<div class="team-icon flag${size ? ` ${size}` : ''}" title="${esc(country)}">${flagEmoji(country)}</div>`;
  return teamBadge(e[`${side}Logo`], e[side], size);
}

function matchCard(e) {
  return `<article class="match-card clickable" data-open="${e.id}">
    <div class="match-top"><span>${esc(e.competition)}</span><span>${e.status === 'live' ? `<span class="live-label">● AO VIVO ${esc(e.clock || '')}</span>` : esc(fmtWhen(e.startTime))}</span></div>
    <div class="teams">
      <div class="team">${sideBadge(e, 'home')}${esc(e.home)}</div>
      <div class="vs">${e.status === 'live' ? `<b>${e.homeScore ?? 0}-${e.awayScore ?? 0}</b>` : 'VS'}</div>
      <div class="team">${sideBadge(e, 'away')}${esc(e.away)}</div>
    </div>
    ${oddsButtons(e)}
  </article>`;
}

function liveCard(e) {
  return `<article class="live-card clickable" data-open="${e.id}">
    <div class="match-top"><span class="live-label">● AO VIVO</span><span>${esc(e.competition)} · ${esc(e.clock || '')}</span></div>
    <div class="live-teams"><div><span>${sideBadge(e, 'home', 'mini')}${esc(e.home)}</span><b>${e.homeScore ?? 0}</b></div><div><span>${sideBadge(e, 'away', 'mini')}${esc(e.away)}</span><b>${e.awayScore ?? 0}</b></div></div>
    ${oddsButtons(e, { labels: 'name' })}
  </article>`;
}

function eventRow(e) {
  const when = e.status === 'live'
    ? `<span class="live-label">● AO VIVO</span><br>${esc(e.clock || '')}`
    : esc(fmtWhen(e.startTime)).replace(' ', '<br>');
  const score = (side) => (e.status === 'live' ? `<b>${side === 'h' ? e.homeScore ?? 0 : e.awayScore ?? 0}</b>` : '');
  return `<div class="event-row clickable" data-open="${e.id}">
    <div class="event-time">${when}</div>
    <div class="event-teams">
      <div><span>${sideBadge(e, 'home', 'mini')}${esc(e.home)}</span>${score('h')}</div>
      <div><span>${sideBadge(e, 'away', 'mini')}${esc(e.away)}</span>${score('a')}</div>
    </div>
    ${oddsButtons(e)}
  </div>`;
}

function groupByCompetition(events) {
  const groups = new Map();
  for (const e of events) {
    const key = `${e.sport}|${e.competition}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.entries()].map(([key, list]) => {
    const [sport, comp] = key.split('|');
    const logo = list.find((e) => e.leagueLogo)?.leagueLogo;
    const icon = logo
      ? `<span class="league-logo" data-icon="${SPORT_META[sport]?.icon || '🏆'}"><img class="league-img" src="${esc(logo)}" alt="" loading="lazy"></span>`
      : `<span class="league-logo">${SPORT_META[sport]?.icon || '🏆'}</span>`;
    return `<div class="comp-block"><div class="comp-head"><span class="comp-name">${icon}${esc(comp)}</span><span>${list.length}</span></div>${list.map(eventRow).join('')}</div>`;
  }).join('');
}

function footer() {
  return `<footer class="site-footer">
    <div><strong>CLASSICBET</strong><p>Apostas desportivas, ao vivo e casino num único lugar.</p><p>Pagamentos: MB WAY · Multibanco · Cartão</p></div>
    <div><strong>Apostas</strong><a href="#/desporto">Desporto</a><a href="#/ao-vivo">Ao Vivo</a><a href="#/desporto/resultados">Resultados</a><a href="#/casino">Casino</a></div>
    <div><strong>A minha conta</strong><a href="#/perfil/carteira">Carteira</a><a href="#/perfil/apostas">As minhas apostas</a><a href="#/perfil">Dados pessoais</a></div>
    <div><strong>Informações</strong><a href="#/perfil/jogo-responsavel">Jogo responsável</a><a href="#/promocoes">Promoções</a></div>
    <div class="copyright"><span>© ${new Date().getFullYear()} ClassicBet</span><span><span class="age">18+</span>Proibido a menores de 18 anos. Jogue com responsabilidade.</span></div>
  </footer>`;
}

// ---------- pages ----------

function homePage() {
  const live = state.events.filter((e) => e.status === 'live');
  const upcoming = state.events.filter((e) => e.status === 'scheduled');
  const featured = [...upcoming.filter((e) => e.featured), ...upcoming.filter((e) => !e.featured)].slice(0, 6);
  const hero = state.user
    ? `<div class="eyebrow">BEM-VINDO DE VOLTA</div><h1>Olá, ${esc(state.user.name.split(' ')[0])}.</h1><p>O seu saldo é <strong>${money(state.user.balance)}</strong>. Escolha um jogo e faça a sua aposta.</p>
       <div class="hero-actions"><a class="primary-btn" href="#/desporto">Explorar desporto</a><a class="outline-btn" href="#/perfil/carteira">Carteira</a></div>`
    : `<div class="eyebrow">A NOVA EXPERIÊNCIA DE APOSTAS</div><h1>Mais mercados.<br>Mais emoção.</h1><p>Uma plataforma clássica, rápida e simples para acompanhar desporto, apostas ao vivo e casino num único lugar.</p>
       <div class="hero-actions"><button class="primary-btn" data-action="register">Criar conta</button><a class="outline-btn" href="#/desporto">Explorar desporto</a></div>`;
  return `<section class="hero"><div class="hero-copy">${hero}</div></section>
    ${live.length ? `<section class="section"><div class="section-head"><h2>Ao Vivo agora</h2><a href="#/ao-vivo">Ver todos ›</a></div><div class="live-grid grid">${live.slice(0, 4).map(liveCard).join('')}</div></section>` : ''}
    <section class="section"><div class="section-head"><h2>Eventos em destaque</h2><a href="#/desporto">Todos os eventos ›</a></div>
      ${featured.length ? `<div class="match-grid grid">${featured.map(matchCard).join('')}</div>` : emptyEvents()}</section>
    <section class="section"><div class="section-head"><h2>Casino</h2><a href="#/casino">Ver casino ›</a></div><div class="game-grid grid">${state.casino.enabled && state.casino.games.length ? state.casino.games.slice(0, 5).map(casinoGameCard).join('') : GAMES.slice(0, 5).map(gameCard).join('')}</div></section>
    ${footer()}`;
}

const emptyEvents = () => `<div class="panel empty">${state.eventsLoaded ? 'Sem eventos disponíveis de momento.' : 'A carregar eventos…'}</div>`;

function sportsPage(sub) {
  if (sub === 'resultados') return resultsPage();
  const sports = [...new Set(state.events.map((e) => e.sport))];
  const list = state.events.filter((e) => !state.sport || e.sport === state.sport);
  return `<div class="page-title"><h1>Desporto</h1><p>Todos os eventos pré-jogo e ao vivo com odds disponíveis.</p></div>
    <div class="sport-strip">
      <button class="sport-pill${!state.sport ? ' active' : ''}" data-sport="">Todos</button>
      ${sports.map((s) => `<button class="sport-pill${state.sport === s ? ' active' : ''}" data-sport="${esc(s)}">${SPORT_META[s]?.icon || ''} ${esc(SPORT_META[s]?.name || s)}</button>`).join('')}
      <a class="sport-pill" href="#/desporto/resultados">🏁 Resultados</a>
    </div>
    <section class="section">${list.length ? groupByCompetition(list) : emptyEvents()}</section>
    ${footer()}`;
}

function resultsPage() {
  setTimeout(async () => {
    try {
      const { events } = await api('/api/results');
      const box = $('#resultsBox');
      if (!box) return;
      box.innerHTML = events.length
        ? `<div class="comp-block">${events.map((e) => `<div class="event-row">
            <div class="event-time">${esc(fmtWhen(e.startTime)).replace(' ', '<br>')}</div>
            <div class="event-teams"><div><span>${esc(e.home)}</span><b>${e.homeScore}</b></div><div><span>${esc(e.away)}</span><b>${e.awayScore}</b></div></div>
            <div><span class="result-pill">${esc(e.competition)}</span></div></div>`).join('')}</div>`
        : '<div class="panel empty">Ainda não há resultados.</div>';
    } catch (err) { toast('Erro', err.message, 'error'); }
  });
  return `<div class="page-title"><h1>Resultados</h1><p>Jogos terminados recentemente.</p></div>
    <div class="sport-strip"><a class="sport-pill" href="#/desporto">‹ Voltar ao desporto</a></div>
    <section class="section" id="resultsBox"><div class="loading">A carregar…</div></section>${footer()}`;
}

function livePage() {
  const live = state.events.filter((e) => e.status === 'live');
  return `<div class="page-title"><h1><span class="live-dot"></span>Ao Vivo</h1><p>Eventos a decorrer agora. As odds atualizam automaticamente.</p></div>
    ${live.length ? `<div class="live-grid grid">${live.map(liveCard).join('')}</div>` : `<div class="panel empty">${state.eventsLoaded ? 'Não há eventos ao vivo neste momento.' : 'A carregar…'}</div>`}
    ${footer()}`;
}

const gameCard = (g) => `<button class="game-card" data-action="game"><div class="game-art">${g[2]}</div><div class="game-info"><strong>${esc(g[0])}</strong><small>${esc(g[1])}</small></div></button>`;

function casinoGameCard(g, i) {
  return `<button class="game-card" data-game="${i}">
    <div class="game-art">${g.image ? `<img class="game-img" src="${esc(g.image)}" alt="" loading="lazy">` : '🎰'}</div>
    <div class="game-info"><strong>${esc(g.name)}</strong><small>${esc(g.provider)} · ${esc(g.category)}</small></div></button>`;
}

const CASINO_PAGE = 24;

function casinoPage() {
  const c = state.casino;
  if (!c.enabled) {
    return `<div class="page-title"><h1>Casino</h1><p>Jogos, mesas e entretenimento num só espaço.</p></div>
      <div class="notice"><strong>${c.loaded ? 'Casino em integração.' : 'A carregar…'}</strong> ${c.loaded ? 'Os jogos ficam disponíveis assim que o fornecedor de casino for ligado à plataforma.' : ''}</div>
      <section class="section"><div class="section-head"><h2>Catálogo</h2><span>${GAMES.length} jogos</span></div><div class="game-grid grid">${GAMES.map(gameCard).join('')}</div></section>
      ${footer()}`;
  }
  const f = state.casinoFilter;
  const filtered = f.provider || f.category || f.q;
  if (!c.games.length && !filtered && !c.loading) {
    return `<div class="page-title"><h1>Casino</h1></div>
      <div class="notice"><strong>Casino sem jogos de momento.</strong> ${esc(c.error || '')}
      ${state.user?.role === 'admin' ? '<br><br><a class="mini-btn" href="#/admin">Diagnosticar em Administração → Casino</a>' : ''}</div>
      ${footer()}`;
  }
  const more = c.games.length < c.total;
  return `<div class="page-title"><h1>Casino</h1><p>${c.total} jogos de ${c.providers.filter((p) => !p.maintenance).length} fornecedores.</p></div>
    <div class="casino-filters">
      <div class="casino-tabs">
        ${[['', 'Todos'], ['Slots', 'Slots'], ['Ao Vivo', 'Ao Vivo']].map(([k, l]) => `<button class="casino-tab${f.category === k ? ' active' : ''}" data-casino-cat="${k}">${l}</button>`).join('')}
      </div>
      <input class="search-input casino-search" id="casinoSearch" placeholder="Procurar jogo ou fornecedor…" value="${esc(f.q || '')}" autocomplete="off">
    </div>
    <div class="sport-strip">
      <button class="sport-pill${!f.provider ? ' active' : ''}" data-casino-prov="">Todos os fornecedores</button>
      ${c.providers.map((p) => `<button class="sport-pill${f.provider === String(p.id) ? ' active' : ''}" data-casino-prov="${p.id}" ${p.maintenance ? 'disabled title="Em manutenção"' : ''}>${esc(p.name)}${p.maintenance ? ' (manutenção)' : ''}</button>`).join('')}
    </div>
    <section class="section">
      <div class="game-grid grid" id="casinoGrid">${c.games.length ? c.games.map(casinoGameCard).join('') : `<div class="empty">${c.loading ? 'A carregar…' : 'Sem jogos neste filtro.'}</div>`}</div>
      ${more ? `<div class="load-more"><button class="outline-btn" data-action="casino-more" ${c.loading ? 'disabled' : ''}>${c.loading ? 'A carregar…' : `Mostrar mais jogos (${c.games.length} de ${c.total})`}</button></div>` : ''}
    </section>
    ${footer()}`;
}

/** Loads the next block of games (or the first block after a filter change). */
async function loadCasino({ reset = false } = {}) {
  const c = state.casino;
  if (c.loading) return;
  const f = state.casinoFilter;
  const offset = reset ? 0 : c.games.length;
  c.loading = true;
  if (reset) c.games = [];
  if (currentRoute().page === 'casino' && currentRoute().sub !== 'jogar') render({ keepScroll: true });
  try {
    const qs = new URLSearchParams({ offset, limit: CASINO_PAGE, provider: f.provider || '', category: f.category || '', q: f.q || '' });
    const data = await api(`/api/casino/games?${qs}`);
    state.casino = { ...data, games: reset ? data.games : [...c.games, ...data.games], loaded: true, loading: false };
  } catch {
    state.casino = { enabled: false, games: [], providers: [], total: 0, loaded: true, loading: false };
  }
  const { page, sub } = currentRoute();
  if (page === 'home' || (page === 'casino' && sub !== 'jogar')) {
    const search = document.activeElement?.id === 'casinoSearch';
    render({ keepScroll: true });
    if (search) { const el = $('#casinoSearch'); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }
  }
}

/** Opens a game inside ClassicBet. The balance follows the player into the casino automatically. */
async function openGame(index) {
  const g = state.casino.games[index];
  if (!g) return;
  if (!state.user) return openAuth('login');
  state.casinoSession = { name: g.name, provider: g.provider, url: null };
  location.hash = '#/casino/jogar';
  try {
    const r = await api('/api/casino/launch', { method: 'POST', body: { providerId: g.providerId, gameCode: g.code } });
    if (!state.casinoSession) return; // the player already left
    state.casinoSession.url = r.url;
    state.user.balance = r.balance;
    state.user.casinoActive = true;
    updateHeader();
    if (currentRoute().sub === 'jogar') render({ keepScroll: true });
  } catch (err) {
    state.casinoSession = null;
    toast('Casino', err.message, 'error');
    location.hash = '#/casino';
  }
}

/** Leaving the game: the casino balance comes back to the wallet. */
async function closeCasino({ keepalive = false } = {}) {
  if (!state.user?.casinoActive) return;
  state.user.casinoActive = false;
  try {
    const res = await fetch('/api/casino/close', {
      method: 'POST', credentials: 'same-origin', keepalive, headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const r = await res.json();
    if (typeof r.balance === 'number' && state.user) {
      state.user.balance = r.balance;
      updateHeader();
    }
  } catch { state.user && (state.user.casinoActive = true); }
}

/** While a game is open, the header shows the live casino balance. */
async function refreshCasinoBalance() {
  try {
    const w = await api('/api/casino/wallet');
    if (state.user) {
      state.user.balance = w.balance;
      updateHeader();
    }
  } catch { /* next tick retries */ }
}

// ---------- casino player (the game runs inside the page) ----------

function casinoPlayPage() {
  const g = state.casinoSession;
  if (!g) {
    setTimeout(() => { location.hash = '#/casino'; });
    return '<div class="loading">A voltar ao casino…</div>';
  }
  if (!g.url) return `<div class="casino-player"><div class="casino-loading"><div class="spinner"></div><strong>${esc(g.name)}</strong><span class="muted">A abrir o jogo…</span></div></div>`;
  return `<div class="casino-player">
    <iframe id="casinoFrame" class="casino-frame" src="${esc(g.url)}" title="${esc(g.name)}"
      allow="fullscreen; autoplay; clipboard-write; encrypted-media" allowfullscreen referrerpolicy="origin"></iframe>
  </div>`;
}

function promosPage() {
  const cards = [
    ['BOAS-VINDAS', 'Bónus de boas-vindas', 'Oferta para novos clientes no primeiro depósito.'],
    ['DESPORTO', 'Odds especiais', 'Seleções promocionais em eventos selecionados.'],
    ['CASINO', 'Free Spins', 'Giros promocionais em jogos elegíveis.'],
  ];
  return `<div class="page-title"><h1>Promoções</h1><p>Ofertas e campanhas da ClassicBet.</p></div>
    <div class="promo-grid grid">${cards.map(([eyebrow, title, text]) => `<div class="promo-card"><div class="eyebrow">${eyebrow}</div><h3>${title}</h3><p>${text}</p><span class="tag">EM BREVE</span></div>`).join('')}</div>
    <section class="section notice">Cada campanha terá condições próprias (elegibilidade, período, limites e requisitos de aposta), publicadas antes de ficar ativa.</section>
    ${footer()}`;
}

// ---------- account ----------

function accountPage(sub) {
  if (!state.user) {
    return `<div class="panel empty"><p>Inicie sessão para ver a sua conta.</p><div class="hero-actions"><button class="primary-btn" data-action="login">Entrar</button><button class="outline-btn" data-action="register">Criar conta</button></div></div>${footer()}`;
  }
  const tabs = [['', 'Visão geral'], ['carteira', 'Carteira'], ['apostas', 'As minhas apostas'], ['jogo-responsavel', 'Jogo responsável']];
  const nav = `<div class="profile-nav">${tabs.map(([k, l]) => `<a href="#/perfil${k ? `/${k}` : ''}" class="${(sub || '') === k ? 'active' : ''}">${l}</a>`).join('')}
    ${state.user.role === 'admin' ? '<a href="#/admin">Administração</a>' : ''}<button data-action="logout">Terminar sessão</button></div>`;
  let main = '';
  if (sub === 'carteira') main = walletView();
  else if (sub === 'apostas') main = betsView();
  else if (sub === 'jogo-responsavel') main = responsibleView();
  else main = overviewView();
  return `<div class="page-title"><h1>A minha conta</h1><p>Gerir dados, saldo e atividade.</p></div><div class="profile-grid">${nav}<div class="profile-main" id="accountMain">${main}</div></div>${footer()}`;
}

function overviewView() {
  const u = state.user;
  const excluded = u.excludedUntil && new Date(u.excludedUntil) > new Date();
  return `<div class="user-head"><div class="big-avatar">${esc(initials(u.name))}</div><div><h2>${esc(u.name)}</h2><span class="muted">${esc(u.email)}</span></div></div>
    <div class="stat-grid"><div class="stat"><small>Saldo disponível</small><strong>${money(u.balance)}</strong></div>
      <div class="stat"><small>Membro desde</small><strong>${esc(new Date(u.createdAt).toLocaleDateString('pt-PT'))}</strong></div>
      <div class="stat"><small>Estado</small><strong class="${excluded ? 'red' : 'green'}">${excluded ? 'Autoexcluída' : 'Ativa'}</strong></div></div>
    <h3>Dados pessoais</h3>
    <form data-form="profile"><div class="form-grid">
      <div class="field"><label>Nome</label><input name="name" value="${esc(u.name)}" required></div>
      <div class="field"><label>Telefone</label><input name="phone" value="${esc(u.phone || '')}" placeholder="+351 900 000 000"></div>
      <div class="field"><label>Email</label><input value="${esc(u.email)}" readonly></div>
      <div class="field"><label>Data de nascimento</label><input value="${esc(u.birthdate)}" readonly></div>
    </div><div class="form-actions"><button class="primary-btn">Guardar alterações</button></div></form>
    <h3>Alterar palavra-passe</h3>
    <form data-form="password"><div class="form-grid">
      <div class="field"><label>Palavra-passe atual</label><input name="currentPassword" type="password" required autocomplete="current-password"></div>
      <div class="field"><label>Nova palavra-passe</label><input name="newPassword" type="password" minlength="8" required autocomplete="new-password"></div>
    </div><div class="form-actions"><button class="outline-btn">Alterar palavra-passe</button></div></form>`;
}

function walletView() {
  setTimeout(loadWallet);
  const demo = state.config?.paymentsMode === 'demo';
  const c = state.config || {};
  return `<div class="stat-grid"><div class="stat"><small>Saldo disponível</small><strong id="walletBalance">${money(state.user.balance)}</strong></div></div>
    <h3>Depositar</h3>
    ${demo ? '<div class="notice"><strong>Modo demonstração:</strong> nenhum pagamento real é processado; o valor é creditado de imediato. Ligue um fornecedor de pagamentos para operar com dinheiro real.</div><br>' : ''}
    ${c.paymentsMode === 'disabled' ? '<div class="notice">Os depósitos ficam disponíveis assim que um fornecedor de pagamentos for configurado.</div>' : `
    <form data-form="deposit">
      <div class="methods">
        <label class="method"><input type="radio" name="method" value="mbway" checked>MB WAY</label>
        <label class="method"><input type="radio" name="method" value="multibanco">Multibanco</label>
        <label class="method"><input type="radio" name="method" value="cartao">Cartão</label>
      </div>
      <div class="form-grid"><div class="field"><label>Valor (€${c.minDeposit ?? 5} – €${c.maxDeposit ?? 5000})</label><input name="amount" type="number" min="${c.minDeposit ?? 5}" max="${c.maxDeposit ?? 5000}" step="0.01" value="20" required inputmode="decimal"></div></div>
      <div class="form-actions"><button class="primary-btn">Depositar</button></div>
    </form>`}
    <h3>Levantar</h3>
    <form data-form="withdraw"><div class="form-grid">
      <div class="field"><label>Valor (mín. €${c.minWithdraw ?? 10})</label><input name="amount" type="number" min="${c.minWithdraw ?? 10}" step="0.01" required inputmode="decimal"></div>
      <div class="field"><label>IBAN</label><input name="iban" required placeholder="PT50 0000 0000 0000 0000 0000 0"></div>
    </div><div class="form-actions"><button class="outline-btn">Pedir levantamento</button></div></form>
    <div id="walletLists"><div class="loading">A carregar movimentos…</div></div>`;
}

async function loadWallet() {
  try {
    const w = await api('/api/wallet');
    state.user.balance = w.balance;
    updateHeader();
    const box = $('#walletLists');
    if (!box) return;
    if ($('#walletBalance')) $('#walletBalance').textContent = money(w.balance);
    box.innerHTML = `
      ${w.withdrawals.length ? `<h3>Levantamentos</h3><div class="table-wrap"><table><thead><tr><th>Data</th><th>IBAN</th><th>Estado</th><th class="num">Valor</th></tr></thead><tbody>
        ${w.withdrawals.map((x) => `<tr><td>${esc(fmtDateTime(x.createdAt))}</td><td>${esc(x.iban)}</td><td><span class="pill ${x.status}">${STATUS_LABEL[x.status]}</span></td><td class="num">${money(x.amount)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <h3>Movimentos</h3>
      ${w.transactions.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead><tbody>
        ${w.transactions.map((t) => `<tr><td>${esc(fmtDateTime(t.createdAt))}</td><td>${esc(TX_LABEL[t.type] || t.type)}<br><small class="muted">${esc(t.description)}</small></td>
          <td class="num ${t.amount >= 0 ? 'green' : ''}">${t.amount >= 0 ? '+' : ''}${money(t.amount)}</td><td class="num">${money(t.balanceAfter)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Ainda não há movimentos.</div>'}`;
  } catch (err) { toast('Erro', err.message, 'error'); }
}

function betsView() {
  setTimeout(loadBets);
  return '<div id="betsList"><div class="loading">A carregar apostas…</div></div>';
}

function betCard(b, { showUser = false } = {}) {
  return `<div class="bet-card">
    <div class="bet-card-head"><span>#${b.id} · ${b.type === 'multiple' ? `Múltipla (${b.legs.length})` : 'Simples'} · ${esc(fmtDateTime(b.createdAt))}${showUser ? ` · ${esc(b.email)}` : ''}</span><span class="pill ${b.status}">${STATUS_LABEL[b.status]}</span></div>
    ${b.legs.map((l) => `<div class="bet-leg"><div>${esc(l.match)}<small>${esc(l.competition)} · ${esc(l.marketName && l.market !== '1x2' ? `${l.marketName}: ` : '')}${esc(l.label || CODE_LABEL[l.code])}${l.score ? ` · ${esc(l.score)}` : ''}</small></div><div class="num"><b class="gold">${fmtOdds(l.odds)}</b><br><span class="pill ${l.status}">${STATUS_LABEL[l.status]}</span></div></div>`).join('')}
    <div class="bet-card-foot"><span>Aposta <strong>${money(b.stake)}</strong></span><span>Cotação <strong>${fmtOdds(b.totalOdds)}</strong></span>
      <span>${b.status === 'open' ? 'Retorno potencial' : 'Pago'} <strong class="${b.status === 'won' ? 'green' : ''}">${money(b.status === 'open' ? b.potential : b.payout)}</strong></span></div>
  </div>`;
}

async function loadBets() {
  try {
    const { bets } = await api('/api/bets');
    const box = $('#betsList');
    if (box) box.innerHTML = bets.length ? bets.map((b) => betCard(b)).join('') : '<div class="empty">Ainda não fez nenhuma aposta.</div>';
  } catch (err) { toast('Erro', err.message, 'error'); }
}

function responsibleView() {
  const u = state.user;
  const excluded = u.excludedUntil && new Date(u.excludedUntil) > new Date();
  return `<h3>Jogo responsável</h3>
    <p class="muted">Apostar deve ser uma forma de entretenimento. Defina limites, faça pausas e nunca aposte dinheiro de que precise. Se sentir que perdeu o controlo, procure apoio especializado.</p>
    <h3>Autoexclusão</h3>
    ${excluded ? `<div class="notice"><strong>Autoexclusão ativa</strong> até ${esc(fmtDateTime(u.excludedUntil))}. Durante este período não é possível apostar nem depositar.</div>` : ''}
    <form data-form="exclusion"><div class="form-grid"><div class="field"><label>Período</label><select name="days">
      <option value="1">24 horas</option><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">3 meses</option><option value="180">6 meses</option><option value="365">1 ano</option>
    </select></div></div><div class="form-actions"><button class="danger-btn">Ativar autoexclusão</button></div></form>
    <p class="muted">A autoexclusão não pode ser cancelada antes de terminar. Os levantamentos continuam disponíveis.</p>`;
}

// ---------- admin ----------

function adminPage() {
  if (!state.user) return accountPage();
  if (state.user.role !== 'admin') return '<div class="panel empty">Acesso reservado a administradores.</div>';
  const tabs = [['eventos', 'Eventos'], ['liquidacao', 'Liquidação'], ['novo', 'Novo evento'], ['feed', 'Dados ao vivo'], ['casino', 'Casino'], ['levantamentos', 'Levantamentos'], ['apostas', 'Apostas'], ['utilizadores', 'Utilizadores']];
  setTimeout(loadAdmin);
  return `<div class="page-title"><h1>Administração</h1><p>Gestão de eventos, odds, resultados e pagamentos.</p></div>
    <div class="stat-grid four" id="adminStats"></div>
    <div class="admin-tabs">${tabs.map(([k, l]) => `<button class="${state.adminTab === k ? 'primary-btn' : 'ghost-btn'} btn-sm" data-admin-tab="${k}">${l}</button>`).join('')}</div>
    <div id="adminMain"><div class="loading">A carregar…</div></div>`;
}

async function loadAdmin() {
  try {
    const s = await api('/api/admin/stats');
    const stats = $('#adminStats');
    if (stats) {
      stats.innerHTML = [
        ['Jogadores', s.users], ['Apostas em aberto', `${s.openBets} · ${money(s.openStake)}`],
        ['Receita bruta (liquidadas)', money(s.grossRevenue)], ['Levantamentos pendentes', `${s.pendingWithdrawals} · ${money(s.pendingWithdrawalAmount)}`],
      ].map(([l, v]) => `<div class="stat"><small>${l}</small><strong>${esc(v)}</strong></div>`).join('');
    }
    const main = $('#adminMain');
    if (!main) return;
    const tab = state.adminTab;
    if (tab === 'novo') main.innerHTML = adminNewEvent();
    else if (tab === 'feed') main.innerHTML = adminFeed(await api('/api/admin/feed'));
    else if (tab === 'casino') main.innerHTML = adminCasino(await api('/api/admin/casino'));
    else if (tab === 'liquidacao') main.innerHTML = adminSettlement(await api('/api/admin/settlement'));
    else if (tab === 'levantamentos') {
      const { withdrawals } = await api('/api/admin/withdrawals');
      main.innerHTML = withdrawals.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Jogador</th><th>IBAN</th><th class="num">Valor</th><th>Estado</th><th></th></tr></thead><tbody>
        ${withdrawals.map((w) => `<tr><td>${esc(fmtDateTime(w.createdAt))}</td><td>${esc(w.user)}<br><small class="muted">${esc(w.email)}</small></td><td>${esc(w.iban)}</td><td class="num">${money(w.amount)}</td>
          <td><span class="pill ${w.status}">${STATUS_LABEL[w.status]}</span></td>
          <td>${w.status === 'pending' ? `<div class="form-actions"><button class="primary-btn btn-sm" data-action="wd-approve" data-id="${w.id}">Aprovar</button><button class="danger-btn btn-sm" data-action="wd-reject" data-id="${w.id}">Rejeitar</button></div>` : esc(fmtDateTime(w.decidedAt))}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="panel empty">Sem pedidos de levantamento.</div>';
    } else if (tab === 'apostas') {
      const { bets } = await api('/api/admin/bets');
      main.innerHTML = bets.length ? bets.map((b) => betCard(b, { showUser: true })).join('') : '<div class="panel empty">Sem apostas.</div>';
    } else if (tab === 'utilizadores') {
      const { users } = await api('/api/admin/users');
      main.innerHTML = `<div class="table-wrap"><table><thead><tr><th>#</th><th>Nome</th><th>Email</th><th>Perfil</th><th class="num">Apostas</th><th class="num">Saldo</th><th>Registo</th></tr></thead><tbody>
        ${users.map((u) => `<tr><td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Admin' : 'Jogador'}</td><td class="num">${u.bets}</td><td class="num">${money(u.balance)}</td><td>${esc(fmtDateTime(u.createdAt))}</td></tr>`).join('')}
      </tbody></table></div>`;
    } else {
      const { events } = await api('/api/admin/events');
      main.innerHTML = events.length ? events.map(adminEventCard).join('') : '<div class="panel empty">Sem eventos. Crie um em "Novo evento".</div>';
    }
  } catch (err) { toast('Erro', err.message, 'error'); }
}

function adminEventCard(e) {
  const odd = (code) => e.selections.find((s) => s.code === code);
  const closed = e.status === 'finished' || e.status === 'cancelled';
  const suspended = e.selections.length && e.selections.every((s) => !s.active);
  const oddInput = (code) => `<div class="field"><span>Odd ${code}</span><input name="odd${code}" value="${odd(code)?.active ? fmtOdds(odd(code).odds) : ''}" inputmode="decimal" ${closed ? 'disabled' : ''} placeholder="—"></div>`;
  return `<form class="admin-event" data-form="admin-event" data-id="${e.id}" data-featured="${e.featured ? 1 : 0}">
    <div class="admin-event-head"><div><strong>${esc(e.home)} vs ${esc(e.away)}</strong><div class="muted">${esc(SPORT_META[e.sport]?.name || e.sport)} · ${esc(e.competition)} · ${esc(fmtDateTime(e.startTime))}</div></div>
      <div><span class="pill ${e.status}">${STATUS_LABEL[e.status]}</span>${suspended && !closed ? ' <span class="pill lost">Suspenso</span>' : ''}${e.featured ? ' <span class="pill void">Destaque</span>' : ''}${e.source && e.source !== 'manual' ? ' <span class="pill">Importado</span>' : ''}</div></div>
    <div class="admin-grid">
      <div class="field"><span>Casa</span><input name="homeScore" type="number" min="0" value="${e.homeScore ?? ''}" ${closed ? 'disabled' : ''}></div>
      <div class="field"><span>Fora</span><input name="awayScore" type="number" min="0" value="${e.awayScore ?? ''}" ${closed ? 'disabled' : ''}></div>
      <div class="field"><span>Tempo</span><input name="clock" value="${esc(e.clock || '')}" placeholder="67'" ${closed ? 'disabled' : ''}></div>
      ${oddInput('1')}${oddInput('X')}${oddInput('2')}
    </div>
    ${closed ? '' : `<div class="admin-actions">
      <button class="primary-btn btn-sm" data-op="save">Guardar</button>
      ${e.status === 'scheduled' ? '<button class="ghost-btn btn-sm" data-op="live">Iniciar ao vivo</button>' : ''}
      <button class="ghost-btn btn-sm" data-op="${suspended ? 'resume' : 'suspend'}">${suspended ? 'Reabrir mercado' : 'Suspender mercado'}</button>
      <button class="ghost-btn btn-sm" data-op="feature">${e.featured ? 'Remover destaque' : 'Destacar'}</button>
      <button class="primary-btn btn-sm" data-op="result">Resultado final e liquidar</button>
      <button class="danger-btn btn-sm" data-op="cancel">Cancelar evento</button>
    </div>`}
  </form>`;
}

function liveSocketPanel(ws) {
  if (!ws?.enabled) return '<p class="muted">Apostas ao vivo: desligadas (sem WebSocket).</p>';
  const badge = ws.fatal ? `<span class="pill lost">Parado — ${esc(ws.fatal)}</span>`
    : ws.connected ? '<span class="pill won">Ligado</span>' : '<span class="pill">A aguardar jogos ao vivo</span>';
  return `<h3>WebSocket ao vivo ${badge}</h3>
    <p class="muted">Odds em jogo e marcador em tempo real. O mercado fecha em cada golo e reabre com o preço seguinte; apostas com odds em jogo com mais de ${esc(state.config?.liveOddsMaxAge ?? 180)} s são recusadas.</p>
    <p>Jogos seguidos: <strong>${ws.following}</strong> · ligações: ${ws.connected}/${ws.sockets} · sem cobertura: ${ws.notCovered} · mensagens: ${ws.frames}${ws.lastFrameAt ? ` (última ${esc(fmtDateTime(ws.lastFrameAt))})` : ''}</p>
    ${ws.lastError && !ws.fatal ? `<p class="muted">Último aviso: ${esc(ws.lastError)}</p>` : ''}<br>`;
}

function adminCasino(c) {
  const test = '<br><button class="primary-btn" data-action="casino-test">Testar ligação</button><div id="casinoTest"></div>';
  if (!c.enabled) {
    return `<div class="panel"><div class="notice">O servidor não está a ver a configuração do casino:
      <strong>CASINO_API_URL</strong> ${c.urlSet ? '✔ definido' : '✘ em falta'} ·
      <strong>CASINO_API_TOKEN</strong> ${c.tokenSet ? '✔ definido' : '✘ em falta'}.<br>
      Defina-as no servidor (ou no ficheiro <code>.env</code> na pasta do projeto) e reinicie o servidor.</div>${test}</div>`;
  }
  return `<div class="panel">
    <div class="section-head"><h2>Casino — agente ${esc(c.agent?.name || '')}</h2><span class="pill ${c.error ? 'lost' : 'won'}">${c.error ? 'Erro' : 'Ligado'}</span></div>
    ${c.error ? `<div class="form-error">${esc(c.error)}</div>` : ''}
    <div class="stat-grid"><div class="stat"><small>Pontos do agente</small><strong>${c.agent ? esc(Number(c.agent.balance).toLocaleString('pt-PT')) : '—'}</strong></div>
      <div class="stat"><small>Enviado para o casino</small><strong>${money(c.sentToCasino)}</strong></div>
      <div class="stat"><small>Devolvido do casino</small><strong>${money(c.returnedFromCasino)}</strong></div></div>
    ${test}
    <p class="muted">Cada depósito de um jogador no casino consome pontos do agente. Mantenha pontos suficientes, ou os jogadores não conseguem entrar nos jogos. Os jogos correm sempre com o RTP por omissão do fornecedor.</p>
  </div>`;
}

function addonPanel(title, t, what) {
  if (!t?.enabled) return `<p class="muted">${esc(title)}: desligado.</p>`;
  const counts = Object.entries(t.events || {}).map(([k, v]) => `${STATUS_LABEL[k] || k}: ${v}`).join(' · ') || '—';
  const f = t.last?.fixtures;
  const last = f ? `última importação ${esc(fmtDateTime(f.at))} (${f.matches ?? f.games ?? 0} jogos, ${f.priced ?? 0} com odds)` : 'ainda não executado';
  const badge = t.addonMissing ? '<span class="pill lost">Sem Sports Addon</span>' : t.lastError ? '<span class="pill lost">Erro</span>' : '<span class="pill won">Ligado</span>';
  const ws = t.liveSocket?.enabled
    ? ` · ao vivo por WebSocket: ${t.liveSocket.fatal ? `parado (${esc(t.liveSocket.fatal)})` : `${t.liveSocket.following} encontro(s) seguidos`}` : '';
  return `<h3>${esc(title)} ${badge}</h3>
    <p class="muted">${esc(what)} ${last}${ws}.</p>
    <p>Eventos: <strong>${esc(counts)}</strong></p>
    ${t.addonMissing ? '<div class="form-error">O token não tem o Sports Addon, necessário para este desporto.</div>' : t.lastError ? `<div class="form-error">Último erro (${esc(fmtDateTime(t.lastErrorAt))}): ${esc(t.lastError)}</div>` : ''}`;
}

function sportsAddonPanels(f) {
  const panels = [addonPanel('Ténis ATP/WTA', f.tennis, 'Odds de vencedor (pré-jogo), sets ao vivo, H2H, previsões e ranking.')];
  const what = {
    basquetebol: 'Vencedor com prolongamento, estatísticas por equipa e box score, previsões e classificação.',
    hoquei: 'Resultado em tempo regulamentar (1X2) ou vencedor com prolongamento, H2H, previsões e classificação.',
    dardos: 'Vencedor do encontro, legs por set, H2H com médias, previsões e ranking PDC.',
    esports: 'Vencedor do encontro, mapas, comparação das equipas, H2H e previsões.',
  };
  for (const s of f.sports || []) panels.push(addonPanel(SPORT_META[s.sport]?.name || s.name, s, what[s.sport] || ''));
  return `<h3>Sports Addon</h3>${panels.map((p) => `<div class="addon-block">${p}</div>`).join('')}<br>`;
}

function adminFeed(f) {
  const last = (k, label) => {
    const r = f.last?.[k];
    if (!r) return `<tr><td>${label}</td><td colspan="2" class="muted">ainda não executado</td></tr>`;
    const info = Object.entries(r).filter(([key]) => key !== 'at').map(([key, v]) => `${key}: ${v}`).join(' · ');
    return `<tr><td>${label}</td><td>${esc(fmtDateTime(r.at))}</td><td>${esc(info)}</td></tr>`;
  };
  const counts = Object.entries(f.events || {}).map(([k, v]) => `${STATUS_LABEL[k] || k}: ${v}`).join(' · ') || '—';
  return `<div class="panel">
    <div class="section-head"><h2>Futebol — ${esc(f.provider)}</h2><span class="pill ${f.enabled ? 'won' : 'lost'}">${f.enabled ? 'Ligado' : 'Desligado'}</span></div>
    ${f.enabled
      ? `<p class="muted">Jogos, odds (média das casas de apostas), marcadores ao vivo e resultados são importados automaticamente. As apostas são liquidadas quando o jogo termina.</p>
         <p>Eventos importados: <strong>${esc(counts)}</strong></p>
         ${f.lastError ? `<div class="form-error">Último erro (${esc(fmtDateTime(f.lastErrorAt))}): ${esc(f.lastError)}</div>` : ''}
         <div class="table-wrap"><table><thead><tr><th>Sincronização</th><th>Última execução</th><th>Resultado</th></tr></thead><tbody>
           ${last('fixtures', 'Jogos e odds')}${last('live', 'Ao vivo')}${last('results', 'Resultados')}
         </tbody></table></div><br>
         ${liveSocketPanel(f.liveSocket)}
         ${sportsAddonPanels(f)}
         <button class="primary-btn" data-action="feed-sync">Sincronizar agora</button>`
      : '<div class="notice">Defina a variável <strong>BZZOIRO_API_TOKEN</strong> no servidor (token gratuito em sports.bzzoiro.com) e reinicie para importar jogos reais.</div>'}
  </div>`;
}

function adminSettlement({ summary: s, queue, history }) {
  const SOURCE = { feed: 'Dados ao vivo', admin: 'Administrador', engine: 'Automático' };
  const stats = [
    ['Apostas em aberto', `${s.openBets} · ${money(s.openStake)}`], ['Responsabilidade máxima', money(s.maxLiability)],
    ['Liquidadas hoje', `${s.settledToday} · ${money(s.stakesSettledToday)}`], ['Pago hoje', money(s.paidToday)],
    ['Margem hoje', money(s.marginToday)],
  ].map(([l, v]) => `<div class="stat"><small>${l}</small><strong>${esc(v)}</strong></div>`).join('');
  const queueHtml = queue.length ? queue.map((e) => `<form class="admin-event" data-form="settle-queue" data-id="${e.id}">
      <div class="admin-event-head"><div><strong>${esc(e.home)} vs ${esc(e.away)}</strong><div class="muted">${esc(e.competition)} · ${esc(fmtDateTime(e.startTime))}</div></div>
        <div><span class="pill ${e.status}">${STATUS_LABEL[e.status] || e.status}</span></div></div>
      <p class="muted">${esc(e.reason)} · ${e.openBets} aposta(s) em aberto · ${money(e.openStake)} apostado · até ${money(e.openPotential)} a pagar</p>
      <div class="admin-grid">
        <div class="field"><span>Casa</span><input name="homeScore" type="number" min="0" value="${e.homeScore ?? ''}"></div>
        <div class="field"><span>Fora</span><input name="awayScore" type="number" min="0" value="${e.awayScore ?? ''}"></div>
        <div class="field"><span>Motivo da anulação</span><input name="reason" maxlength="200" placeholder="Jogo adiado / abandonado"></div>
      </div>
      <div class="admin-actions">
        <button class="primary-btn btn-sm" data-op="result">Liquidar com este resultado</button>
        <button class="danger-btn btn-sm" data-op="void">Anular apostas</button>
      </div></form>`).join('') : '<div class="panel empty">Nada pendente — todos os eventos estão a ser liquidados automaticamente.</div>';
  const historyHtml = history.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Evento</th><th>Ação</th><th class="num">Apostas</th><th class="num">Pago</th><th>Origem</th></tr></thead><tbody>
      ${history.map((h) => `<tr><td>${esc(fmtDateTime(h.createdAt))}</td><td>${esc(h.match)}<br><small class="muted">${esc(h.competition)}</small></td>
        <td>${h.action === 'result' ? `Resultado ${esc(h.score)}` : 'Anulado'}${h.note ? `<br><small class="muted">${esc(h.note)}</small>` : ''}</td>
        <td class="num">${h.betsSettled}</td><td class="num">${money(h.payout)}</td>
        <td>${esc(SOURCE[h.source] || h.source)}${h.user ? `<br><small class="muted">${esc(h.user)}</small>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="panel empty">Ainda não houve liquidações.</div>';
  const last = s.lastRun ? `Última verificação automática: ${fmtDateTime(s.lastRun)}${s.lastResult ? ` (${s.lastResult.settled} liquidados, ${s.lastResult.voided} anulados)` : ''}` : 'A verificação automática ainda não correu.';
  return `<div class="panel">
      <div class="section-head"><h2>Liquidação de mercados</h2><button class="primary-btn btn-sm" data-action="settlement-run">Executar liquidação agora</button></div>
      <p class="muted">Todos os mercados (1X2, dupla hipótese, empate anula, mais/menos golos e ambas marcam) são liquidados pelo resultado do tempo regulamentar assim que o jogo termina. Jogos cancelados são anulados (odd 1.00); jogos adiados sem nova data são anulados após ${s.postponedVoidHours} h. ${esc(last)}</p>
      <div class="stat-grid">${stats}</div></div>
    <div class="section-head"><h2>A precisar de decisão</h2></div>${queueHtml}
    <div class="section-head"><h2>Histórico</h2></div>${historyHtml}`;
}

function adminNewEvent() {
  const start = new Date(Date.now() + 2 * 3600_000);
  start.setMinutes(0, 0, 0);
  return `<form class="panel" data-form="admin-new">
    <div class="form-grid three">
      <div class="field"><label>Desporto</label><select name="sport">${Object.entries(SPORT_META).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></div>
      <div class="field"><label>Competição</label><input name="competition" required placeholder="Liga Portugal"></div>
      <div class="field"><label>Início</label><input name="startTime" type="datetime-local" required value="${toLocalInput(start.toISOString())}"></div>
      <div class="field"><label>Equipa da casa</label><input name="home" required></div>
      <div class="field"><label>Equipa visitante</label><input name="away" required></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="featured"> Destacar na página inicial</label></div>
      <div class="field"><label>Odd 1 (casa)</label><input name="odd1" required inputmode="decimal" placeholder="2.10"></div>
      <div class="field"><label>Odd X (empate — vazio se não houver)</label><input name="oddX" inputmode="decimal" placeholder="3.30"></div>
      <div class="field"><label>Odd 2 (fora)</label><input name="odd2" required inputmode="decimal" placeholder="3.40"></div>
    </div>
    <div class="form-actions"><button class="primary-btn">Criar evento</button></div>
  </form>`;
}

// ---------- bet slip ----------

/** Finds a selection shown anywhere (lists carry 1X2; the match page carries every market). */
function findSelection(selId) {
  const m = state.match.data;
  if (m) {
    for (const mk of m.markets || []) {
      const sel = mk.selections.find((s) => s.id === selId);
      if (sel) return { ev: m, sel: { ...sel, marketName: mk.name } };
    }
  }
  for (const ev of state.events) {
    const sel = ev.selections.find((s) => s.id === selId);
    if (sel) return { ev, sel: { ...sel, marketName: 'Resultado final' } };
  }
  return null;
}

function toggleSelection(selId) {
  const found = findSelection(selId);
  if (!found) return;
  const { ev, sel } = found;
  const idx = state.slip.findIndex((s) => s.selectionId === selId);
  if (idx >= 0) {
    state.slip.splice(idx, 1);
  } else {
    // One pick per event: choosing another outcome replaces the previous one.
    state.slip = state.slip.filter((s) => s.eventId !== ev.id);
    state.slip.push({
      selectionId: sel.id, eventId: ev.id, market: sel.market || '1x2', marketName: sel.marketName, code: sel.code,
      label: sel.label, odds: sel.odds, match: `${ev.home} vs ${ev.away}`, competition: ev.competition,
    });
  }
  autoMode();
  saveSlip();
  syncSelectedButtons();
  renderSlip();
}

/** Until the user picks a tab, 2+ picks default to a multiple and fewer to singles. */
function autoMode() {
  let touched = false;
  try { touched = !!localStorage.getItem('classicbet_mode_touched'); } catch { /* ignore */ }
  if (!touched) state.mode = state.slip.length >= 2 ? 'multiple' : 'single';
}

function syncSelectedButtons() {
  $$('.odd-btn[data-sel]').forEach((b) => b.classList.toggle('selected', inSlip(Number(b.dataset.sel))));
}

/** Refreshes slip entries against the latest event data (price moves, closed markets). */
function reconcileSlip() {
  for (const item of state.slip) {
    const found = findSelection(item.selectionId);
    const ev = found?.ev || state.events.find((e) => e.id === item.eventId);
    const sel = found?.sel;
    // Other markets are only known while their match page is open; otherwise the server checks them.
    if (!sel && ev && (item.market || '1x2') !== '1x2') {
      item.closed = !isOpen(ev);
      continue;
    }
    item.closed = !ev || !sel || !sel.active || !isOpen(ev);
    item.newOdds = sel && sel.odds !== item.odds ? sel.odds : undefined;
  }
}

function slipTotals() {
  const stake = Number(String($('#stake').value).replace(',', '.')) || 0;
  const items = state.slip;
  if (state.mode === 'multiple') {
    const odds = items.reduce((a, s) => a * s.odds, 1);
    return { stake, total: stake, odds, potential: Math.min(stake * odds, state.config?.maxPayout ?? Infinity) };
  }
  const potential = items.reduce((a, s) => a + Math.min(stake * s.odds, state.config?.maxPayout ?? Infinity), 0);
  return { stake, total: stake * items.length, odds: null, potential };
}

function renderSlip() {
  reconcileSlip();
  const n = state.slip.length;
  $('#betCount').textContent = `${n} ${n === 1 ? 'seleção' : 'seleções'}`;
  $('#slipFabCount').textContent = n;
  $('#slipFab').classList.toggle('hidden', n === 0);
  $$('.bet-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.mode));
  $('#betItems').innerHTML = n
    ? state.slip.map((s) => `<div class="bet-item${s.closed ? ' closed' : s.newOdds ? ' warn' : ''}">
        <div class="bet-item-top"><span>${esc(s.competition)}</span><span><span class="odd">${fmtOdds(s.odds)}</span><button class="remove-bet" data-remove="${s.selectionId}" aria-label="Remover">×</button></span></div>
        <strong>${esc(s.match)}</strong><div class="selection">${esc(s.label || CODE_LABEL[s.code])}${s.marketName && s.market !== '1x2' ? ` <small class="muted">· ${esc(s.marketName)}</small>` : ''}</div>
        ${s.closed ? '<div class="note red">Mercado fechado — remova esta seleção.</div>' : s.newOdds ? `<div class="note">Odd alterada: ${fmtOdds(s.odds)} → ${fmtOdds(s.newOdds)}</div>` : ''}
      </div>`).join('')
    : '<div class="empty-bet"><div>🎟️</div><strong>O seu boletim está vazio</strong><span>Selecione uma odd para começar a sua aposta.</span></div>';
  $('#betFooter').classList.toggle('hidden', n === 0);
  if (!n) return;

  const t = slipTotals();
  $('#oddsLabel').textContent = state.mode === 'multiple' ? 'Cotação total' : 'Apostas simples';
  $('#totalOdds').textContent = state.mode === 'multiple' ? fmtOdds(t.odds) : `${n} × ${money(t.stake)}`;
  $('#stakeLabel').textContent = state.mode === 'multiple' ? 'Valor da aposta' : 'Valor por aposta';
  $('#totalStake').textContent = money(t.total);
  $('#potential').textContent = money(t.potential);

  const changed = state.slip.some((s) => s.newOdds);
  const closed = state.slip.some((s) => s.closed);
  const btn = $('#placeBet');
  let error = '';
  if (closed) error = 'Há seleções com o mercado fechado.';
  else if (state.mode === 'multiple' && n < 2) error = 'Uma múltipla precisa de pelo menos 2 seleções.';
  $('#slipError').textContent = error;
  $('#slipError').classList.toggle('hidden', !error);
  btn.disabled = !!error;
  btn.textContent = changed ? 'ACEITAR NOVAS ODDS' : state.user ? 'APOSTAR AGORA' : 'ENTRAR PARA APOSTAR';
  btn.dataset.state = changed ? 'accept' : 'place';
}

async function placeBet() {
  const btn = $('#placeBet');
  if (btn.dataset.state === 'accept') {
    state.slip.forEach((s) => { if (s.newOdds) s.odds = s.newOdds; });
    saveSlip();
    renderSlip();
    return;
  }
  if (!state.user) return openAuth('login');
  const { stake } = slipTotals();
  btn.disabled = true;
  btn.textContent = 'A PROCESSAR…';
  try {
    const res = await api('/api/bets', {
      method: 'POST',
      body: { mode: state.mode, stake, selections: state.slip.map((s) => ({ selectionId: s.selectionId, odds: s.odds })) },
    });
    state.user.balance = res.balance;
    state.slip = [];
    saveSlip();
    toast('Aposta registada', `${res.betIds.length > 1 ? `${res.betIds.length} apostas` : `Aposta #${res.betIds[0]}`} · saldo ${money(res.balance)}`);
    updateHeader();
    syncSelectedButtons();
    setSlipOpen(false);
  } catch (err) {
    if (err.data?.changes) {
      for (const c of err.data.changes) {
        const item = state.slip.find((s) => s.selectionId === c.selectionId);
        if (item) item.newOdds = c.odds;
      }
      await refreshEvents();
    } else if (err.status === 401) {
      openAuth('login');
    }
    toast('Aposta não registada', err.message, 'error');
  } finally {
    renderSlip();
  }
}

// ---------- header / routing ----------

function updateHeader() {
  const u = state.user;
  $('#loginBtn').classList.toggle('hidden', !!u);
  $('#registerBtn').classList.toggle('hidden', !!u);
  $('#balanceBtn').classList.toggle('hidden', !u);
  $('#depositBtn').classList.toggle('hidden', !u);
  $('#profileBtn').classList.toggle('hidden', !u);
  $('#adminLink').classList.toggle('hidden', u?.role !== 'admin');
  if (u) {
    $('#headerBalance').textContent = money(u.balance);
    $('#profileBtn').textContent = initials(u.name);
  }
}

function renderSidebar() {
  const counts = {};
  for (const e of state.events) counts[e.sport] = (counts[e.sport] || 0) + 1;
  $('#sportLinks').innerHTML = Object.entries(SPORT_META)
    .map(([k, v]) => `<a class="side-link" href="#/desporto" data-sport-link="${k}"><span>${v.icon}</span> ${v.name} <b>${counts[k] || ''}</b></a>`).join('');
  const live = state.events.filter((e) => e.status === 'live').length;
  $('#liveCount').textContent = live || '';
}

function currentRoute() {
  const [page = '', sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: page || 'home', sub };
}

function render({ keepScroll = false } = {}) {
  const { page, sub } = currentRoute();
  const pages = {
    home: homePage, desporto: () => sportsPage(sub), 'ao-vivo': livePage, casino: casinoPage,
    promocoes: promosPage, perfil: () => accountPage(sub), admin: adminPage, jogo: () => matchPage(sub),
  };
  if (page !== 'jogo') leaveMatch();
  const immersive = page === 'casino' && sub === 'jogar';
  // Leaving a game brings its balance back; while one is open the header follows the casino balance.
  if (!immersive) {
    state.casinoSession = null;
    clearInterval(state.casinoTimer);
    state.casinoTimer = null;
    if (state.user?.casinoActive) closeCasino();
  } else if (!state.casinoTimer) {
    state.casinoTimer = setInterval(() => { if (!document.hidden && state.casinoSession?.url) refreshCasinoBalance(); }, 10_000);
  }
  document.body.classList.toggle('immersive', immersive);
  $('#content').innerHTML = immersive ? casinoPlayPage() : (pages[page] || homePage)();
  if (page === 'jogo') afterMatchRender();
  $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === page));
  if (!keepScroll) window.scrollTo({ top: 0 });
  $('#leftSidebar').classList.remove('open');
}

/** Re-renders only pages that show odds, and never while the user is typing. */
function refreshView() {
  const { page } = currentRoute();
  if (!['home', 'desporto', 'ao-vivo'].includes(page)) return;
  if (document.activeElement && $('#content').contains(document.activeElement) && document.activeElement.matches('input, select')) return;
  render({ keepScroll: true });
  if (!$('#modalBackdrop').classList.contains('hidden') && $('#searchInput')) renderSearch($('#searchInput').value);
}

async function refreshEvents() {
  try {
    const { events } = await api('/api/events');
    state.previousOdds = new Map(state.events.flatMap((e) => e.selections.map((s) => [s.id, s.odds])));
    state.events = events;
    state.eventsLoaded = true;
    renderSidebar();
    renderSlip();
    refreshView();
  } catch { /* keep last data; next poll retries */ }
}

async function refreshMe() {
  try {
    const { user } = await api('/api/me');
    state.user = user;
  } catch { state.user = null; }
  updateHeader();
}

// ---------- event handlers ----------

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}
function showFormError(form, msg) {
  const box = $('.form-error', form);
  if (box) { box.textContent = msg; box.classList.remove('hidden'); } else toast('Erro', msg, 'error');
}

const formHandlers = {
  async login(form) {
    const d = formData(form);
    const { user } = await api('/api/auth/login', { method: 'POST', body: { email: d.email, password: d.password } });
    state.user = user;
    closeModal();
    toast('Sessão iniciada', `Bem-vindo, ${user.name.split(' ')[0]}.`);
    updateHeader(); renderSlip(); render({ keepScroll: true });
  },
  async register(form) {
    const d = formData(form);
    const { user } = await api('/api/auth/register', {
      method: 'POST',
      body: { name: d.name, email: d.email, birthdate: d.birthdate, phone: d.phone, password: d.password, acceptTerms: form.acceptTerms.checked },
    });
    state.user = user;
    closeModal();
    toast('Conta criada', 'Faça o seu primeiro depósito para começar a apostar.');
    updateHeader(); renderSlip();
    location.hash = '#/perfil/carteira';
  },
  async profile(form) {
    const d = formData(form);
    const { user } = await api('/api/me', { method: 'PATCH', body: { name: d.name, phone: d.phone } });
    state.user = user;
    updateHeader();
    toast('Dados atualizados');
  },
  async password(form) {
    const d = formData(form);
    await api('/api/me/password', { method: 'POST', body: d });
    form.reset();
    toast('Palavra-passe alterada', 'As outras sessões foram terminadas.');
  },
  async deposit(form) {
    const d = formData(form);
    const res = await api('/api/wallet/deposit', { method: 'POST', body: { amount: d.amount, method: d.method } });
    state.user.balance = res.balance;
    toast('Depósito efetuado', `Novo saldo: ${money(res.balance)}`);
    updateHeader(); loadWallet();
  },
  async withdraw(form) {
    const d = formData(form);
    const res = await api('/api/wallet/withdraw', { method: 'POST', body: { amount: d.amount, iban: d.iban } });
    state.user.balance = res.balance;
    form.reset();
    toast('Levantamento pedido', 'O pedido será analisado pela equipa.');
    updateHeader(); loadWallet();
  },
  async exclusion(form) {
    const days = Number(formData(form).days);
    if (!confirm(`Ativar autoexclusão por ${form.days.selectedOptions[0].textContent}? Não pode ser anulada antes do fim.`)) return;
    const { user } = await api('/api/me/self-exclusion', { method: 'POST', body: { days } });
    state.user = user;
    toast('Autoexclusão ativada');
    render({ keepScroll: true });
  },
  async 'settle-queue'(form, submitter) {
    const id = form.dataset.id;
    const d = formData(form);
    if (submitter?.dataset.op === 'void') {
      if (!confirm('Anular todas as apostas neste evento (devolver os montantes apostados)?')) return;
      const r = await api(`/api/admin/events/${id}/cancel`, { method: 'POST', body: { reason: d.reason || undefined } });
      toast('Evento anulado', `${r.settledBets} aposta(s) processada(s).`);
    } else {
      if (d.homeScore === '' || d.awayScore === '') throw new Error('Preencha o resultado final (casa e fora).');
      if (!confirm(`Confirmar resultado final ${d.homeScore}-${d.awayScore} e liquidar as apostas?`)) return;
      const r = await api(`/api/admin/events/${id}/result`, { method: 'POST', body: { homeScore: Number(d.homeScore), awayScore: Number(d.awayScore) } });
      toast('Evento liquidado', `${r.settledBets} aposta(s) processada(s).`);
    }
    loadAdmin();
    refreshEvents();
  },
  async 'admin-new'(form) {
    const d = formData(form);
    await api('/api/admin/events', {
      method: 'POST',
      body: {
        sport: d.sport, competition: d.competition, home: d.home, away: d.away, featured: !!form.featured.checked,
        startTime: new Date(d.startTime).toISOString(), odds: { 1: d.odd1, X: d.oddX, 2: d.odd2 },
      },
    });
    toast('Evento criado');
    state.adminTab = 'eventos';
    render({ keepScroll: true });
    refreshEvents();
  },
  async 'admin-event'(form, submitter) {
    const id = form.dataset.id;
    const op = submitter?.dataset.op || 'save';
    const d = formData(form);
    const url = `/api/admin/events/${id}`;
    const score = (v) => (v === '' || v === undefined ? null : Number(v));
    if (op === 'result') {
      if (d.homeScore === '' || d.awayScore === '') throw new Error('Preencha o resultado final (casa e fora).');
      if (!confirm(`Confirmar resultado final ${d.homeScore}-${d.awayScore} e liquidar as apostas?`)) return;
      const r = await api(`${url}/result`, { method: 'POST', body: { homeScore: Number(d.homeScore), awayScore: Number(d.awayScore) } });
      toast('Evento liquidado', `${r.settledBets} aposta(s) processada(s).`);
    } else if (op === 'cancel') {
      if (!confirm('Cancelar o evento? Todas as apostas neste evento serão anuladas.')) return;
      const r = await api(`${url}/cancel`, { method: 'POST', body: {} });
      toast('Evento cancelado', `${r.settledBets} aposta(s) processada(s).`);
    } else if (op === 'live') {
      await api(url, { method: 'PATCH', body: { status: 'live', homeScore: score(d.homeScore) ?? 0, awayScore: score(d.awayScore) ?? 0, clock: d.clock || "1'" } });
      toast('Evento ao vivo');
    } else if (op === 'suspend' || op === 'resume') {
      await api(url, { method: 'PATCH', body: { suspended: op === 'suspend' } });
      toast(op === 'suspend' ? 'Mercado suspenso' : 'Mercado reaberto');
    } else if (op === 'feature') {
      const featured = form.dataset.featured !== '1';
      await api(url, { method: 'PATCH', body: { featured } });
    } else {
      await api(url, {
        method: 'PATCH',
        body: { homeScore: score(d.homeScore), awayScore: score(d.awayScore), clock: d.clock, odds: { 1: d.odd1, X: d.oddX, 2: d.odd2 } },
      });
      toast('Evento atualizado');
    }
    loadAdmin();
    refreshEvents();
  },
};

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const handler = formHandlers[form.dataset.form];
  if (!handler) return;
  const buttons = $$('button', form);
  buttons.forEach((b) => { b.disabled = true; });
  try {
    await handler(form, e.submitter);
  } catch (err) {
    showFormError(form, err.message);
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
});

document.addEventListener('click', async (e) => {
  const odd = e.target.closest('.odd-btn[data-sel]');
  if (odd) { toggleSelection(Number(odd.dataset.sel)); return; }

  const opener = e.target.closest('[data-open]');
  if (opener && !e.target.closest('a, button')) { location.hash = `#/jogo/${opener.dataset.open}`; return; }
  const matchTab = e.target.closest('[data-match-tab]');
  if (matchTab) { state.match.tab = matchTab.dataset.matchTab; render({ keepScroll: true }); return; }

  const remove = e.target.closest('[data-remove]');
  if (remove) {
    state.slip = state.slip.filter((s) => s.selectionId !== Number(remove.dataset.remove));
    saveSlip(); autoMode(); syncSelectedButtons(); renderSlip();
    return;
  }

  const sport = e.target.closest('[data-sport]');
  if (sport) { state.sport = sport.dataset.sport; render({ keepScroll: true }); return; }
  const sportLink = e.target.closest('[data-sport-link]');
  if (sportLink) { state.sport = sportLink.dataset.sportLink; if (location.hash === '#/desporto') render(); return; }

  const game = e.target.closest('[data-game]');
  if (game && !game.matches('form')) { openGame(Number(game.dataset.game)); return; }
  const cat = e.target.closest('[data-casino-cat]');
  if (cat) { state.casinoFilter.category = cat.dataset.casinoCat; loadCasino({ reset: true }); return; }
  const prov = e.target.closest('[data-casino-prov]');
  if (prov) { state.casinoFilter.provider = prov.dataset.casinoProv; loadCasino({ reset: true }); return; }

  const adminTab = e.target.closest('[data-admin-tab]');
  if (adminTab) { state.adminTab = adminTab.dataset.adminTab; render({ keepScroll: true }); return; }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'close-modal') closeModal();
  else if (action === 'login') openAuth('login');
  else if (action === 'register') openAuth('register');
  else if (action === 'game') toast('Casino em integração', 'Os jogos ficam disponíveis com a ligação ao fornecedor de casino.');
  else if (action === 'casino-more') {
    loadCasino();
  } else if (action === 'casino-test') {
    actionEl.disabled = true;
    actionEl.textContent = 'A testar…';
    try {
      const { steps } = await api('/api/admin/casino/test', { method: 'POST', body: {} });
      $('#casinoTest').innerHTML = `<br><div class="table-wrap"><table><tbody>${steps.map((s) =>
        `<tr><td>${s.ok ? '✅' : '❌'}</td><td><strong>${esc(s.name)}</strong></td><td>${esc(s.detail)}</td></tr>`).join('')}</tbody></table></div>`;
      loadCasino();
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
    actionEl.textContent = 'Testar ligação';
  } else if (action === 'settlement-run') {
    actionEl.disabled = true;
    try {
      const { result } = await api('/api/admin/settlement/run', { method: 'POST', body: {} });
      toast('Liquidação executada', `${result.settled} evento(s) liquidado(s), ${result.voided} anulado(s).`);
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadAdmin();
  } else if (action === 'feed-sync') {
    actionEl.disabled = true;
    actionEl.textContent = 'A sincronizar…';
    try {
      await api('/api/admin/feed/sync', { method: 'POST', body: {} });
      toast('Sincronização concluída');
      refreshEvents();
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadAdmin();
  } else if (action === 'wd-approve' || action === 'wd-reject') {
    const verb = action === 'wd-approve' ? 'approve' : 'reject';
    if (!confirm(verb === 'approve' ? 'Aprovar este levantamento (confirmando que a transferência foi feita)?' : 'Rejeitar e devolver o valor ao jogador?')) return;
    try {
      await api(`/api/admin/withdrawals/${actionEl.dataset.id}/${verb}`, { method: 'POST', body: {} });
      toast(verb === 'approve' ? 'Levantamento aprovado' : 'Levantamento rejeitado');
      loadAdmin();
    } catch (err) { toast('Erro', err.message, 'error'); }
  }
});

// A casino thumbnail that fails to load shows the generic art instead.
document.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement && e.target.classList.contains('game-img')) e.target.replaceWith('🎰');
}, true);

// A badge that fails to load (the provider answers 204/404 when it has none) becomes initials.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('team-logo')) return;
  const box = img.parentElement;
  box.classList.remove('has-logo');
  box.textContent = box.classList.contains('mini') ? box.dataset.initials.slice(0, 1) : box.dataset.initials;
}, true);
// A league badge that fails to load falls back to the sport icon.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.classList.contains('league-img')) img.parentElement.textContent = img.parentElement.dataset.icon;
}, true);
// A 204 response is a "successful" empty image: treat zero-size loads the same way.
document.addEventListener('load', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && (img.classList.contains('team-logo') || img.classList.contains('league-img')) && !img.naturalWidth) img.dispatchEvent(new Event('error'));
}, true);

let casinoSearchTimer = null;
document.addEventListener('input', (e) => {
  if (e.target.id === 'casinoSearch') {
    clearTimeout(casinoSearchTimer);
    casinoSearchTimer = setTimeout(() => { state.casinoFilter.q = e.target.value.trim(); loadCasino({ reset: true }); }, 350);
  }
  if (e.target.id === 'searchInput') renderSearch(e.target.value);
  if (e.target.id === 'stake') renderSlip();
});

function setSlipOpen(open) {
  $('#betslip').classList.toggle('open', open);
  document.body.classList.toggle('slip-open', open);
}

// Closing the tab or navigating away while playing: bring the balance back (best effort; the
// server also reclaims it before any bet, withdrawal or wallet view).
window.addEventListener('pagehide', () => {
  if (state.casinoSession) closeCasino({ keepalive: true });
});

function bindChrome() {
  $('#loginBtn').addEventListener('click', () => openAuth('login'));
  $('#registerBtn').addEventListener('click', () => openAuth('register'));
  $('#searchBtn').addEventListener('click', openSearch);
  $('#menuBtn').addEventListener('click', () => $('#leftSidebar').classList.add('open'));
  $('#closeMenu').addEventListener('click', () => $('#leftSidebar').classList.remove('open'));
  $('#slipFab').addEventListener('click', () => setSlipOpen(true));
  $('#closeSlip').addEventListener('click', () => setSlipOpen(false));
  $('#clearBets').addEventListener('click', () => { state.slip = []; saveSlip(); autoMode(); syncSelectedButtons(); renderSlip(); });
  $('#placeBet').addEventListener('click', placeBet);
  $$('.bet-tabs button').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.tab;
    try { localStorage.setItem('classicbet_mode_touched', '1'); } catch { /* ignore */ }
    renderSlip();
  }));
  $$('.quick-stakes button').forEach((b) => b.addEventListener('click', () => { $('#stake').value = b.dataset.stake; renderSlip(); }));
  $('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); setSlipOpen(false); } });
  window.addEventListener('hashchange', () => render());
}

// ---------- match page (#/jogo/<id>): markets, statistics, 2D tracker, live stream ----------

const SITUATION_LABEL = {
  dangerous_attack: 'Ataque perigoso', attack: 'Ataque', possession: 'Posse de bola', safe: 'Posse segura',
  goal: 'GOLO!', corner: 'Canto', freekick: 'Livre', throwin: 'Lançamento lateral', offside: 'Fora de jogo',
  goalkeeper_saved: 'Defesa do guarda-redes', shotoffwoodwork: 'Bola no ferro',
};
const INCIDENT_ICON = { goal: '⚽', yellow: '🟨', red: '🟥', sub: '🔁', var: '📺' };
const ACTION_LABEL = {
  pass: 'Passe', take_on: 'Drible', tackle: 'Desarme', interception: 'Interceção', save: 'Defesa', clearance: 'Alívio',
  miss: 'Remate ao lado', post: 'Bola no poste', attempt_saved: 'Remate defendido', goal: '⚽ Golo', temp_goal: 'Possível golo',
  temp_attempt: 'Remate', foul: 'Falta', out: 'Bola fora', corner_awarded: 'Canto', offside_pass: 'Fora de jogo', card: 'Cartão',
  player_off: 'Substituição (sai)', player_on: 'Substituição (entra)', ball_recovery: 'Recuperação', dispossessed: 'Perda de bola',
  aerial: 'Duelo aéreo', challenge: 'Disputa', keeper_pickup: 'Guarda-redes agarra', penalty_faced: 'Penálti', period_start: 'Início do período',
  period_end: 'Fim do período', deleted_event: 'Lance anulado', rescinded_card: 'Cartão anulado',
};

function leaveMatch() {
  const m = state.match;
  m.es?.close();
  clearInterval(m.timer);
  Object.assign(m, { id: null, data: null, extras: null, insights: null, tab: 'mercados', es: null, timer: null, ball: null, trail: [], actions: [], live: null, streaming: false });
}

async function loadMatch(id, { quiet = false } = {}) {
  try {
    const { event } = await api(`/api/events/${id}`);
    if (state.match.id !== id) return;
    const wasLive = state.match.data?.status === 'live';
    state.match.data = event;
    if (event.status !== 'scheduled') loadMatchExtras(id);
    if (!state.match.insights) loadMatchInsights(id);
    if (event.status === 'live' && (!wasLive || !state.match.es)) startMatchStream(id);
    renderSlip();
    if (currentRoute().page === 'jogo') render({ keepScroll: true });
  } catch (err) {
    if (!quiet) toast('Jogo', err.message, 'error');
  }
}

async function loadMatchExtras(id) {
  try {
    const extras = await api(`/api/events/${id}/stats`);
    if (state.match.id !== id) return;
    state.match.extras = extras;
    if (currentRoute().page === 'jogo' && state.match.tab !== 'tracker') render({ keepScroll: true });
  } catch { /* extras are optional */ }
}

async function loadMatchInsights(id) {
  state.match.insights = { loading: true };
  try {
    const insights = await api(`/api/events/${id}/insights`);
    if (state.match.id !== id) return;
    state.match.insights = insights;
  } catch {
    if (state.match.id === id) state.match.insights = { error: true };
  }
  if (currentRoute().page === 'jogo' && state.match.tab !== 'tracker' && state.match.tab !== 'mercados') render({ keepScroll: true });
}

function startMatchStream(id) {
  const m = state.match;
  m.es?.close();
  if (typeof EventSource !== 'function') return;
  const es = new EventSource(`/api/events/${id}/live`);
  m.es = es;
  const on = (type, fn) => es.addEventListener(type, (ev) => { try { fn(JSON.parse(ev.data)); } catch { /* bad frame */ } });
  on('snapshot', (s) => {
    m.streaming = !!s.following;
    if (s.event) applyLiveEvent(s.event);
    for (const d of s.livedata || []) pushBall(d);
    m.actions = (s.actions || []).slice(-15);
    updateTracker();
  });
  on('event', applyLiveEvent);
  on('livedata', (d) => { pushBall(d); updateTracker(); });
  on('action', (a) => { m.actions.push(a); m.actions = m.actions.slice(-15); updateActionsList(); });
  on('odds', () => loadMatch(id, { quiet: true }));
  // No stream (match not covered by the live socket): the page keeps polling instead.
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) m.es = null; };
}

function applyLiveEvent(e) {
  const d = state.match.data;
  if (!d) return;
  const scored = d.homeScore !== e.homeScore || d.awayScore !== e.awayScore;
  d.homeScore = e.homeScore;
  d.awayScore = e.awayScore;
  d.clock = e.clock || d.clock;
  if (e.server) d.server = e.server;
  state.match.live = e.stats || state.match.live;
  const score = $('#matchScore');
  if (score) score.textContent = `${d.homeScore ?? 0} - ${d.awayScore ?? 0}`;
  const clock = $('#matchClock');
  if (clock) clock.textContent = d.clock || '';
  if (scored && d.sport === 'futebol') {
    toast('Golo!', `${d.home} ${d.homeScore} - ${d.awayScore} ${d.away}`);
    loadMatch(d.id, { quiet: true }); // markets were suspended; fetch their new state
  } else if (scored && d.sport === 'tenis') toast('Set', `${d.home} ${d.homeScore} - ${d.awayScore} ${d.away}`);
  if (d.sport === 'tenis') updateServe(d);
}

/** Tennis: who is serving, from the live frames. */
function updateServe(e) {
  $$('[data-serve]').forEach((el) => el.classList.toggle('serving', el.dataset.serve === e.server));
}

function pushBall(d) {
  if (d.x === null || d.y === null) {
    state.match.ball = { ...(state.match.ball || {}), situation: d.situation, side: d.side, commentary: d.commentary };
    return;
  }
  const m = state.match;
  if (m.ball && m.ball.x !== null) m.trail.push({ x: m.ball.x, y: m.ball.y });
  m.trail = m.trail.slice(-8);
  m.ball = d;
}

// Last tab of the match page: league table or players' ranking, where the sport has one.
const TABLE_TAB = {
  futebol: ['classificacao', 'Classificação'], basquetebol: ['classificacao', 'Classificação'], hoquei: ['classificacao', 'Classificação'],
  tenis: ['ranking', 'Ranking'], dardos: ['ranking', 'Ranking'],
};

function matchPage(sub) {
  const id = Number(sub);
  const m = state.match;
  if (!Number.isInteger(id) || id <= 0) return '<div class="panel empty">Jogo não encontrado.</div>';
  if (m.id !== id) {
    leaveMatch();
    m.id = id;
    setTimeout(() => loadMatch(id));
    // Markets and score keep refreshing while the page is open (the stream adds real time on top).
    m.timer = setInterval(() => {
      if (document.hidden || state.match.id !== id) return;
      const live = state.match.data?.status === 'live';
      loadMatch(id, { quiet: true });
      if (live) loadMatchExtras(id);
    }, 15_000);
  }
  const e = m.data;
  if (!e) return '<div class="loading">A carregar o jogo…</div>';

  const live = e.status === 'live';
  const center = live
    ? `<div class="match-score" id="matchScore">${e.homeScore ?? 0} - ${e.awayScore ?? 0}</div><div class="live-label" id="matchClock">● ${esc(e.clock || 'AO VIVO')}</div>`
    : e.status === 'finished'
      ? `<div class="match-score">${e.homeScore} - ${e.awayScore}</div><div class="muted">Terminado</div>`
      : `<div class="match-kickoff">${esc(fmtWhen(e.startTime))}</div><div class="muted">${esc(new Date(e.startTime).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`;
  const football = e.sport === 'futebol';
  const tabs = [['mercados', 'Mercados'], ['estatisticas', 'Estatísticas'], ['h2h', 'Confrontos (H2H)'], ['previsao', 'Previsão']];
  const table = TABLE_TAB[e.sport];
  if (table && e.source !== 'manual') tabs.push(table);
  if (e.liveTracker) tabs.push(['tracker', 'Tracker']);
  if (!tabs.some(([k]) => k === m.tab)) m.tab = 'mercados';

  let body = '';
  if (m.tab === 'estatisticas') body = football ? matchStatsView(e) : sportStatsView(e);
  else if (m.tab === 'h2h') body = insightView(e, h2hView);
  else if (m.tab === 'previsao') body = insightView(e, predictionView);
  else if (m.tab === 'classificacao') body = insightView(e, standingsView);
  else if (m.tab === 'ranking') body = insightView(e, rankingView);
  else if (m.tab === 'tracker') body = trackerView(e);
  else body = marketsView(e);

  return `<a class="back-link" href="#/${live ? 'ao-vivo' : 'desporto'}">‹ Voltar</a>
    <section class="match-hero">
      <div class="match-comp">${e.leagueLogo ? `<span class="league-logo" data-icon="⚽"><img class="league-img" src="${esc(e.leagueLogo)}" alt=""></span>` : SPORT_META[e.sport]?.icon || '⚽'} ${esc(e.competition)}</div>
      <div class="match-teams">
        <div class="match-team">${sideBadge(e, 'home', 'big')}<strong>${esc(e.home)}${e.sport === 'tenis' && live ? ' <i class="serve-dot" data-serve="home" title="Ao serviço"></i>' : ''}</strong></div>
        <div class="match-center">${center}</div>
        <div class="match-team">${sideBadge(e, 'away', 'big')}<strong>${esc(e.away)}${e.sport === 'tenis' && live ? ' <i class="serve-dot" data-serve="away" title="Ao serviço"></i>' : ''}</strong></div>
      </div>
    </section>
    <div class="match-tabs">${tabs.map(([k, l]) => `<button class="${m.tab === k ? 'active' : ''}" data-match-tab="${k}">${l}${k === 'tracker' ? ' <i class="live-dot"></i>' : ''}</button>`).join('')}</div>
    <div class="match-body">${body}</div>
    ${footer()}`;
}

function marketsView(e) {
  if (!e.markets?.length) {
    return `<div class="panel empty">${e.status === 'live' ? 'Mercados suspensos neste momento. Voltam a abrir quando chegar a próxima odd.' : 'Ainda não há mercados para este jogo.'}</div>`;
  }
  const locked = !isOpen(e);
  const btn = (s, label = s.label) => {
    const off = locked || !s.active;
    return `<button class="odd-btn market-odd${inSlip(s.id) ? ' selected' : ''}${off ? ' locked' : ''}" data-sel="${s.id}" ${off ? 'disabled' : ''}>
      <small>${esc(label)}</small>${off ? '🔒' : fmtOdds(s.odds)}</button>`;
  };
  return e.markets.map((mk) => {
    let grid;
    if (mk.market === 'ou') {
      const lines = [...new Set(mk.selections.map((s) => s.code.slice(1)))].sort((a, b) => a - b);
      grid = lines.map((line) => {
        const over = mk.selections.find((s) => s.code === `O${line}`);
        const under = mk.selections.find((s) => s.code === `U${line}`);
        return `<div class="market-line"><span class="market-line-label">${esc(line)} golos</span>
          <div class="odds two">${over ? btn(over, 'Mais') : '<span></span>'}${under ? btn(under, 'Menos') : '<span></span>'}</div></div>`;
      }).join('');
    } else {
      grid = `<div class="odds${mk.selections.length === 2 ? ' two' : ''}">${mk.selections.map((s) => btn(s)).join('')}</div>`;
    }
    return `<div class="market-block"><div class="market-head">${esc(mk.name)}</div>${grid}</div>`;
  }).join('');
}

function matchStatsView(e) {
  const x = state.match.extras;
  if (e.status === 'scheduled') return '<div class="panel empty">As estatísticas aparecem quando o jogo começar.</div>';
  if (!x) return '<div class="loading">A carregar estatísticas…</div>';
  const stats = x.stats?.length ? x.stats : liveStatsFallback();
  const bars = stats.map((s) => {
    const total = (s.home || 0) + (s.away || 0);
    const hp = total ? Math.round(((s.home || 0) / total) * 100) : 50;
    const fmt = (v) => (s.key === 'xg' ? Number(v).toFixed(2) : `${v}${s.unit || ''}`);
    return `<div class="stat-row"><div class="stat-vals"><b>${esc(fmt(s.home))}</b><span>${esc(s.label)}</span><b>${esc(fmt(s.away))}</b></div>
      <div class="stat-bar"><i class="w${Math.round(hp / 5) * 5}"></i></div></div>`;
  }).join('');
  const inc = (x.incidents || []).map((i) => `<div class="incident ${i.side || ''}"><span class="inc-min">${i.minute ?? ''}'</span>
    <span class="inc-icon">${INCIDENT_ICON[i.type] || '•'}</span><span>${esc(i.player || '')}${i.side ? ` <small class="muted">(${esc(i.side === 'home' ? e.home : e.away)})</small>` : ''}</span></div>`).join('');
  return `<div class="grid match-stats-grid">
    <div class="panel"><h3>Estatísticas</h3>${bars || '<p class="muted">Sem estatísticas para este jogo.</p>'}</div>
    <div class="panel"><h3>Cronologia</h3>${inc || '<p class="muted">Sem golos nem cartões até agora.</p>'}</div>
  </div>`;
}

/** Live socket stats (possession, shots, corners, xG) when the REST stats are not in yet. */
function liveStatsFallback() {
  const l = state.match.live;
  if (!l?.home || !l?.away) return [];
  return [['possession', 'Posse de bola', '%'], ['xg', 'Golos esperados (xG)', ''], ['shots_total', 'Remates', ''], ['corners', 'Cantos', '']]
    .filter(([k]) => l.home[k] !== undefined && l.away[k] !== undefined)
    .map(([k, label, unit]) => ({ key: k === 'possession' ? 'ball_possession' : k, label, unit, home: Number(l.home[k]), away: Number(l.away[k]) }));
}

// ---------- match insights: H2H, prediction, table / rankings ----------

function insightView(e, view) {
  const x = state.match.insights;
  if (!x || x.loading) return '<div class="loading">A carregar…</div>';
  if (x.error) return '<div class="panel empty">Não foi possível carregar estes dados. Tente novamente dentro de momentos.</div>';
  return view(e, x);
}

const fmtShortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
const pctText = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`);

/** Three-way (or two-way) split bar: home / draw / away. */
function splitBar(parts) {
  const total = parts.reduce((a, p) => a + (Number(p.value) || 0), 0) || 1;
  return `<div class="split-bar">${parts.map((p) => `<i class="${p.cls}" data-w="${((Number(p.value) || 0) / total) * 100}"></i>`).join('')}</div>`;
}

function formChips(list) {
  if (!list?.length) return '<span class="muted">—</span>';
  return list.map((r) => `<span class="form-chip ${r === 'V' ? 'win' : r === 'D' ? 'loss' : 'draw'}">${r}</span>`).join('');
}

function h2hView(e, x) {
  const h = x.h2h;
  if (!h) return '<div class="panel empty">Sem confrontos diretos registados entre estes adversários.</div>';
  const draws = h.draws !== null && h.draws !== undefined;
  const summary = `<div class="panel">
    <h3>${h.total} confronto${h.total === 1 ? '' : 's'} direto${h.total === 1 ? '' : 's'}</h3>
    <div class="h2h-summary">
      <div><strong>${h.homeWins}</strong><small>Vitórias ${esc(e.home)}</small></div>
      ${draws ? `<div><strong>${h.draws}</strong><small>Empates</small></div>` : ''}
      <div><strong>${h.awayWins}</strong><small>Vitórias ${esc(e.away)}</small></div>
    </div>
    ${h.total ? splitBar([{ value: h.homeWins, cls: 'home' }, ...(draws ? [{ value: h.draws, cls: 'draw' }] : []), { value: h.awayWins, cls: 'away' }]) : ''}
    ${h.homeGoals !== null && h.homeGoals !== undefined ? `<p class="muted">${e.sport === 'futebol' || e.sport === 'hoquei' ? 'Golos' : 'Pontos'}: ${esc(e.home)} ${h.homeGoals} · ${esc(e.away)} ${h.awayGoals}${h.avgGoals !== null && h.avgGoals !== undefined ? ` · média ${String(h.avgGoals).replace('.', ',')} por jogo` : ''}</p>` : ''}
  </div>`;
  let list = '';
  if (h.meetings) {
    // Meetings already oriented: `won` is from the home side's point of view.
    const row = (m) => `<tr><td>${esc(fmtShortDate(m.date))}</td><td>${esc(m.home)} vs ${esc(m.away)}${m.competition ? `<br><small class="muted">${esc(m.competition)}</small>` : ''}</td>
      <td class="num">${esc(m.score || '—')}</td><td>${m.won === null || m.won === undefined ? '' : formChips([m.won ? 'V' : 'D'])}</td></tr>`;
    if (h.meetings.length) list += `<div class="panel"><h3>Últimos confrontos</h3><p class="muted">Resultado do ponto de vista de ${esc(e.home)}.</p><div class="table-wrap"><table><tbody>${h.meetings.map(row).join('')}</tbody></table></div></div>`;
  } else if (h.recent?.length) {
    // Football: sides by team id, since names get rewritten upstream.
    const row = (m) => {
      const ours = m.homeTeamId === x.homeTeamId ? 'h' : m.awayTeamId === x.homeTeamId ? 'a' : null;
      let res = '';
      if (ours && m.homeScore !== null && m.awayScore !== null) {
        const [f, a] = ours === 'h' ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore];
        res = f > a ? 'V' : f < a ? 'D' : 'E';
      }
      return `<tr><td>${esc(fmtShortDate(m.date))}</td><td class="h2h-teams">${esc(m.home)}</td>
        <td class="num"><b>${m.homeScore === null ? '—' : `${m.homeScore}-${m.awayScore}`}</b></td><td>${esc(m.away)}</td>
        <td>${res ? formChips([res]) : ''}</td></tr>`;
    };
    list += `<div class="panel"><h3>Últimos jogos</h3><p class="muted">Resultado do ponto de vista de ${esc(e.home)}.</p>
      <div class="table-wrap"><table><tbody>${h.recent.map(row).join('')}</tbody></table></div></div>`;
  }
  const formOf = (rows, letters) => (letters?.length ? formChips(letters) : rows?.length ? formChips(rows.map((r) => (r.won === null ? '?' : r.won ? 'V' : 'D'))) : null);
  const hf = formOf(h.homeForm, h.homeFormLetters);
  const af = formOf(h.awayForm, h.awayFormLetters);
  if (hf || af) {
    list += `<div class="panel"><h3>Forma recente</h3>
      <div class="form-line"><span>${esc(e.home)}</span><span>${hf || '<span class="muted">—</span>'}</span></div>
      <div class="form-line"><span>${esc(e.away)}</span><span>${af || '<span class="muted">—</span>'}</span></div></div>`;
  }
  if (h.compare?.length) {
    const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('pt-PT', { maximumFractionDigits: 2 }) : v);
    list += `<div class="panel"><h3>Comparação</h3><div class="table-wrap"><table class="compare"><thead><tr><th class="num">${esc(e.home)}</th><th></th><th>${esc(e.away)}</th></tr></thead><tbody>
      ${h.compare.map(([label, a, b]) => `<tr><td class="num"><b>${esc(fmt(a))}</b></td><td class="muted center">${esc(label)}</td><td><b>${esc(fmt(b))}</b></td></tr>`).join('')}
    </tbody></table></div></div>`;
  }
  return `<div class="insight-stack">${summary}${list}</div>`;
}

function predictionView(e, x) {
  const p = x.prediction;
  if (!p) return '<div class="panel empty">Ainda não há previsão para este jogo.</div>';
  const twoWay = p.draw === null || p.draw === undefined;
  const pick = { home: e.home, draw: 'Empate', away: e.away }[p.predicted];
  const outcome = (label, v, cls) => `<div class="prob ${cls}${p.predicted === cls ? ' picked' : ''}"><small>${esc(label)}</small><strong>${pctText(v)}</strong></div>`;
  const extra = [];
  if (p.xgHome !== null && p.xgHome !== undefined) extra.push(['Golos esperados', `${String(p.xgHome).replace('.', ',')} - ${String(p.xgAway).replace('.', ',')}`]);
  if (p.mostLikely) extra.push(['Resultado mais provável', p.mostLikely]);
  for (const [k, l] of [['over15', 'Mais de 1.5 golos'], ['over25', 'Mais de 2.5 golos'], ['over35', 'Mais de 3.5 golos'], ['bttsYes', 'Ambas marcam']]) {
    if (p[k] !== null && p[k] !== undefined) extra.push([l, pctText(p[k])]);
  }
  return `<div class="insight-stack"><div class="panel">
      <h3>Probabilidades do modelo</h3>
      <div class="prob-grid${twoWay ? ' two' : ''}">${outcome(e.home, p.home, 'home')}${twoWay ? '' : outcome('Empate', p.draw, 'draw')}${outcome(e.away, p.away, 'away')}</div>
      ${splitBar([{ value: p.home, cls: 'home' }, ...(twoWay ? [] : [{ value: p.draw, cls: 'draw' }]), { value: p.away, cls: 'away' }])}
      <p class="muted">${pick ? `Favorito do modelo: <strong>${esc(pick)}</strong>` : ''}${p.confidence !== null && p.confidence !== undefined ? ` · confiança ${pctText(p.confidence)}` : ''}</p>
    </div>
    ${extra.length ? `<div class="panel"><h3>Mercados de golos</h3><div class="stat-grid">${extra.map(([l, v]) => `<div class="stat"><small>${esc(l)}</small><strong>${esc(v)}</strong></div>`).join('')}</div></div>` : ''}
    <p class="muted small-note">Previsão estatística do fornecedor de dados. Não é garantia de resultado.</p></div>`;
}

function standingsView(e, x) {
  const t = x.standings;
  if (!t?.rows?.length) return '<div class="panel empty">Classificação indisponível para esta competição.</div>';
  const ours = [x.homeTeamId, x.awayTeamId];
  const zones = (t.zones || []).filter((z) => z.label);
  // Football columns by default; other sports send their own (wins/losses, overtime, % wins…).
  const cols = t.columns || [{ key: 'played', label: 'J' }, { key: 'won', label: 'V' }, { key: 'drawn', label: 'E' }, { key: 'lost', label: 'D' },
    { key: 'goals', label: 'Golos' }, { key: 'points', label: 'Pts' }];
  const cell = (r, k) => (k === 'goals' && r.goals === undefined ? `${r.goalsFor ?? ''}:${r.goalsAgainst ?? ''}` : r[k] ?? '');
  const formOf = (f) => (!f ? '' : formChips([...f.toUpperCase()].map((c) => ({ W: 'V', D: 'E', L: 'D' }[c] || c))));
  const row = (r) => `<tr class="${ours.includes(r.teamId) ? 'highlight' : ''}${r.zone ? ` zone-${esc(r.zone.type)}` : ''}">
    <td class="pos">${r.position ?? ''}</td><td>${esc(r.team)}</td>
    ${cols.map((c) => `<td class="num">${c.key === 'points' ? `<b>${esc(cell(r, c.key))}</b>` : esc(cell(r, c.key))}</td>`).join('')}
    <td class="form-cell">${formOf(r.form)}</td></tr>`;
  return `<div class="panel"><h3>${esc(e.competition)}${t.name ? ` — ${esc(t.name)}` : ''}</h3>
    <div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th>Equipa</th>${cols.map((c) => `<th class="num">${esc(c.label)}</th>`).join('')}<th class="form-cell">Forma</th></tr></thead>
    <tbody>${t.rows.map(row).join('')}</tbody></table></div>
    ${zones.length ? `<div class="zone-legend">${zones.map((z) => `<span class="zone-${esc(z.type)}"><i></i>${esc(z.label)}${z.from ? ` (${z.from}${z.to && z.to !== z.from ? `–${z.to}` : ''})` : ''}</span>`).join('')}</div>` : ''}
  </div>`;
}

function rankingView(e, x) {
  const r = x.rankings;
  if (!r) return '<div class="panel empty">Ranking indisponível neste momento.</div>';
  const card = (side) => {
    const k = r[side];
    return `<div class="stat"><small>${sideBadge(e, side, 'mini')}${esc(e[side])}</small><strong>${k?.position ? `${k.position}.º` : 'Sem ranking'}</strong>${k?.points ? `<small>${k.points.toLocaleString('pt-PT')} ${r.valueLabel ? esc(r.valueLabel.toLowerCase()) : 'pontos'}</small>` : ''}</div>`;
  };
  const ours = [x.homeTeamId, x.awayTeamId];
  return `<div class="insight-stack"><div class="stat-grid two-col">${card('home')}${card('away')}</div>
    ${r.rows?.length ? `<div class="panel"><h3>Ranking ${esc(r.type)} — top ${r.rows.length}</h3><div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th>Jogador</th><th class="num">${esc(r.valueLabel || 'Pontos')}</th></tr></thead><tbody>
      ${r.rows.map((p) => `<tr class="${ours.includes(p.playerId) ? 'highlight' : ''}"><td class="pos">${p.position ?? ''}</td><td>${p.country ? `${flagEmoji(p.country)} ` : ''}${esc(p.player)}</td><td class="num">${(p.points ?? 0).toLocaleString('pt-PT')}</td></tr>`).join('')}
    </tbody></table></div></div>` : ''}</div>`;
}

function sportStatsView(e) {
  const x = state.match.extras;
  if (e.status === 'scheduled') return '<div class="panel empty">As estatísticas aparecem quando o jogo começar. Veja os confrontos diretos, a previsão e a tabela nos outros separadores.</div>';
  if (e.source === 'manual') return '<div class="panel empty">Sem estatísticas para este evento.</div>';
  if (!x) return '<div class="loading">A carregar estatísticas…</div>';
  const bars = (stats) => stats.map((st) => {
    const total = st.home + st.away;
    const hp = total ? (st.home / total) * 100 : 50;
    return `<div class="stat-row"><div class="stat-vals"><b>${esc(`${st.home}${st.unit || ''}`)}</b><span>${esc(st.label)}</span><b>${esc(`${st.away}${st.unit || ''}`)}</b></div>
      <div class="stat-bar"><i data-w="${hp}"></i></div></div>`;
  }).join('');
  const groups = [...(x.sets || [])];
  // Serve statistics streamed during a tennis match.
  const live = state.match.live;
  if (e.sport === 'tenis' && live?.home && live?.away) {
    const liveStats = Object.keys(live.home).filter((k) => Number.isFinite(Number(live.home[k])) && Number.isFinite(Number(live.away[k])))
      .map((k) => ({ label: TENNIS_STAT[k] || k.replace(/_/g, ' '), home: Number(live.home[k]), away: Number(live.away[k]), unit: /pct/.test(k) ? '%' : '' }));
    if (liveStats.length) groups.unshift({ set: 'Ao vivo', stats: liveStats });
  }
  const sideName = (k) => (k === 'home' ? e.home : k === 'away' ? e.away : '');
  const tables = (x.tables || []).map((t) => `<div class="panel"><h3>${esc(t.title || sideName(t.side))}</h3><div class="table-wrap"><table>
    <thead><tr>${t.columns.map(([, l], i) => `<th${i ? ' class="num"' : ''}>${esc(l === 'Casa' ? e.home : l === 'Fora' ? e.away : l)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${t.columns.map(([k], i) => `<td${i ? ' class="num"' : ''}>${esc(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`).join('');
  const detail = x.setsDetail || e.clock;
  const title = e.sport === 'tenis' ? 'Parciais' : 'Resultado';
  const body = groups.map((g) => `<div class="panel"><h3>${esc(g.set)}</h3>${bars(g.stats)}</div>`).join('') + tables;
  return `<div class="insight-stack">${detail ? `<div class="panel"><h3>${title}</h3><p class="sets-detail">${esc(detail)}</p></div>` : ''}
    ${body || '<div class="panel empty">Sem estatísticas detalhadas para este jogo.</div>'}</div>`;
}

const TENNIS_STAT = {
  aces: 'Ases', double_faults: 'Duplas faltas', first_serve_pct: '1.º serviço (%)', first_serve_won_pct: 'Pontos ganhos no 1.º serviço (%)',
  second_serve_won_pct: 'Pontos ganhos no 2.º serviço (%)', break_points_saved_pct: 'Break points salvos (%)',
};

function trackerView(e) {
  const m = state.match;
  const note = m.es ? (m.streaming ? '' : '<p class="muted">A aguardar dados de posição deste jogo…</p>')
    : '<p class="muted">Tracker indisponível para este jogo (sem cobertura ao vivo do fornecedor).</p>';
  const lines = `
    <rect x="0" y="0" width="105" height="68" class="pitch-grass"/>
    <rect x="0.5" y="0.5" width="104" height="67" class="pitch-line"/>
    <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" class="pitch-line"/>
    <circle cx="52.5" cy="34" r="9.15" class="pitch-line"/><circle cx="52.5" cy="34" r="0.5" class="pitch-spot"/>
    <rect x="0.5" y="13.85" width="16.5" height="40.3" class="pitch-line"/><rect x="88" y="13.85" width="16.5" height="40.3" class="pitch-line"/>
    <rect x="0.5" y="24.85" width="5.5" height="18.3" class="pitch-line"/><rect x="99" y="24.85" width="5.5" height="18.3" class="pitch-line"/>
    <circle cx="11" cy="34" r="0.5" class="pitch-spot"/><circle cx="94" cy="34" r="0.5" class="pitch-spot"/>`;
  return `<div class="panel tracker">
    <div class="tracker-head"><span>${sideBadge(e, 'home', 'mini')}${esc(e.home)}</span><span id="trackerSituation" class="tracker-situation">—</span><span>${esc(e.away)}${sideBadge(e, 'away', 'mini')}</span></div>
    <svg class="pitch" viewBox="0 0 105 68" role="img" aria-label="Campo com a posição da bola">
      ${lines}
      <rect id="zoneHome" x="52.5" y="0.5" width="52" height="67" class="zone zone-home"/>
      <rect id="zoneAway" x="0.5" y="0.5" width="52" height="67" class="zone zone-away"/>
      <g id="ballTrail"></g>
      <circle id="ball" cx="52.5" cy="34" r="1.6" class="ball"/>
    </svg>
    <p id="trackerCommentary" class="tracker-commentary"></p>
    ${note}
    <h3>Ações recentes</h3><div id="trackerActions" class="tracker-actions"></div>
  </div>`;
}

function afterMatchRender() {
  // Bar widths are data, set through the CSSOM (the CSP forbids inline styles).
  if (state.match.data?.sport === 'tenis') updateServe(state.match.data);
  $$('#content [data-w]').forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.w) || 0))}%`; });
  if (state.match.tab === 'tracker') {
    updateTracker();
    updateActionsList();
  }
}

function updateTracker() {
  const ball = $('#ball');
  if (!ball) return;
  const b = state.match.ball;
  const svgNS = 'http://www.w3.org/2000/svg';
  if (b && b.x !== null && b.x !== undefined) {
    ball.setAttribute('cx', String((b.x / 100) * 105));
    ball.setAttribute('cy', String((b.y / 100) * 68));
  }
  const trail = $('#ballTrail');
  if (trail) {
    trail.replaceChildren(...state.match.trail.map((p, i, arr) => {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', String((p.x / 100) * 105));
      c.setAttribute('cy', String((p.y / 100) * 68));
      c.setAttribute('r', '0.9');
      c.setAttribute('class', 'trail');
      c.setAttribute('opacity', String(((i + 1) / arr.length) * 0.5));
      return c;
    }));
  }
  const side = b?.side;
  $('#zoneHome')?.classList.toggle('on', side === 'home');
  $('#zoneAway')?.classList.toggle('on', side === 'away');
  const sit = $('#trackerSituation');
  if (sit) {
    sit.textContent = b?.situation ? (SITUATION_LABEL[b.situation] || b.situation) : '—';
    sit.className = `tracker-situation ${b?.situation === 'dangerous_attack' || b?.situation === 'goal' ? 'hot' : ''}`;
  }
  const com = $('#trackerCommentary');
  if (com) com.textContent = b?.commentary || '';
}

function updateActionsList() {
  const box = $('#trackerActions');
  if (!box) return;
  const e = state.match.data;
  const items = [...state.match.actions].reverse().slice(0, 10);
  box.innerHTML = items.length
    ? items.map((a) => `<div class="incident ${a.team || ''}"><span class="inc-min">${a.minute ?? ''}'</span><span>${esc(ACTION_LABEL[a.type] || String(a.type || '').replaceAll('_', ' '))}</span>
      <span class="muted">${esc(a.player || '')}${a.team ? ` · ${esc(a.team === 'home' ? e?.home : e?.away)}` : ''}</span></div>`).join('')
    : '<p class="muted">Sem ações detalhadas para este jogo.</p>';
}

async function init() {
  bindChrome();
  autoMode();
  renderSlip();
  const [config] = await Promise.all([api('/api/config').catch(() => null), refreshMe()]);
  state.config = config;
  if (config) $('#stake').min = config.minStake;
  // A game left open when the tab was closed: bring that balance back now.
  if (state.user?.casinoActive && !(currentRoute().page === 'casino' && currentRoute().sub === 'jogar')) closeCasino();
  render();
  loadCasino({ reset: true });
  await refreshEvents();
  // Live events refresh every 10s; the rest of the board rides along.
  setInterval(() => { if (!document.hidden) refreshEvents(); }, 10_000);
  // Keep the balance fresh (settlements happen server-side).
  setInterval(() => { if (!document.hidden && state.user) refreshMe(); }, 60_000);
}

init();
