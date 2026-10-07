// Bet62 frontend — vanilla JS single-page app talking to the JSON API in /server.

const SPORT_META = {
  futebol: { name: 'Futebol', icon: '⚽' },
  basquetebol: { name: 'Basquetebol', icon: '🏀' },
  tenis: { name: 'Ténis', icon: '🎾' },
  hoquei: { name: 'Hóquei no Gelo', icon: '🏒' },
  dardos: { name: 'Dardos', icon: '🎯' },
  esports: { name: 'CS2 (eSports)', icon: '🎮' },
  voleibol: { name: 'Voleibol', icon: '🏐' },
  andebol: { name: 'Andebol', icon: '🤾' },
  futsal: { name: 'Futsal', icon: '⚽' },
  tenismesa: { name: 'Ténis de mesa', icon: '🏓' },
  badminton: { name: 'Badminton', icon: '🏸' },
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
    const v = JSON.parse(localStorage.getItem('bet62_slip') || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function saveSlip() {
  try { localStorage.setItem('bet62_slip', JSON.stringify(state.slip)); } catch { /* storage unavailable */ }
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

// In play, a favourite this short means the main market is as good as gone: the other markets are the bet.
const SHORT_FAVOURITE = 1.05;

function oddsButtons(e, { labels = 'code' } = {}) {
  const sels = e.selections;
  if (e.status === 'live') {
    const open = sels.filter((s) => s.active);
    const mainGone = !open.length || open.length < sels.length || open.some((s) => s.odds <= SHORT_FAVOURITE);
    // Main market closed or not worth it (a big lead), other markets open: straight to them.
    if (mainGone && e.marketCount > 0) return `<a class="odds-state bet-now" href="#/jogo/${e.id}">Aposte já</a>`;
    // Nothing open (goal, penalty, card, VAR…): suspended until the book reopens.
    if (!open.length) return '<div class="odds-state suspended" aria-disabled="true">Suspenso</div>';
  }
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
function teamBadge(logo, name, size = '', fallback = null) {
  const cls = `team-icon${size ? ` ${size}` : ''}`;
  const mini = size.split(' ').includes('mini');
  if (!logo) return `<div class="${cls}">${esc(mini ? initials(name).slice(0, 1) : initials(name))}</div>`;
  return `<div class="${cls} has-logo" data-initials="${esc(initials(name))}"><img class="team-logo" src="${esc(logo)}" alt="" loading="lazy"${fallback ? ` data-fallback="${esc(fallback)}"` : ''}></div>`;
}

// Flags as images (Windows does not draw flag emoji). The provider uses non-ISO codes for the
// home nations (darts): EN England, SX Scotland, WA/WL Wales.
const FLAG_CODE = { EN: 'gb-eng', SX: 'gb-sct', WA: 'gb-wls', WL: 'gb-wls' };
const flagUrl = (cc) => {
  const code = String(cc || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/w80/${FLAG_CODE[code] || code.toLowerCase()}.png`;
};
const flagImg = (cc) => (flagUrl(cc) ? `<img class="flag-img" src="${esc(flagUrl(cc))}" alt="${esc(cc)}" title="${esc(cc)}" loading="lazy">` : '');

/** Club badge or player photo; for players, the country flag when there is no photo. */
function sideBadge(e, side, size = '') {
  const flag = flagUrl(e[`${side}Country`]);
  const logo = e[`${side}Logo`];
  if (!logo && flag) return teamBadge(flag, e[side], `${size} flag`.trim());
  return teamBadge(logo, e[side], flag ? `${size} player`.trim() : size, flag);
}

function matchCard(e) {
  return `<article class="match-card clickable" data-open="${e.id}">
    <div class="match-top"><span>${esc(e.competition)}</span><span>${e.status === 'live' ? (e.sport === 'tenis' ? `<span class="tn-cell">${tennisLiveCell(e)}</span>` : liveClock(e)) : esc(fmtWhen(e.startTime))}</span></div>
    <div class="teams">
      <div class="team">${sideBadge(e, 'home')}${esc(e.home)}</div>
      <div class="vs">${e.status === 'live' ? `<b>${e.homeScore ?? 0}-${e.awayScore ?? 0}</b>` : 'VS'}</div>
      <div class="team">${sideBadge(e, 'away')}${esc(e.away)}</div>
    </div>
    ${oddsButtons(e)}
  </article>`;
}

/** In play: the match time in red after a pulsing dot (45', S1, Q3, P2…) instead of "AO VIVO". */
function liveClock(e) {
  const text = e.sport === 'tenis' ? `S${e.tennis?.set || 1}` : e.clock || 'Ao vivo';
  return `<span class="live-clock"><i class="pulse-dot"></i>${esc(text)}</span>`;
}

/** Tennis in play: "S2" and the point (15 / 30 / 40 / AD) under it. */
function tennisLiveCell(e) {
  const t = e.tennis || {};
  const pts = tennisPoints(t.point);
  return `${liveClock(e)}<span class="tn-point">${pts ? `${esc(pts[0])} - ${esc(pts[1])}` : ''}</span>`;
}

/** Per-player tennis line: sets won, games in the current set and the point, with the server marked. */
function tennisSide(e, side) {
  const t = e.tennis || {};
  const i = side === 'home' ? 0 : 1;
  const cur = (t.sets || [])[(t.sets || []).length - 1];
  const pts = tennisPoints(t.point);
  return `<span class="tn-line">${t.server === side ? '<i class="tn-serve" title="Ao serviço"></i>' : ''}<b>${side === 'home' ? e.homeScore ?? 0 : e.awayScore ?? 0}</b>${cur ? `<em>${cur[i]}</em>` : ''}${pts ? `<strong>${esc(pts[i])}</strong>` : ''}</span>`;
}

function liveCard(e) {
  if (e.sport === 'tenis') {
    return `<article class="live-card clickable" data-open="${e.id}">
    <div class="match-top"><span class="tn-cell">${tennisLiveCell(e)}</span><span>${esc(e.competition)}</span></div>
    <div class="live-teams"><div><span>${sideBadge(e, 'home', 'mini')}${esc(e.home)}</span>${tennisSide(e, 'home')}</div><div><span>${sideBadge(e, 'away', 'mini')}${esc(e.away)}</span>${tennisSide(e, 'away')}</div></div>
    ${oddsButtons(e, { labels: 'name' })}
  </article>`;
  }
  return `<article class="live-card clickable" data-open="${e.id}">
    <div class="match-top">${liveClock(e)}<span>${esc(e.competition)}</span></div>
    <div class="live-teams"><div><span>${sideBadge(e, 'home', 'mini')}${esc(e.home)}</span><b>${e.homeScore ?? 0}</b></div><div><span>${sideBadge(e, 'away', 'mini')}${esc(e.away)}</span><b>${e.awayScore ?? 0}</b></div></div>
    ${oddsButtons(e, { labels: 'name' })}
  </article>`;
}

function eventRow(e) {
  const tennisLive = e.status === 'live' && e.sport === 'tenis';
  const when = e.status === 'live'
    ? (tennisLive ? `<span class="tn-cell">${tennisLiveCell(e)}</span>` : liveClock(e))
    : esc(fmtWhen(e.startTime)).replace(' ', '<br>');
  const score = (side) => (tennisLive ? tennisSide(e, side === 'h' ? 'home' : 'away')
    : e.status === 'live' ? `<b>${side === 'h' ? e.homeScore ?? 0 : e.awayScore ?? 0}</b>` : '');
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
  const ordered = [...events].sort((a, b) => (sportRank(a.sport) - sportRank(b.sport)) || byPriority(a, b));
  for (const e of ordered) {
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
    <div><strong class="brand-word small">BET<span>62</span></strong><p>Apostas desportivas, ao vivo e casino num único lugar.</p><p>Pagamentos: MB WAY · Multibanco · Cartão</p></div>
    <div><strong>Apostas</strong><a href="#/desporto">Desporto</a><a href="#/ao-vivo">Ao Vivo</a><a href="#/desporto/resultados">Resultados</a><a href="#/casino">Casino</a></div>
    <div><strong>A minha conta</strong><a href="#/perfil/carteira">Carteira</a><a href="#/perfil/apostas">As minhas apostas</a><a href="#/perfil">Dados pessoais</a></div>
    <div><strong>Informações</strong><a href="#/perfil/jogo-responsavel">Jogo responsável</a><a href="#/promocoes">Promoções</a></div>
    <div class="copyright"><span>© ${new Date().getFullYear()} Bet62${state.config?.version ? ` · versão ${esc(state.config.version)}` : ''}</span><span><span class="age">18+</span>Proibido a menores de 18 anos. Jogue com responsabilidade.</span></div>
  </footer>`;
}

// ---------- pages ----------

// Sports in the order the site shows them: football always first.
const SPORT_ORDER = ['futebol', 'tenis', 'basquetebol', 'hoquei', 'voleibol', 'andebol', 'futsal', 'tenismesa', 'badminton', 'dardos', 'esports'];
const sportRank = (s) => { const i = SPORT_ORDER.indexOf(s); return i < 0 ? 99 : i; };

/** Featured by the operator first, then big leagues (tier), then the earliest. */
const byPriority = (a, b) => (b.featured - a.featured) || ((a.tier ?? 9) - (b.tier ?? 9)) || a.startTime.localeCompare(b.startTime);

/**
 * Home page highlights: big-league football first (all of it, up to the limit), then the best
 * event of each other sport, big leagues first. Without big-league football, the best football
 * matches still lead. Only events with odds are listed.
 */
function pickHighlights(events, limit = 12) {
  const out = [];
  const add = (e) => { if (e && out.length < limit && !out.includes(e)) out.push(e); };
  const pool = [...events].sort(byPriority);
  pool.filter((e) => e.featured).forEach(add);
  const football = pool.filter((e) => e.sport === 'futebol');
  const bigFootball = football.filter((e) => e.tier <= 2);
  (bigFootball.length ? bigFootball : football.slice(0, 3)).forEach(add);
  const others = [...new Set(pool.map((e) => e.sport))].filter((sp) => sp !== 'futebol').sort((a, b) => sportRank(a) - sportRank(b));
  for (const sp of others) add(pool.find((e) => e.sport === sp));
  // Room left and big leagues elsewhere: more of them.
  pool.filter((e) => e.tier <= 2).forEach(add);
  return out;
}

function carousel(id, cards) {
  return `<div class="carousel" id="${id}">
    <button class="car-btn prev" data-action="car-prev" data-target="${id}" aria-label="Anterior">‹</button>
    <div class="car-track">${cards.join('')}</div>
    <button class="car-btn next" data-action="car-next" data-target="${id}" aria-label="Seguinte">›</button>
  </div>`;
}

function homePage() {
  const live = pickHighlights(state.events.filter((e) => e.status === 'live'));
  const upcoming = pickHighlights(state.events.filter((e) => e.status === 'scheduled'));
  const hero = state.user
    ? `<div class="eyebrow">BEM-VINDO DE VOLTA</div><h1>Olá, ${esc(state.user.name.split(' ')[0])}.</h1><p>O seu saldo é <strong>${money(state.user.balance)}</strong>. Escolha um jogo e faça a sua aposta.</p>
       <div class="hero-actions"><a class="primary-btn" href="#/desporto">Explorar desporto</a><a class="outline-btn" href="#/perfil/carteira">Carteira</a></div>`
    : `<div class="eyebrow">A NOVA EXPERIÊNCIA DE APOSTAS</div><h1>Mais mercados.<br>Mais emoção.</h1><p>Uma plataforma clássica, rápida e simples para acompanhar desporto, apostas ao vivo e casino num único lugar.</p>
       <div class="hero-actions"><button class="primary-btn" data-action="register">Criar conta</button><a class="outline-btn" href="#/desporto">Explorar desporto</a></div>`;
  return `<section class="hero"><div class="hero-copy">${hero}</div></section>
    ${live.length ? `<section class="section"><div class="section-head"><h2><span class="live-dot"></span>Ao Vivo agora</h2><a href="#/ao-vivo">Ver todos ›</a></div>${carousel('carLive', live.map(liveCard))}</section>` : ''}
    <section class="section"><div class="section-head"><h2>Eventos em destaque</h2><a href="#/desporto">Todos os eventos ›</a></div>
      ${upcoming.length ? carousel('carPre', upcoming.map(matchCard)) : emptyEvents()}</section>
    <section class="section"><div class="section-head"><h2>Casino</h2><a href="#/casino">Ver casino ›</a></div><div class="game-grid grid">${state.casino.enabled && state.casino.games.length ? state.casino.games.slice(0, 5).map(casinoGameCard).join('') : GAMES.slice(0, 5).map(gameCard).join('')}</div></section>
    ${footer()}`;
}

const emptyEvents = () => `<div class="panel empty">${state.eventsLoaded ? 'Sem eventos disponíveis de momento.' : 'A carregar eventos…'}</div>`;

function sportsPage(sub) {
  if (sub === 'resultados') return resultsPage();
  const sports = [...new Set(state.events.map((e) => e.sport))].sort((a, b) => sportRank(a) - sportRank(b));
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
  // Football first, then the other sports; big leagues first inside each sport.
  const sports = [...new Set(live.map((e) => e.sport))].sort((a, b) => sportRank(a) - sportRank(b));
  const blocks = sports.map((sp) => {
    const list = live.filter((e) => e.sport === sp).sort(byPriority);
    return `<section class="section"><div class="section-head"><h2>${SPORT_META[sp]?.icon || ''} ${esc(SPORT_META[sp]?.name || sp)} <small class="muted">${list.length}</small></h2></div>
      <div class="live-grid grid">${list.map(liveCard).join('')}</div></section>`;
  }).join('');
  return `<div class="page-title"><h1><span class="live-dot"></span>Ao Vivo</h1><p>Eventos a decorrer agora. As odds atualizam automaticamente.</p></div>
    ${live.length ? blocks : `<div class="panel empty">${state.eventsLoaded ? 'Não há eventos ao vivo neste momento.' : 'A carregar…'}</div>`}
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
      ${state.user?.role === 'admin' ? '<br><br><a class="mini-btn" href="/admin#casino">Diagnosticar em Administração → Casino</a>' : ''}</div>
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

/** Opens a game inside Bet62. The balance follows the player into the casino automatically. */
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
  return `<div class="page-title"><h1>Promoções</h1><p>Ofertas e campanhas da Bet62.</p></div>
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
    ${state.user.role === 'admin' ? '<a href="/admin">Administração</a>' : ''}<button data-action="logout">Terminar sessão</button></div>`;
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
    promocoes: promosPage, perfil: () => accountPage(sub), jogo: () => matchPage(sub),
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
    state.casinoTimer = setInterval(() => { if (!document.hidden && state.casinoSession?.url) refreshCasinoBalance(); }, 5_000);
  }
  document.body.classList.toggle('immersive', immersive);
  // Carousels keep their position when the page refreshes itself (odds, live scores).
  const carScroll = keepScroll ? $$('#content .carousel').map((c) => [c.id, $('.car-track', c).scrollLeft]) : [];
  $('#content').innerHTML = immersive ? casinoPlayPage() : (pages[page] || homePage)();
  for (const [id, left] of carScroll) { const t = $(`#${id} .car-track`); if (t) t.scrollLeft = left; }
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

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'close-modal') closeModal();
  else if (action === 'login') openAuth('login');
  else if (action === 'register') openAuth('register');
  else if (action === 'game') toast('Casino em integração', 'Os jogos ficam disponíveis com a ligação ao fornecedor de casino.');
  else if (action === 'car-prev' || action === 'car-next') {
    const track = $(`#${actionEl.dataset.target} .car-track`);
    if (track) track.scrollBy({ left: (action === 'car-next' ? 1 : -1) * Math.max(260, track.clientWidth * 0.85), behavior: 'smooth' });
  } else if (action === 'casino-more') {
    loadCasino();

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
  // No player photo: show the flag instead.
  if (img.dataset.fallback) {
    img.src = img.dataset.fallback;
    delete img.dataset.fallback;
    img.parentElement.classList.add('flag');
    return;
  }
  const box = img.parentElement;
  box.classList.remove('has-logo');
  box.classList.remove('flag');
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
  // The live widget sits above the slip on wide screens and inside the match page on narrow ones.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (currentRoute().page === 'jogo') mountLiveWidget(); }, 150);
  });
}

// ---------- match page (#/jogo/<id>): markets, statistics, 2D tracker, live stream ----------

const SITUATION_LABEL = {
  dangerous_attack: 'Ataque perigoso', attack: 'Ataque', possession: 'Posse de bola', safe: 'Posse segura',
  goal: 'GOLO!', corner: 'Canto', freekick: 'Livre', throwin: 'Lançamento lateral', offside: 'Fora de jogo',
  goalkeeper_saved: 'Defesa do guarda-redes', shotoffwoodwork: 'Bola no ferro',
  goalkick: 'Pontapé de baliza', penalty: 'Penálti', shot: 'Remate',
};
const INCIDENT_ICON = { goal: '⚽', yellow: '🟨', red: '🟥', sub: '🔁', var: '📺' };
const ACTION_LABEL = {
  pass: 'Passe', take_on: 'Drible', tackle: 'Desarme', interception: 'Interceção', save: 'Defesa', clearance: 'Alívio',
  miss: 'Remate ao lado', post: 'Bola no poste', attempt_saved: 'Remate defendido', goal: '⚽ Golo', temp_goal: 'Possível golo',
  temp_attempt: 'Remate', foul: 'Falta', out: 'Bola fora', corner_awarded: 'Canto', offside_pass: 'Fora de jogo', card: 'Cartão',
  player_off: 'Substituição (sai)', player_on: 'Substituição (entra)', ball_recovery: 'Recuperação', dispossessed: 'Perda de bola',
  aerial: 'Duelo aéreo', challenge: 'Disputa', keeper_pickup: 'Guarda-redes agarra', penalty_faced: 'Penálti', period_start: 'Início do período',
  period_end: 'Fim do período', deleted_event: 'Lance anulado', rescinded_card: 'Cartão anulado',
  shot_on_target: 'Remate à baliza', shot_off_target: 'Remate para fora', substitution: 'Substituição',
};

function leaveMatch() {
  const m = state.match;
  m.es?.close();
  clearInterval(m.timer);
  Object.assign(m, { id: null, data: null, extras: null, insights: null, tab: 'mercados', es: null, timer: null, ball: null, prevBall: null, actions: [], live: null, streaming: false, widget: null, widgetKind: null });
  $('#sideTracker')?.replaceChildren();
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
    m.prevBall = null;
    m.actions = (s.actions || []).slice(-15);
    updateTracker();
    updateActionsList();
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
  const clock = $('#matchClock span');
  if (clock) clock.textContent = d.clock || '';
  const w = state.match.widget;
  if (w && state.match.widgetKind === 'football') {
    $('#trkHomeScore', w).textContent = d.homeScore ?? 0;
    $('#trkAwayScore', w).textContent = d.awayScore ?? 0;
    $('#trkClock', w).textContent = d.clock || '';
  }
  if (scored && d.sport === 'futebol') {
    toast('Golo!', `${d.home} ${d.homeScore} - ${d.awayScore} ${d.away}`);
    loadMatch(d.id, { quiet: true }); // markets were suspended; fetch their new state
  } else if (scored && d.sport === 'tenis') toast('Set', `${d.home} ${d.homeScore} - ${d.awayScore} ${d.away}`);
  if (d.sport === 'tenis') {
    if (e.point !== undefined || e.sets) d.tennis = { set: e.sets?.length || d.tennis?.set || 1, point: e.point ?? null, server: e.server ?? null, sets: e.sets || d.tennis?.sets || [] };
    updateServe(d);
    updateTennisCourt();
    const cell = $('#matchTennis');
    if (cell) cell.innerHTML = tennisLiveCell(d);
  }
}

/** Tennis: who is serving, from the live frames. */
function updateServe(e) {
  $$('[data-serve]').forEach((el) => el.classList.toggle('serving', el.dataset.serve === e.server));
}

/**
 * Ball fixes arrive "attacking left→right" for the side in possession (provider docs), so on our
 * fixed pitch — home attacking left→right — an away fix is mirrored on both axes.
 */
function toPitch(p, side) {
  if (p?.x === null || p?.x === undefined || p?.y === null || p?.y === undefined) return null;
  const clamp = (v) => Math.max(1, Math.min(99, Number(v)));
  return side === 'away' ? { x: clamp(100 - p.x), y: clamp(100 - p.y) } : { x: clamp(p.x), y: clamp(p.y) };
}

function pushBall(d) {
  const m = state.match;
  const spot = toPitch(d, d.side);
  if (!spot) {
    m.ball = { ...(m.ball || {}), situation: d.situation, side: d.side, commentary: d.commentary };
    return;
  }
  m.prevBall = m.ball?.x !== undefined && m.ball?.x !== null ? { x: m.ball.x, y: m.ball.y } : null;
  m.ball = { ...d, ...spot };
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
    }, 5_000);
  }
  const e = m.data;
  if (!e) return '<div class="loading">A carregar o jogo…</div>';

  const live = e.status === 'live';
  const center = live
    ? `<div class="match-score" id="matchScore">${e.homeScore ?? 0} - ${e.awayScore ?? 0}</div>${e.sport === 'tenis' ? `<div class="tn-sets" id="matchClock"><span>${esc(e.clock || '')}</span></div>` : `<div class="live-clock big" id="matchClock"><i class="pulse-dot"></i><span>${esc(e.clock || 'Ao vivo')}</span></div>`}
       ${e.sport === 'tenis' ? `<div class="tn-cell tn-hero" id="matchTennis">${tennisLiveCell(e)}</div>` : ''}`
    : e.status === 'finished'
      ? `<div class="match-score">${e.homeScore} - ${e.awayScore}</div><div class="muted">Terminado</div>`
      : `<div class="match-kickoff">${esc(fmtWhen(e.startTime))}</div><div class="muted">${esc(new Date(e.startTime).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`;
  const football = e.sport === 'futebol';
  const tabs = [['mercados', 'Mercados'], ['estatisticas', 'Estatísticas'], ['h2h', 'Confrontos (H2H)'], ['previsao', 'Previsão']];
  const table = TABLE_TAB[e.sport];
  if (table && e.source !== 'manual') tabs.push(table);
  if (!tabs.some(([k]) => k === m.tab)) m.tab = 'mercados';

  let body = '';
  if (m.tab === 'estatisticas') body = football ? matchStatsView(e) : sportStatsView(e);
  else if (m.tab === 'h2h') body = insightView(e, h2hView);
  else if (m.tab === 'previsao') body = insightView(e, predictionView);
  else if (m.tab === 'classificacao') body = insightView(e, standingsView);
  else if (m.tab === 'ranking') body = insightView(e, rankingView);
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
    <div id="trackerInline" class="tracker-inline"></div>
    <div class="match-tabs">${tabs.map(([k, l]) => `<button class="${m.tab === k ? 'active' : ''}" data-match-tab="${k}">${l}</button>`).join('')}</div>
    <div class="match-body">${body}</div>
    ${footer()}`;
}

function marketsView(e) {
  if (!e.markets?.length) {
    return `<div class="panel empty">${e.status === 'live' ? '<span class="odds-state suspended">Suspenso</span>' : 'Ainda não há mercados para este jogo.'}</div>`;
  }
  const locked = !isOpen(e);
  const btn = (s, label = s.label) => {
    const off = locked || !s.active;
    return `<button class="odd-btn market-odd${inSlip(s.id) ? ' selected' : ''}${off ? ' locked' : ''}" data-sel="${s.id}" ${off ? 'disabled' : ''}>
      <small>${esc(label)}</small>${off ? '🔒' : fmtOdds(s.odds)}</button>`;
  };
  return e.markets.map((mk) => {
    let grid;
    // Period markets carry "<n>:" before the code (set / half); the grids work on the code after it.
    const bare = (s) => s.code.replace(/^\d:/, '');
    if (mk.market === 'ou' || mk.market === 'gou' || mk.market === 'pou') {
      const unit = mk.market === 'gou' || (mk.market === 'pou' && e.sport === 'tenis') ? 'jogos'
        : { tenis: 'sets', basquetebol: 'pontos', dardos: 'legs', esports: 'mapas' }[e.sport] || 'golos';
      const lines = [...new Set(mk.selections.map((s) => bare(s).slice(1)))].sort((a, b) => a - b);
      grid = lines.map((line) => {
        const over = mk.selections.find((s) => bare(s) === `O${line}`);
        const under = mk.selections.find((s) => bare(s) === `U${line}`);
        return `<div class="market-line"><span class="market-line-label">${esc(line)} ${unit}</span>
          <div class="odds two">${over ? btn(over, 'Mais') : '<span></span>'}${under ? btn(under, 'Menos') : '<span></span>'}</div></div>`;
      }).join('');
    } else if (mk.market === 'hcp' || mk.market === 'ghcp' || mk.market === 'phcp') {
      // One row per line: player 1 with the line, player 2 with the opposite one.
      const rows = [...new Set(mk.selections.filter((s) => bare(s)[0] === '1').map((s) => bare(s).slice(1)))];
      grid = rows.map((line) => {
        const one = mk.selections.find((s) => bare(s) === `1${line}`);
        const two = mk.selections.find((s) => bare(s) === (/^[+-]0$/.test(line) ? '2+0' : `2${line[0] === '-' ? '+' : '-'}${line.slice(1)}`));
        return `<div class="odds two">${one ? btn(one) : '<span></span>'}${two ? btn(two) : '<span></span>'}</div>`;
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
      ${r.rows.map((p) => `<tr class="${ours.includes(p.playerId) ? 'highlight' : ''}"><td class="pos">${p.position ?? ''}</td><td>${flagImg(p.country)} ${esc(p.player)}</td><td class="num">${(p.points ?? 0).toLocaleString('pt-PT')}</td></tr>`).join('')}
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

// ---------- live widget: football mini-pitch / tennis court ----------
// Lives above the bet slip on wide screens (between the top menu and the slip) and above the
// tabs of the match page on narrow ones. One node per match, moved between the two slots, so
// the ball keeps animating across re-renders.

const BALL_SVG = `<svg viewBox="0 0 64 64" class="trk-ball-svg" aria-hidden="true">
  <defs><radialGradient id="trkBallShade" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.7" stop-color="#eceff3"/><stop offset="1" stop-color="#aab1bb"/></radialGradient></defs>
  <circle cx="32" cy="32" r="30" fill="url(#trkBallShade)" stroke="#1b1f24" stroke-width="2"/>
  <polygon points="32,21 42.5,28.6 38.5,41 25.5,41 21.5,28.6" fill="#15181c"/>
  <polygon points="32,3 40,8.5 37,17 27,17 24,8.5" fill="#15181c"/>
  <polygon points="58,24 60.5,33.5 54,40 47.5,33 50,24.5" fill="#15181c"/>
  <polygon points="47,55 38,60.5 32,57 35,49 44.5,48" fill="#15181c"/>
  <polygon points="17,55 26,60.5 32,57 29,49 19.5,48" fill="#15181c"/>
  <polygon points="6,24 3.5,33.5 10,40 16.5,33 14,24.5" fill="#15181c"/>
  <path d="M32 21V17M42.5 28.6L50 24.5M38.5 41L44.5 48M25.5 41L19.5 48M21.5 28.6L14 24.5" stroke="#1b1f24" stroke-width="1.6"/>
</svg>`;

function footballWidget(e) {
  const flags = ['tl', 'tr', 'bl', 'br'].map((c) => `<i class="trk-corner c-${c}"></i><i class="trk-flag f-${c}"></i>`).join('');
  return `<div class="trk" data-kind="football">
    <div class="trk-head"><span class="trk-team"><i class="trk-dot home"></i>${esc(e.home)}</span>
      <span class="trk-score"><b id="trkHomeScore">${e.homeScore ?? 0}</b><span>-</span><b id="trkAwayScore">${e.awayScore ?? 0}</b><small id="trkClock">${esc(e.clock || '')}</small></span>
      <span class="trk-team away">${esc(e.away)}<i class="trk-dot away"></i></span></div>
    <div class="trk-turf"><div class="trk-pitch" id="trkPitch">
      <div class="trk-arrow" id="trkArrow"></div>
      <i class="trk-half"></i><i class="trk-circle"></i><i class="trk-spot"></i>
      <i class="trk-box l"></i><i class="trk-box r"></i><i class="trk-six l"></i><i class="trk-six r"></i>
      <i class="trk-pen l"></i><i class="trk-pen r"></i><i class="trk-arc l"></i><i class="trk-arc r"></i>
      ${flags}
      <div class="trk-goal l"><i></i></div><div class="trk-goal r"><i></i></div>
      <div class="trk-trails" id="trkTrails"></div>
      <div class="trk-ball" id="trkBall">${BALL_SVG}</div>
      <div class="trk-badge" id="trkBadge"><i class="trk-badge-bar"></i><div><b id="trkBadgeTeam"></b><small id="trkBadgeText"></small></div></div>
    </div></div>
    <p class="trk-note" id="trkNote"></p>
    <div class="trk-actions" id="trackerActions"></div>
  </div>`;
}

function tennisWidget(e) {
  return `<div class="trk" data-kind="tennis">
    <div class="trk-head"><span class="trk-team">${sideBadge(e, 'home', 'mini')}${esc(e.home)}</span>
      <span class="trk-score"><b id="trkSetLabel">S1</b><small id="trkPoint">—</small></span>
      <span class="trk-team away">${esc(e.away)}${sideBadge(e, 'away', 'mini')}</span></div>
    <div class="court-wrap"><div class="court" id="trkCourt">
      <i class="court-alley top"></i><i class="court-alley bottom"></i><i class="court-service l"></i><i class="court-service r"></i>
      <i class="court-center l"></i><i class="court-center r"></i><i class="court-net"></i>
      <div class="court-ball" id="trkTennisBall"></div>
    </div></div>
    <div class="court-sets" id="trkSets"></div>
    <p class="trk-note">A bola marca quem serve e de que lado do campo (pares/ímpares de pontos).</p>
  </div>`;
}

/** Mounts / moves the widget for the current match into the right slot. */
function mountLiveWidget() {
  const m = state.match;
  const e = m.data;
  const kind = e?.status === 'live' ? (e.liveTracker ? 'football' : e.sport === 'tenis' ? 'tennis' : null) : null;
  if (!kind) {
    m.widget?.remove();
    m.widget = null;
    return;
  }
  if (!m.widget || m.widgetKind !== kind) {
    m.widget?.remove();
    const holder = document.createElement('div');
    holder.innerHTML = kind === 'football' ? footballWidget(e) : tennisWidget(e);
    m.widget = holder.firstElementChild;
    m.widgetKind = kind;
  }
  const wide = window.matchMedia('(min-width: 1001px)').matches;
  const slot = wide ? $('#sideTracker') : $('#trackerInline');
  if (slot && m.widget.parentElement !== slot) slot.replaceChildren(m.widget);
  if (kind === 'football') { updateTracker({ instant: true }); updateActionsList(); } else updateTennisCourt();
}

function afterMatchRender() {
  // Bar widths are data, set through the CSSOM (the CSP forbids inline styles).
  if (state.match.data?.sport === 'tenis') updateServe(state.match.data);
  $$('#content [data-w]').forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.w) || 0))}%`; });
  mountLiveWidget();
}

const DANGER = new Set(['dangerous_attack', 'corner', 'goal', 'freekick', 'shotoffwoodwork', 'goalkeeper_saved']);

function updateTracker({ instant = false } = {}) {
  const m = state.match;
  const w = m.widget;
  if (!w || m.widgetKind !== 'football') return;
  const e = m.data;
  $('#trkHomeScore', w).textContent = e.homeScore ?? 0;
  $('#trkAwayScore', w).textContent = e.awayScore ?? 0;
  $('#trkClock', w).textContent = e.clock || '';
  const b = m.ball;
  const note = $('#trkNote', w);
  note.textContent = m.es ? (m.streaming ? (b?.commentary || '') : 'A aguardar dados de posição deste jogo…')
    : 'Posição da bola indisponível (jogo sem cobertura ao vivo do fornecedor).';
  const ball = $('#trkBall', w);
  const arrow = $('#trkArrow', w);
  const badge = $('#trkBadge', w);
  if (!b || b.x === undefined || b.x === null) {
    ball.classList.add('idle');
    arrow.style.clipPath = 'polygon(0 0, 0 0, 0 0)';
    badge.classList.remove('on');
    return;
  }
  ball.classList.remove('idle');
  ball.classList.toggle('instant', instant);
  ball.style.left = `${b.x}%`;
  ball.style.top = `${b.y}%`;

  // Momentum arrow: from the attacking side's own goal line to the ball, stronger when dangerous.
  const side = b.side === 'away' ? 'away' : 'home';
  const danger = DANGER.has(b.situation);
  const depth = side === 'home' ? b.x : 100 - b.x;
  const tier = danger ? 'danger' : depth > 60 ? 'attacking' : 'neutral';
  const near = side === 'home' ? 0 : 100;
  const dir = b.x >= near ? 1 : -1;
  const body = dir === 1 ? Math.max(near, b.x - 6) : Math.min(near, b.x + 6);
  arrow.style.clipPath = `polygon(${near}% 0%, ${body}% 0%, ${b.x}% 50%, ${body}% 100%, ${near}% 100%)`;
  arrow.className = `trk-arrow ${side} ${tier}`;

  // Situation badge floating near the ball.
  badge.classList.add('on');
  badge.classList.toggle('away', side === 'away');
  badge.classList.toggle('hot', danger);
  $('#trkBadgeTeam', w).textContent = side === 'away' ? e.away : e.home;
  $('#trkBadgeText', w).textContent = SITUATION_LABEL[b.situation] || (b.situation ? String(b.situation).replaceAll('_', ' ') : 'Em jogo');
  badge.style.left = `${Math.min(78, Math.max(22, b.x))}%`;
  badge.style.top = `${b.y > 55 ? Math.max(14, b.y - 22) : Math.min(86, b.y + 22)}%`;

  // Fading trail behind the ball, from where it was to where it is (a comet that dissolves).
  const from = m.prevBall;
  if (!instant && from) {
    const pitch = $('#trkPitch', w).getBoundingClientRect();
    const dx = ((b.x - from.x) / 100) * pitch.width;
    const dy = ((b.y - from.y) / 100) * pitch.height;
    const len = Math.hypot(dx, dy);
    if (len > 6) {
      const trail = document.createElement('i');
      trail.className = `trk-trail ${danger ? 'hot' : ''}`;
      trail.style.left = `${from.x}%`;
      trail.style.top = `${from.y}%`;
      trail.style.width = `${len}px`;
      trail.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      const box = $('#trkTrails', w);
      box.append(trail);
      while (box.children.length > 4) box.firstElementChild.remove();
      trail.addEventListener('animationend', () => trail.remove());
    }
  }
  m.prevBall = null;
}

function updateActionsList() {
  const box = state.match.widget && $('#trackerActions', state.match.widget);
  if (!box) return;
  const e = state.match.data;
  const items = [...state.match.actions].reverse().slice(0, 4);
  box.innerHTML = items.map((a) => `<div class="trk-action ${a.team || ''}"><span>${a.minute ?? ''}'</span><b>${esc(ACTION_LABEL[a.type] || String(a.type || '').replaceAll('_', ' '))}</b>
    <small>${esc(a.player || (a.team === 'home' ? e?.home : a.team === 'away' ? e?.away : ''))}</small></div>`).join('');
}

const POINT_VALUE = { 0: 0, 15: 1, 30: 2, 40: 3, A: 4, AD: 4 };
/** Tennis point as shown to the user: 15 / 30 / 40 / AD. */
const fmtPoint = (p) => (String(p).toUpperCase() === 'A' ? 'AD' : String(p));

function tennisPoints(point) {
  const [h, a] = String(point || '').split('-').map((x) => x.trim());
  return h === undefined || a === undefined || h === '' ? null : [fmtPoint(h), fmtPoint(a)];
}

function updateTennisCourt() {
  const m = state.match;
  const w = m.widget;
  if (!w || m.widgetKind !== 'tennis') return;
  const t = m.data.tennis || {};
  const pts = tennisPoints(t.point);
  $('#trkSetLabel', w).textContent = `S${t.set || 1}`;
  $('#trkPoint', w).textContent = pts ? `${pts[0]} - ${pts[1]}` : '—';
  $('#trkSets', w).innerHTML = (t.sets || []).map(([h, a], i) => `<span class="${i === (t.sets.length - 1) ? 'cur' : ''}"><small>S${i + 1}</small>${h}-${a}</span>`).join('');
  const ball = $('#trkTennisBall', w);
  if (!t.server) { ball.classList.add('idle'); return; }
  // Server at their baseline; deuce court after an even number of points, ad court after odd.
  const raw = String(t.point || '0-0').split('-').map((x) => x.trim().toUpperCase());
  const played = raw.reduce((n, p) => n + (POINT_VALUE[p] ?? (Number(p) || 0)), 0);
  const deuce = played % 2 === 0;
  const home = t.server === 'home';
  ball.classList.remove('idle');
  ball.style.left = home ? '3%' : '97%';
  // Facing the net from the left, the right-hand (deuce) court is the bottom half; from the right, the top.
  ball.style.top = home ? (deuce ? '70%' : '30%') : (deuce ? '30%' : '70%');
}

async function init() {
  bindChrome();
  autoMode();
  renderSlip();
  const [config] = await Promise.all([api('/api/config').catch(() => null), refreshMe()]);
  state.config = config;
  // A new deploy changes the version: reload once so nobody keeps an old page open for hours.
  setInterval(async () => {
    try {
      const c = await api('/api/config');
      if (state.config?.version && c.version && c.version !== state.config.version && !state.casinoSession) window.location.reload();
    } catch { /* offline for a moment */ }
  }, 5 * 60_000);
  if (config) $('#stake').min = config.minStake;
  // A game left open when the tab was closed: bring that balance back now.
  if (state.user?.casinoActive && !(currentRoute().page === 'casino' && currentRoute().sub === 'jogar')) closeCasino();
  render();
  loadCasino({ reset: true });
  await refreshEvents();
  // Live events refresh every 10s; the rest of the board rides along.
  setInterval(() => { if (!document.hidden) refreshEvents(); }, 5_000);
  // Keep the balance fresh (settlements happen server-side).
  setInterval(() => { if (!document.hidden && state.user) refreshMe(); }, 60_000);
}

init();
