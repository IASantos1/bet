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
  bet: 'Aposta', payout: 'Prémio', refund: 'Reembolso', bonus_convert: 'Bónus convertido', chargeback: 'Depósito revertido',
  cashout: 'Cash out', casino_bet: 'Casino (aposta)', casino_win: 'Casino (ganho)', free_spin_win: 'Ganhos de Free Spins',
};
const STATUS_LABEL = {
  open: 'Em aberto', won: 'Ganha', lost: 'Perdida', void: 'Anulada', cashout: 'Cash out', pending: 'Pendente', approved: 'Aprovado',
  rejected: 'Rejeitado', scheduled: 'Agendado', live: 'Ao vivo', finished: 'Terminado', cancelled: 'Cancelado',
};

const state = {
  user: null,
  config: null,
  events: [],
  eventsLoaded: false,
  casino: { enabled: false, games: [], providers: [], loaded: false },
  casinoFilter: { provider: '', category: '', q: '' },
  casinoSession: null, casinoGame: null,
  liveTv: false, liveSport: '',
  leagueTree: null, sideOpen: {}, leagueView: null,
  match: { id: null, data: null, extras: null, tab: 'mercados', cat: 'todos', view: 'tracker', es: null, timer: null, ball: null, trail: [], actions: [], live: null, streaming: false },
  slip: loadSlip(), builder: loadBuilder(), featured: null,
  promos: null, campaigns: null, freebetId: null,
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
  try {
    localStorage.setItem('bet62_slip', JSON.stringify(state.slip));
    if (state.builder) localStorage.setItem('bet62_builder', JSON.stringify(state.builder)); else localStorage.removeItem('bet62_builder');
  } catch { /* storage unavailable */ }
}
function loadBuilder() {
  try { const v = JSON.parse(localStorage.getItem('bet62_builder') || 'null'); return v && Array.isArray(v.legs) ? v : null; } catch { return null; }
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

// Sidebar countries (names as the league tree has them) → flag codes; regions get an icon instead.
const COUNTRY_FLAG = {
  argentina: 'ar', australia: 'au', austria: 'at', belgium: 'be', brazil: 'br', canada: 'ca', chile: 'cl', colombia: 'co',
  'czech republic': 'cz', denmark: 'dk', ecuador: 'ec', england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', finland: 'fi',
  france: 'fr', germany: 'de', greece: 'gr', israel: 'il', italy: 'it', japan: 'jp', mexico: 'mx', netherlands: 'nl', norway: 'no',
  paraguay: 'py', peru: 'pe', poland: 'pl', portugal: 'pt', romania: 'ro', serbia: 'rs', 'south korea': 'kr', spain: 'es',
  sweden: 'se', switzerland: 'ch', turkey: 'tr', 'united states': 'us', uruguay: 'uy', ireland: 'ie', croatia: 'hr',
  ukraine: 'ua', russia: 'ru', china: 'cn', 'saudi arabia': 'sa', egypt: 'eg', morocco: 'ma', bolivia: 'bo',
  venezuela: 've', iceland: 'is', hungary: 'hu', slovakia: 'sk', slovenia: 'si', bulgaria: 'bg', cyprus: 'cy', qatar: 'qa',
};
const REGION_ICON = { africa: '🌍', europe: '🌍', 'south america': '🌎', 'north america': '🌎', asia: '🌏', world: '🌐' };

/** A round flag for a sidebar country (or a globe for a continent / world competitions). */
function countryFlag(country) {
  const k = String(country || '').toLowerCase().trim();
  const code = COUNTRY_FLAG[k];
  if (code) return `<img class="side-flag" src="https://flagcdn.com/w40/${code}.png" alt="" loading="lazy">`;
  return `<span class="side-flag globe" aria-hidden="true">${REGION_ICON[k] || '🌐'}</span>`;
}

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

/** `insert` (html) goes right after the `after`-th event of the list (the block is split there). */
function groupByCompetition(events, { after = 0, insert = '' } = {}) {
  const groups = new Map();
  const ordered = [...events].sort((a, b) => (sportRank(a.sport) - sportRank(b.sport)) || byPriority(a, b));
  for (const e of ordered) {
    const key = `${e.sport}|${e.competition}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  let seen = 0;
  let pending = !!insert && after > 0;
  const html = [...groups.entries()].map(([key, list]) => {
    const [sport, comp] = key.split('|');
    const logo = list.find((e) => e.leagueLogo)?.leagueLogo;
    const icon = logo
      ? `<span class="league-logo" data-icon="${SPORT_META[sport]?.icon || '🏆'}"><img class="league-img" src="${esc(logo)}" alt="" loading="lazy"></span>`
      : `<span class="league-logo">${SPORT_META[sport]?.icon || '🏆'}</span>`;
    const head = (n) => `<div class="comp-head"><span class="comp-name">${icon}${esc(comp)}</span><span>${n}</span></div>`;
    if (pending && seen + list.length >= after) {
      const cut = after - seen;
      seen += list.length;
      pending = false;
      const rest = list.slice(cut);
      return `<div class="comp-block">${head(list.length)}${list.slice(0, cut).map(eventRow).join('')}</div>${insert}`
        + (rest.length ? `<div class="comp-block">${head(list.length)}${rest.map(eventRow).join('')}</div>` : '');
    }
    seen += list.length;
    return `<div class="comp-block">${head(list.length)}${list.map(eventRow).join('')}</div>`;
  }).join('');
  return pending ? html + insert : html;
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

// The home page's invitation card: a sentence, the link and the code, each with its copy button.
function affHomeHtml() {
  const a = state.affHome;
  if (!a?.enabled || !a.referralUrl || a.uid !== state.user?.id) return '';
  return `<section class="aff-home">
    <div class="aff-home-copy"><b>Convide amigos e ganhe ${a.commission.rate}% do primeiro depósito de cada um.</b>
      <span>Partilhe o seu link ou o seu código. <a href="#/perfil/afiliados">Ver regras e comissões ›</a></span></div>
    <div class="aff-home-fields">
      <label><small>Link</small><span class="aff-home-row"><input readonly value="${esc(a.referralUrl)}" aria-label="Link de convite"><button class="primary-btn" data-aff-copy="${esc(a.referralUrl)}" data-aff-label="Link copiado">Copiar</button></span></label>
      <label class="code"><small>Código</small><span class="aff-home-row"><input readonly value="${esc(a.referralCode)}" aria-label="Código de convite"><button class="outline-btn" data-aff-copy="${esc(a.referralCode)}" data-aff-label="Código copiado">Copiar</button></span></label>
    </div></section>`;
}
async function loadAffHome() {
  const uid = state.user.id;
  state.affHome = { uid };
  try { state.affHome = { ...(await api('/api/affiliates/me')), uid }; } catch { state.affHome = { enabled: false, uid }; }
  const box = $('#affHome');
  if (box) box.innerHTML = affHomeHtml();
}

function homePage() {
  const live = pickHighlights(state.events.filter((e) => e.status === 'live'));
  const upcoming = pickHighlights(state.events.filter((e) => e.status === 'scheduled'));
  if (!state.featured || Date.now() - state.featured.at > 60_000) loadFeatured();
  // Signed in: the invitation card (link and code to copy) instead of the welcome banner.
  if (state.user && state.affHome?.uid !== state.user.id) loadAffHome();
  const hero = state.user ? '' : `<div class="eyebrow">A NOVA EXPERIÊNCIA DE APOSTAS</div><h1>Mais mercados.<br>Mais emoção.</h1><p>Uma plataforma clássica, rápida e simples para acompanhar desporto, apostas ao vivo e casino num único lugar.</p>
       <div class="hero-actions"><button class="primary-btn" data-action="register">Criar conta</button><a class="outline-btn" href="#/desporto">Explorar desporto</a></div>`;
  return `${state.user ? `<div id="affHome">${affHomeHtml()}</div>` : `<section class="hero"><div class="hero-copy">${hero}</div></section>`}
    ${live.length ? `<section class="section"><div class="section-head"><h2><span class="live-dot"></span>Ao Vivo agora</h2><a href="#/ao-vivo">Ver todos ›</a></div>${carousel('carLive', live.map(liveCard))}</section>` : ''}
    ${builderSection()}
    <section class="section"><div class="section-head"><h2>Eventos em destaque</h2><a href="#/desporto">Todos os eventos ›</a></div>
      ${upcoming.length ? carousel('carPre', upcoming.map(matchCard)) : emptyEvents()}</section>
    <section class="section"><div class="section-head"><h2>Casino</h2><a href="#/casino">Ver casino ›</a></div>${state.casinoLobby?.rows?.[0]?.games.length ? carousel('homeCasino', state.casinoLobby.rows[0].games.map(lobbyCard)) : `<div class="game-grid grid">${state.casino.enabled && state.casino.games.length ? state.casino.games.slice(0, 5).map(casinoGameCard).join('') : GAMES.slice(0, 5).map(gameCard).join('')}</div>`}</section>
    ${footer()}`;
}

const emptyEvents = () => `<div class="panel empty">${state.eventsLoaded ? 'Sem eventos disponíveis de momento.' : 'A carregar eventos…'}</div>`;

/** One league (from the sidebar): all its games of the next month, live first. */
function leaguePage(name) {
  // The sport whose sidebar tree lists this league (football when the tree is not loaded yet).
  const [sport, country] = Object.entries(state.leagueTree || {}).map(([sp, tree]) => [sp, tree.find((c) => c.leagues.some((l) => l.name === name))?.country])
    .find(([, c]) => c) || ['futebol', null];
  const v = state.leagueView;
  if (!v || v.name !== name || v.sport !== sport || Date.now() - v.at > 30_000) {
    const keep = v?.name === name && v.sport === sport ? v.events : null;
    state.leagueView = { name, sport, events: keep, at: Date.now() };
    api(`/api/events?sport=${encodeURIComponent(sport)}&competition=${encodeURIComponent(name)}`).then(({ events }) => {
      if (state.leagueView?.name !== name) return;
      state.leagueView.events = events;
      if (currentRoute().sub === 'liga') render({ keepScroll: true });
    }).catch(() => { if (state.leagueView?.name === name && !state.leagueView.events) state.leagueView.events = []; });
  }
  const events = state.leagueView.events;
  const live = (events || []).filter((e) => e.status === 'live');
  const next = (events || []).filter((e) => e.status !== 'live');
  return `<div class="page-title"><h1>${esc(leagueShort(name))}</h1><p>${esc(country || SPORT_META[sport]?.name || 'Futebol')} · jogos ao vivo e do próximo mês.</p></div>
    <div class="sport-strip"><a class="sport-pill" href="#/desporto">‹ Todo o desporto</a></div>
    ${events === null ? '<div class="loading">A carregar…</div>' : !events.length ? '<div class="panel empty">Sem jogos desta liga com odds de momento.</div>'
      : `${live.length ? `<section class="section"><div class="section-head"><h2><span class="live-dot"></span>Ao vivo</h2></div>${groupByCompetition(live)}</section>` : ''}
         ${next.length ? `<section class="section"><div class="section-head"><h2>Próximos jogos</h2><span>${next.length}</span></div>${groupByCompetition(next)}</section>` : ''}`}
    ${footer()}`;
}

function sportsPage(sub, rest = '') {
  if (sub === 'resultados') return resultsPage();
  if (sub === 'liga' && rest) return leaguePage(decodeURIComponent(rest));
  const sports = [...new Set(state.events.map((e) => e.sport))].sort((a, b) => sportRank(a) - sportRank(b));
  const list = state.events.filter((e) => !state.sport || e.sport === state.sport);
  if (!state.featured || Date.now() - state.featured.at > 60_000) loadFeatured();
  return `<div class="page-title"><h1>Desporto</h1><p>Todos os eventos pré-jogo e ao vivo com odds disponíveis.</p></div>
    <div class="sport-strip">
      <button class="sport-pill${!state.sport ? ' active' : ''}" data-sport="">Todos</button>
      ${sports.map((s) => `<button class="sport-pill${state.sport === s ? ' active' : ''}" data-sport="${esc(s)}">${SPORT_META[s]?.icon || ''} ${esc(SPORT_META[s]?.name || s)}</button>`).join('')}
      <a class="sport-pill" href="#/desporto/resultados">🏁 Resultados</a>
    </div>
    ${builderSection()}
    <section class="section">${list.length ? groupByCompetition(list, { after: 4, insert: accaSection() }) : emptyEvents()}</section>
    ${footer()}`;
}

// ---------- ready-made bets (sports page) ----------

let featuredLoading = false;
async function loadFeatured() {
  if (featuredLoading) return;
  featuredLoading = true;
  try {
    const f = await api('/api/featured');
    state.featured = { ...f, at: Date.now() };
    const { page, sub } = currentRoute();
    if ((page === 'desporto' && !sub) || page === 'home') render({ keepScroll: true });
  } catch { /* the board works without it */ } finally { featuredLoading = false; }
}

const shortWhen = (iso) => fmtWhen(iso).replace(' ', ', ');

function builderCard(b, i) {
  return `<div class="combo-card builder">
    <div class="combo-head"><div><strong>${esc(b.match)}</strong><small>${esc(shortWhen(b.startTime))}</small></div><span class="combo-icon">${ICON_SLIP}</span></div>
    <ul class="combo-legs">${b.legs.map((l) => `<li><span>${esc(l.marketName)} - </span><b>${esc(l.label)}</b></li>`).join('')}</ul>
    <button class="combo-btn" data-builder="${i}"><strong>${fmtOdds(b.odds)}</strong><small>CRIADOR DE APOSTAS</small></button>
  </div>`;
}

function accaCard(a, i) {
  return `<div class="combo-card acca">
    ${a.legs.map((l) => `<div class="acca-leg">
      <div class="acca-when">${SPORT_META[l.sport]?.icon || '⚽'} ${esc(shortWhen(l.startTime))}, ${esc(l.home)} - ${esc(l.away)}</div>
      <div class="acca-pick"><div><small>${esc(l.market === 'ml' ? 'Vencedor' : 'Resultado no fim do tempo regulamentar')}</small><b>${esc(l.label)}</b></div><span>${fmtOdds(l.odds)}</span></div>
    </div>`).join('')}
    <div class="acca-last">Início do último jogo: ${esc(shortWhen(a.lastStart))}</div>
    <div class="acca-foot"><span>Odds totais <b>${fmtOdds(a.odds)}</b></span><button class="primary-btn" data-acca="${i}">Adicionar ao boletim</button></div>
  </div>`;
}

// "Construa o seu ganho" under the page title; "Apostas vencedoras" after the first four events.
function builderSection() {
  const b = state.featured?.builders;
  return b?.length ? `<section class="section"><div class="section-head"><h2>Construa o seu ganho</h2></div>${carousel('builderCar', b.map(builderCard))}</section>` : '';
}
function accaSection() {
  const a = state.featured?.accas;
  return a?.length ? `<div class="acca-section"><div class="section-head"><h2>🏆 Apostas vencedoras</h2></div>${carousel('accaCar', a.map(accaCard))}</div>` : '';
}

/** A bet builder goes into the slip on its own (its legs are one bet on one match). */
function addBuilder(i) {
  const b = state.featured?.builders?.[i];
  if (!b) return;
  if (state.slip.length) toast('Boletim', 'O criador de apostas substituiu as seleções anteriores.');
  state.slip = [];
  state.builder = { eventId: b.eventId, match: b.match, competition: b.competition, startTime: b.startTime, legs: b.legs.map((l) => ({ ...l })) };
  saveSlip(); syncSelectedButtons(); renderSlip(); setSlipOpen(true);
}

/** A ready-made multiple: its four picks into the slip (replacing other picks on those matches). */
function addAcca(i) {
  const a = state.featured?.accas?.[i];
  if (!a) return;
  state.builder = null;
  const events = new Set(a.legs.map((l) => l.eventId));
  state.slip = state.slip.filter((s) => !events.has(s.eventId));
  for (const l of a.legs) {
    state.slip.push({ selectionId: l.selectionId, eventId: l.eventId, market: l.market, marketName: l.marketName, code: l.code, label: l.label, odds: l.odds, match: `${l.home} vs ${l.away}`, competition: l.competition });
  }
  state.mode = 'multiple';
  saveSlip(); syncSelectedButtons(); renderSlip(); setSlipOpen(true);
  toast('Adicionado ao boletim', `Múltipla de ${a.legs.length} seleções`);
}

// A leg the others make certain (double chance covering the result) counts as 1.00, as on the server.
const impliedLeg = (l, legs) => l.market === 'dc' && legs.some((r) => r.market === '1x2' && String(l.code).includes(r.code));
const builderTotal = (b) => Math.round(b.legs.reduce((p, l) => p * (impliedLeg(l, b.legs) ? 1 : l.odds), 1) * (state.config?.builderFactor ?? 1) * 100) / 100;

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

const ICON_SLIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10h6M8 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16.5" cy="10" r="1.4" fill="currentColor"/></svg>';
const ICON_TV = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2.5l4 3.5 4-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 10v5l4.5-2.5z" fill="currentColor"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 8v8l6-4z" fill="currentColor"/></svg>';
const ICON_EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const expandBtn = () => `<button class="expand-btn" data-expand title="Expandir" aria-label="Expandir">${ICON_EXPAND}</button>`;
const ICON_PITCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5v14M2 9.5h3v5H2M22 9.5h-3v5h3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

function livePage() {
  const all = state.events.filter((e) => e.status === 'live');
  // TV on: only games with live video. Then the sport chosen in the strip.
  const withTv = state.liveTv ? all.filter((e) => e.stream) : all;
  const present = [...new Set(withTv.map((e) => e.sport))].sort((a, b) => sportRank(a) - sportRank(b));
  if (state.liveSport && !present.includes(state.liveSport)) state.liveSport = '';
  const live = state.liveSport ? withTv.filter((e) => e.sport === state.liveSport) : withTv;
  const tvCount = all.filter((e) => e.stream).length;
  const strip = `<div class="sport-strip live-sports">
      <button class="sport-pill${!state.liveSport ? ' active' : ''}" data-live-sport="">Todos <small>${withTv.length}</small></button>
      ${present.map((sp) => `<button class="sport-pill${state.liveSport === sp ? ' active' : ''}" data-live-sport="${esc(sp)}">${SPORT_META[sp]?.icon || ''} ${esc(SPORT_META[sp]?.name || sp)} <small>${withTv.filter((e) => e.sport === sp).length}</small></button>`).join('')}
    </div>`;
  // Football first, then the other sports; big leagues first inside each sport.
  const sports = [...new Set(live.map((e) => e.sport))].sort((a, b) => sportRank(a) - sportRank(b));
  const blocks = sports.map((sp) => {
    const list = live.filter((e) => e.sport === sp).sort(byPriority);
    return `<section class="section"><div class="section-head"><h2>${SPORT_META[sp]?.icon || ''} ${esc(SPORT_META[sp]?.name || sp)} <small class="muted">${list.length}</small></h2></div>
      <div class="live-grid grid">${list.map(liveCard).join('')}</div></section>`;
  }).join('');
  const empty = state.liveTv ? 'Nenhum jogo com transmissão ao vivo neste momento.' : 'Não há eventos ao vivo neste momento.';
  return `<div class="page-title live-title"><div><h1><span class="live-dot"></span>Ao Vivo</h1><p>Eventos a decorrer agora. As odds atualizam automaticamente.</p></div>
      <button class="tv-toggle${state.liveTv ? ' active' : ''}" data-live-tv title="Só jogos com transmissão" aria-pressed="${state.liveTv}">${ICON_TV}<small>${tvCount}</small></button></div>
    ${all.length ? strip : ''}
    ${live.length ? blocks : `<div class="panel empty">${state.eventsLoaded ? empty : 'A carregar…'}</div>`}
    ${footer()}`;
}

const gameCard = (g) => `<button class="game-card" data-action="game"><div class="game-art">${g[2]}</div><div class="game-info"><strong>${esc(g[0])}</strong><small>${esc(g[1])}</small></div></button>`;

function casinoGameCard(g, i) {
  return `<button class="game-card" data-game="${i}">
    <div class="game-art">${g.image ? `<img class="game-img" src="${esc(g.image)}" alt="" loading="lazy">` : '🎰'}</div>
    <div class="game-info"><strong>${esc(g.name)}</strong><small>${esc(g.provider)} · ${esc(g.category)}</small></div></button>`;
}

const CASINO_PAGE = 24;

/** A lobby card (BigBang): opens the game's page. */
const lobbyCard = (g) => `<button class="game-card" data-game-id="${g.id}">
    <div class="game-art">${g.image ? `<img class="game-img" src="${esc(g.image)}" alt="" loading="lazy">` : '🎰'}</div>
    <div class="game-info"><strong>${esc(g.name)}</strong><small>${esc(g.provider)}</small></div></button>`;

/** The casino's tabs: the lobby, then the house tabs that have games (Populares, Novos Jogos, Slots…). */
function casinoTabs(f) {
  const cats = (state.casinoLobby?.categories || []).map((c) => [c.key, c.label]);
  const tabs = state.casino.bigbang && cats.length ? [['', 'Início'], ...cats] : [['', 'Todos'], ['Slots', 'Slots'], ['Ao Vivo', 'Ao Vivo']];
  return tabs.map(([k, l]) => `<button class="casino-tab${f.category === k && !f.provider ? ' active' : ''}" data-casino-cat="${k}">${esc(l)}</button>`).join('');
}

async function loadCasinoLobby() {
  try {
    state.casinoLobby = await api('/api/casino/lobby');
  } catch { state.casinoLobby = null; }
  const { page, sub } = currentRoute();
  if ((page === 'casino' && !sub) || page === 'home') render({ keepScroll: true });
}

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
  // The lobby: the featured games all at once (a grid), then one row per provider in the house
  // order (Pragmatic Play, Evolution, Playtech…), each with "Ver mais" (every game of that provider).
  const rows = c.bigbang && !filtered ? state.casinoLobby?.rows || [] : [];
  const lobby = rows.map((r, i) => (r.layout === 'grid'
    ? `<section class="section casino-row"><div class="section-head"><h2>${esc(r.title)}</h2></div>
      <div class="game-grid grid">${r.games.map(lobbyCard).join('')}</div></section>`
    : `<section class="section casino-row"><div class="section-head"><h2>${esc(r.title)}</h2>
      ${r.key === 'provider' ? `<button class="link-btn" data-casino-prov="${esc(r.provider)}">Ver mais (${r.total}) ›</button>`
        : `<button class="link-btn" data-casino-cat="${esc(r.key)}">Ver mais (${r.total}) ›</button>`}</div>
      ${carousel(`casinoRow${i}`, r.games.map(lobbyCard))}</section>`)).join('');
  // One provider or one tab open: its name, how many games and the way back to the lobby.
  const prov = c.bigbang && f.provider ? c.providers.find((p) => String(p.id) === f.provider) : null;
  const cat = c.bigbang && !prov && f.category ? (state.casinoLobby?.categories || []).find((x) => x.key === f.category) : null;
  const head = prov?.name || cat?.label;
  const provHead = head ? `<div class="section-head casino-prov-head"><h2>${esc(head)} <small class="muted">· ${c.total} jogos</small></h2>
      <button class="link-btn" data-casino-cat="">‹ Voltar ao casino</button></div>` : '';
  return `<div class="page-title"><h1>Casino</h1><p>${state.casinoLobby?.total || c.total} jogos de ${c.providers.filter((p) => !p.maintenance).length} fornecedores.</p></div>
    <div class="casino-filters">
      <div class="casino-tabs">${casinoTabs(f)}</div>
      <input class="search-input casino-search" id="casinoSearch" placeholder="Procurar jogo ou fornecedor…" value="${esc(f.q || '')}" autocomplete="off">
    </div>
    <div class="sport-strip casino-provs">
      <button class="sport-pill${!f.provider ? ' active' : ''}" data-casino-prov="">Todos os fornecedores</button>
      ${c.providers.map((p) => `<button class="sport-pill${f.provider === String(p.id) ? ' active' : ''}" data-casino-prov="${p.id}" ${p.maintenance ? 'disabled title="Em manutenção"' : ''}>${esc(p.name)}${p.maintenance ? ' (manutenção)' : ''}</button>`).join('')}
    </div>
    ${lobby || `${provHead}<section class="section">
      <div class="game-grid grid" id="casinoGrid">${c.games.length ? c.games.map(casinoGameCard).join('') : `<div class="empty">${c.loading ? 'A carregar…' : 'Sem jogos neste filtro.'}</div>`}</div>
      ${more ? `<div class="load-more"><button class="outline-btn" data-action="casino-more" ${c.loading ? 'disabled' : ''}>${c.loading ? 'A carregar…' : `Mostrar mais jogos (${c.games.length} de ${c.total})`}</button></div>` : ''}
    </section>`}
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

/** While a game is open, the header shows the live casino balance (and the free-spins balance in its bar). */
async function refreshCasinoBalance() {
  const sess = state.casinoSession;
  if (!state.user || sess?.demo) return;
  try {
    const w = await api(`/api/casino/wallet${sess?.fs ? `?fs=${sess.fs}` : ''}`);
    if (state.user) {
      state.user.balance = w.balance;
      updateHeader();
    }
    if (sess?.fs && w.freeSpins !== null && w.freeSpins !== undefined) {
      sess.fsBalance = w.freeSpins;
      const el = $('#fsBal');
      if (el) el.textContent = money(w.freeSpins);
    }
  } catch { /* next tick retries */ }
}

// ---------- one game's page (BigBang): Jogar, Testar, Free Spins ----------

function casinoGamePage(id) {
  if (state.casinoGame?.id !== id) {
    state.casinoGame = { id, data: null };
    api(`/api/casino/game/${id}`).then((d) => {
      if (state.casinoGame?.id !== id) return;
      state.casinoGame.data = d;
      render({ keepScroll: true });
    }).catch((err) => {
      if (state.casinoGame?.id !== id) return;
      state.casinoGame.data = { error: err.message };
      render({ keepScroll: true });
    });
  }
  const d = state.casinoGame.data;
  if (!d) return '<div class="loading">A carregar…</div>';
  if (d.error) return `<div class="panel empty">${esc(d.error)}<div class="hero-actions"><a class="outline-btn" href="#/casino">Voltar ao casino</a></div></div>${footer()}`;
  const g = d.game;
  const fs = d.freeSpins;
  const art = g.image ? `<img src="${esc(g.image)}" alt="" class="game-img">` : '<span class="cg-emoji">🎰</span>';
  const tags = [g.category, g.premium ? 'Premium' : null, g.provider].filter(Boolean);
  const rel = (x) => `<a class="cg-rel" href="#/casino/jogo/${x.id}"><span class="cg-rel-art">${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy" class="game-img">` : '🎰'}</span><strong>${esc(x.name)}</strong></a>`;
  return `<div class="cg">
      <div class="cg-hero">
        ${g.image ? `<img class="cg-bg" src="${esc(g.image)}" alt="">` : ''}
        <a class="cg-close" href="#/casino" aria-label="Fechar">×</a>
        <div class="cg-art">${art}</div>
      </div>
      <div class="cg-body">
        <h1>${esc(g.name)}</h1>
        <div class="cg-provider">${esc(g.provider)}</div>
        <p class="cg-tags">${tags.map(esc).join(', ')}</p>
        <div class="cg-actions">
          ${fs?.eligible ? `<button class="cg-btn fs" data-cg-play="fs">🎁 Jogar com Free Spins <small>${money(fs.balance)} disponível</small></button>` : ''}
          <button class="cg-btn play" data-cg-play="real"><span class="cg-play-ico">▶</span> Jogar</button>
          <button class="cg-btn demo" data-cg-play="demo">Testar</button>
        </div>
        ${fs && !fs.eligible ? '<p class="cg-note">As suas Free Spins são válidas noutros jogos — veja-os em <a href="#/promocoes">Promoções</a>.</p>' : ''}
        <p class="cg-note">Testar abre o jogo em modo demonstração, com saldo virtual: nenhum dinheiro real é usado.</p>
      </div>
      ${d.related.length ? `<section class="section"><div class="section-head"><h2>Do mesmo estilo</h2></div>${carousel('cgRelated', d.related.map(rel))}</section>` : ''}
    </div>${footer()}`;
}

/** Opens the game shown: 'real' (the player's balance), 'demo' (virtual money) or 'fs' (free spins). */
async function playCasino(mode) {
  const d = state.casinoGame?.data;
  const g = d?.game;
  if (!g) return;
  if (mode !== 'demo' && !state.user) return openAuth('login');
  state.casinoSession = { name: g.name, provider: g.provider, url: null, gameId: g.id, demo: mode === 'demo', fs: mode === 'fs' ? d.freeSpins?.id : null, fsBalance: null };
  location.hash = '#/casino/jogar';
  try {
    const r = await api('/api/casino/launch', { method: 'POST', body: { gameId: g.id, demo: mode === 'demo', freeSpins: mode === 'fs' ? d.freeSpins?.id : undefined } });
    if (!state.casinoSession) return;
    state.casinoSession.url = r.url;
    if (r.freeSpins) state.casinoSession.fsBalance = r.freeSpins.balance;
    if (currentRoute().sub === 'jogar') render({ keepScroll: true });
  } catch (err) {
    state.casinoSession = null;
    if (err.status === 401) { location.hash = `#/casino/jogo/${g.id}`; openAuth('login'); return; }
    if (err.data?.needsDeposit) { toast('Saldo insuficiente', 'Faça um depósito para jogar com dinheiro real, ou use Testar.', 'error'); location.hash = '#/perfil/carteira'; return; }
    toast('Casino', err.message, 'error');
    location.hash = `#/casino/jogo/${g.id}`;
  }
}

// ---------- casino player (the game runs inside the page) ----------

function casinoPlayPage() {
  const g = state.casinoSession;
  if (!g) {
    setTimeout(() => { location.hash = '#/casino'; });
    return '<div class="loading">A voltar ao casino…</div>';
  }
  if (!g.url) return `<div class="casino-player"><div class="casino-loading"><div class="spinner"></div><strong>${esc(g.name)}</strong><span class="muted">A abrir o jogo…</span></div></div>`;
  const mode = g.demo ? '<span class="cbar-tag">DEMO · saldo virtual</span>'
    : g.fs ? `<span class="cbar-tag fs">FREE SPINS · <b id="fsBal">${money(g.fsBalance ?? 0)}</b></span>` : '';
  return `<div class="casino-player">
    ${g.gameId ? `<div class="casino-bar"><a href="#/casino/jogo/${g.gameId}" class="cbar-back">‹ Sair</a><strong>${esc(g.name)}</strong>${mode}</div>` : ''}
    <iframe id="casinoFrame" class="casino-frame" src="${esc(g.url)}" title="${esc(g.name)}"
      allow="fullscreen; autoplay; clipboard-write; encrypted-media" allowfullscreen referrerpolicy="origin"></iframe>
  </div>`;
}

// ---------- promotions (terms and amounts always come from the server) ----------

let promosLoading = null;
function loadPromos() {
  promosLoading ||= api('/api/promotions').then(({ campaigns, mine }) => {
    state.campaigns = campaigns;
    state.promos = mine;
    renderSlip();
    const { page, sub } = currentRoute();
    updateHeader();
    // Only pages made of these numbers are redrawn (never a page with a form being filled in).
    if (page === 'promocoes' || (page === 'perfil' && sub === 'promocoes')) render({ keepScroll: true });
  }).catch(() => {}).finally(() => { promosLoading = null; });
  return promosLoading;
}

const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const dateShort = (iso) => new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** One campaign's card: what it gives and its conditions, as configured in the admin. */
function campaignCard(c) {
  const base = c.rolloverBase === 'bonus' ? 'bónus' : 'depósito + bónus';
  const cap = [c.maxCountStake !== null && c.maxCountStake !== undefined ? money(c.maxCountStake) : null, c.maxCountPct ? `${c.maxCountPct}% do bónus` : null].filter(Boolean);
  const info = {
    welcome: ['BOAS-VINDAS', `${c.percent}% até ${money(c.maxBonus)}`, `No primeiro depósito elegível, a partir de ${money(c.minDeposit)}.`,
      [`Rollover ${c.rolloverMult}× (${base})`, `Odd mínima ${fmtOdds(c.minOdds)}`, `Válido ${c.validityDays} dias`, cap.length ? `Conta até ${cap.join(' ou ')} por aposta (o menor)` : null, 'Pré-jogo e ao vivo', 'Free bets e apostas anuladas não contam']],
    firstBet: ['PRIMEIRA APOSTA', `Protegida até ${money(c.maxRefund)}`, `Se a primeira aposta (mín. ${money(c.minStake)}, odd ≥ ${fmtOdds(c.minOdds)}) perder, recebe o valor em free bet.`,
      [`Free bet válida ${c.validityDays} dias`, 'Uma vez por jogador', 'O valor da free bet não é devolvido, só os ganhos']],
    reload: ['SEMANAL', `Reload ${c.percent}% até ${money(c.maxBonus)}`, `Uma vez por semana, em depósitos a partir de ${money(c.minDeposit)}.`,
      [`Rollover ${c.rolloverMult}× (${base})`, `Odd mínima ${fmtOdds(c.minOdds)}`, `Válido ${c.validityDays} dias`, 'Não acumula com o bónus de boas-vindas']],
    cashback: ['SEMANAL', `Cashback ${c.percent}% até ${money(c.max)}`, `Sobre as perdas líquidas da semana (mín. ${money(c.minLoss)}), creditado à segunda-feira.`,
      [`Rollover ${c.rolloverMult}×`, `Odd mínima ${fmtOdds(c.minOdds)}`, `Válido ${c.validityDays} dias`, 'Free bets, bónus e apostas anuladas não contam']],
    casinoFs: ['CASINO', 'Free Spins no depósito', `Escolha "Free Spins casino" ao depositar: ${(c.tiers || []).map(([d, n]) => `${money(d)} → ${n} rodadas`).join(' · ')}.`,
      [`${money(c.spinValue)} por rodada`, `Válidas ${c.validityDays} dias`, `Em ${c.games} jogo(s) selecionado(s)`, 'Os ganhos acima do valor das rodadas passam a saldo real', 'Não acumula com o bónus de desporto no mesmo depósito']],
  }[c.id];
  if (!info) return '';
  const [eyebrow, title, text, terms] = info;
  return `<div class="promo-card${c.open ? '' : ' off'}"><div class="eyebrow">${eyebrow}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>
    <ul class="promo-terms">${terms.filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <span class="tag">${c.open ? 'ATIVA' : 'INDISPONÍVEL'}</span></div>`;
}

/** A running bonus: balance, rollover progress (as the server counts it), expiry. */
function bonusCard(b) {
  return `<div class="bonus-card">
    <div class="bonus-head"><strong>${esc(b.name)}</strong><span class="pf-badge verified">Ativo</span></div>
    <div class="bonus-nums"><div><small>Saldo de bónus</small><b>${money(b.balance)}</b></div><div><small>Rollover</small><b>${money(b.rolloverProgress)} / ${money(b.rolloverTarget)}</b></div><div><small>Falta</small><b>${money(b.remaining)}</b></div></div>
    <div class="stat-bar bonus-bar"><i class="w${Math.floor(pct(b.rolloverProgress, b.rolloverTarget) / 5) * 5}"></i></div>
    <small class="muted">Odd mínima ${fmtOdds(b.minOdds)}${b.maxCountStake !== null ? ` · conta até ${money(b.maxCountStake)} por aposta` : ''} · expira a ${esc(dateShort(b.expiresAt))}</small>
  </div>`;
}

/** Active casino free spins: their balance, the games they work in, and ending them (winnings paid). */
function spinsCard(f) {
  return `<div class="bonus-card">
    <div class="bonus-head"><strong>🎰 Free Spins casino · ${f.spins} × ${money(f.spinValue)}</strong><span class="pf-badge verified">Ativas</span></div>
    <div class="bonus-nums"><div><small>Saldo de Free Spins</small><b>${money(f.balance)}</b></div><div><small>Valor oferecido</small><b>${money(f.value)}</b></div><div><small>Ganhos</small><b class="green">${money(f.winnings)}</b></div></div>
    <small class="muted">Jogos: ${f.games.map((g) => `<a href="#/casino/jogo/${g.id}">${esc(g.name || `#${g.id}`)}</a>`).join(', ')} · expiram a ${esc(dateShort(f.expiresAt))}</small>
    <div class="pf-actions"><button class="outline-btn" data-action="fs-claim" data-id="${f.id}">Terminar e receber ganhos (${money(f.winnings)})</button></div>
  </div>`;
}

const BONUS_STATUS = { active: 'Ativo', completed: 'Cumprido', expired: 'Expirado', cancelled: 'Cancelado', used: 'Usada' };
function myPromosView() {
  const m = state.promos;
  if (!m) { loadPromos(); return '<div class="loading">A carregar…</div>'; }
  const free = usableFreebets();
  const past = m.bonuses.filter((b) => b.status !== 'active');
  return `<div class="pf-stats"><div><small>Saldo de bónus</small><strong>${money(m.bonusBalance)}</strong></div><div><small>Free bets</small><strong>${money(m.freebetBalance)}</strong></div>
      <div><small>Primeira aposta protegida</small><strong>${m.firstBetUsed ? 'Utilizada' : 'Disponível'}</strong></div></div>
    ${m.activeSpins ? spinsCard(m.activeSpins) : ''}
    ${m.active.length ? m.active.map(bonusCard).join('') : m.activeSpins ? '' : '<p class="muted">Sem bónus ativos. Veja as campanhas em <a href="#/promocoes">Promoções</a>.</p>'}
    ${free.length ? `<h4>Free bets</h4><div class="pf-list">${free.map((f) => `<div class="pf-row"><div><b>${money(f.amount)}</b><small>Válida até ${esc(fmtDateTime(f.expiresAt))}${f.minOdds > 1 ? ` · odd mínima ${fmtOdds(f.minOdds)}` : ''} · escolha-a no boletim</small></div><span class="pf-badge verified">Disponível</span></div>`).join('')}</div>` : ''}
    ${past.length ? `<h4>Histórico</h4><div class="pf-list">${past.map((b) => `<div class="pf-row"><div><b>${esc(b.name)} · ${money(b.amount)}</b><small>${esc(dateShort(b.createdAt))}${b.cancelReason ? ` · ${esc(b.cancelReason)}` : ''}</small></div><span class="pf-badge">${BONUS_STATUS[b.status]}</span></div>`).join('')}</div>` : ''}
    ${m.ledger.length ? `<h4>Movimentos promocionais</h4><div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>
      ${m.ledger.slice(0, 15).map((l) => `<tr><td>${esc(fmtDateTime(l.createdAt))}</td><td>${esc(l.description)}</td><td class="num ${l.amount >= 0 ? 'green' : ''}">${l.type === 'rollover_progress' ? '' : `${l.amount >= 0 ? '+' : ''}${money(l.amount)}`}</td></tr>`).join('')}
    </tbody></table></div>` : ''}`;
}

function promosPage() {
  if (!state.campaigns) loadPromos();
  const cards = (state.campaigns || []).map(campaignCard).join('');
  return `<div class="page-title"><h1>Promoções</h1><p>Ofertas e campanhas da Bet62.</p></div>
    ${state.user ? `<section class="section"><div class="section-head"><h2>As minhas promoções</h2></div><div class="panel pf-panel">${myPromosView()}</div></section>` : ''}
    <section class="section"><div class="section-head"><h2>Campanhas</h2></div>
      ${cards ? `<div class="promo-grid grid">${cards}</div>` : '<div class="loading">A carregar…</div>'}</section>
    <section class="section notice">Só uma promoção de depósito ativa de cada vez. O saldo de bónus não pode ser levantado: passa a saldo real quando o rollover é cumprido; ao expirar ou ser cancelado, só o saldo de bónus é removido. Pedir um levantamento com um bónus de depósito ativo cancela esse bónus. Promoções sujeitas a verificação de elegibilidade (conta ativa, sem autoexclusão, sem contas duplicadas, depósito confirmado e não revertido).</section>
    ${footer()}`;
}

// ---------- account ----------

// The profile, as in Bet62Novo: a header card, then sections (side menu on a computer, accordion on a phone).
const PROFILE_SECTIONS = [
  { id: 'pessoais', icon: '👤', label: 'Informações pessoais', title: 'Informações Pessoais', text: 'Gestão e atualização dos seus dados pessoais, garantindo a exatidão e conformidade com os requisitos legais aplicáveis.' },
  { id: 'carteira', icon: '💶', label: 'Carteira', title: 'Carteira', text: 'Depósitos por MB WAY, Multibanco ou cartão, levantamentos por IBAN e todos os movimentos da conta.' },
  { id: 'apostas', icon: '🎟️', label: 'As minhas apostas', title: 'As Minhas Apostas', text: 'Todas as suas apostas, em aberto e resolvidas.' },
  { id: 'promocoes', icon: '🎁', label: 'Promoções e bónus', title: 'Promoções Ativas', text: 'Saldo de bónus, progresso do rollover (calculado pelo servidor) e free bets.' },
  { id: 'afiliados', icon: '🤝', label: 'Programa de Afiliados', title: 'Programa de Afiliados', text: 'Convide amigos com o seu link: recebe 10% do primeiro depósito elegível de cada convidado, quando cumpre as condições.' },
  { id: 'verificacao', icon: '🛡️', label: 'Verificação de identidade', title: 'Verificação de Identidade (KYC)', text: 'Complete a verificação para desbloquear levantamentos. O processo demora até 48 horas úteis.' },
  { id: 'seguranca', icon: '🔑', label: 'Definições de segurança', title: 'Definições de Segurança', text: 'Proteção da conta: palavra-passe e controlo dos acessos.' },
  { id: 'preferencias', icon: '⚙️', label: 'Preferências de conta', title: 'Preferências de Conta', text: 'Definições gerais da conta.' },
  { id: 'limites', icon: '⚠️', label: 'Limites e autoexclusão', title: 'Limites e Autoexclusão', text: 'Limites de depósito, aposta e perda, pausas e autoexclusão para uma experiência de jogo responsável.' },
  { id: 'atividade', icon: '📊', label: 'Histórico de atividade', title: 'Histórico de Atividade', text: 'Resumo da sua atividade na plataforma: apostas realizadas e resultados obtidos.' },
  { id: 'pagamento', icon: '🏦', label: 'Dados bancários', title: 'Dados Bancários para Levantamento', text: 'Guarde os seus dados bancários para facilitar os pedidos de levantamento.' },
  { id: 'notificacoes', icon: '🔔', label: 'Notificações', title: 'Notificações', text: 'Preferências de comunicação e alertas da sua conta.' },
  { id: 'sessoes', icon: '📱', label: 'Sessões ativas', title: 'Sessões Ativas', text: 'Dispositivos com sessão iniciada na sua conta.' },
  { id: 'suporte', icon: '❓', label: 'Suporte e assistência', title: 'Suporte e Assistência', text: 'Canais de contacto para esclarecimento de dúvidas relacionadas com a conta.' },
  { id: 'privacidade', icon: '👁️', label: 'Privacidade', title: 'Configurações de Privacidade', text: 'Preferências relativas ao tratamento e proteção dos seus dados pessoais.' },
];
const PROFILE_ALIAS = { '': 'pessoais', 'jogo-responsavel': 'limites' };
const phoneLayout = () => matchMedia('(max-width: 760px)').matches;
const memberId = (u) => `BET62-${String(u.id).padStart(6, '0')}`;

function accountPage(sub) {
  if (!state.user) {
    return `<div class="panel empty"><p>Inicie sessão para ver a sua conta.</p><div class="hero-actions"><button class="primary-btn" data-action="login">Entrar</button><button class="outline-btn" data-action="register">Criar conta</button></div></div>${footer()}`;
  }
  const u = state.user;
  const active = PROFILE_SECTIONS.find((s) => s.id === (PROFILE_ALIAS[sub] ?? sub))?.id || 'pessoais';
  const excluded = u.excludedUntil && new Date(u.excludedUntil) > new Date();
  const head = `<div class="pf-head">
    <div class="pf-avatar">${esc(initials(u.name))}</div>
    <div class="pf-who"><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span><small>${memberId(u)}</small></div>
    <div class="pf-balance"><small>Saldo disponível</small><strong>${money(u.balance)}</strong>
      ${excluded ? `<em>Autoexcluído até ${esc(new Date(u.excludedUntil).toLocaleDateString('pt-PT'))}</em>` : ''}</div>
  </div>`;
  const extra = `${u.role === 'admin' ? '<a class="pf-link" href="/admin">🧰 Administração</a>' : ''}<button class="pf-link" data-action="logout">↩ Terminar sessão</button>`;
  const card = (s) => `<div class="pf-card"><div class="pf-card-head"><h3>${s.title}</h3><p>${s.text}</p></div>${profileSection(s.id)}</div>`;
  let body;
  if (phoneLayout()) {
    const open = state.profileCollapsed ? null : active;
    body = `<div class="pf-acc">${PROFILE_SECTIONS.map((s) => `<div class="pf-acc-item${s.id === open ? ' open' : ''}" id="pf-${s.id}">
        <a class="pf-acc-head" href="#/perfil/${s.id}" data-pf-acc="${s.id}"><span class="pf-ico">${s.icon}</span><span>${s.label}</span><i>▾</i></a>
        ${s.id === open ? `<div class="pf-acc-body">${card(s)}</div>` : ''}</div>`).join('')}
      <div class="pf-acc-extra">${extra}</div></div>`;
  } else {
    body = `<div class="pf-grid"><nav class="pf-nav">${PROFILE_SECTIONS.map((s) => `<a href="#/perfil/${s.id}" class="${s.id === active ? 'active' : ''}"><span class="pf-ico">${s.icon}</span><span>${s.label}</span>${s.id === active ? '<i>›</i>' : ''}</a>`).join('')}
        <div class="pf-sep"></div>${extra}</nav>
      <div class="pf-main" id="accountMain">${card(PROFILE_SECTIONS.find((s) => s.id === active))}</div></div>`;
  }
  return `<div class="pf">${head}${body}</div>${footer()}`;
}

function profileSection(id) {
  switch (id) {
    case 'carteira': return walletView();
    case 'apostas': return betsView();
    case 'promocoes': return myPromosView();
    case 'afiliados': setTimeout(loadAffiliates); return '<div id="affBox"><div class="loading">A carregar…</div></div>';
    case 'verificacao': setTimeout(loadKyc); return '<div id="kycBox"><div class="loading">A carregar…</div></div>';
    case 'seguranca': return securityView();
    case 'preferencias': return preferencesView();
    case 'limites': return responsibleView();
    case 'atividade': setTimeout(loadStats); return '<div id="statsBox"><div class="loading">A carregar…</div></div>';
    case 'pagamento': return bankView();
    case 'notificacoes': return prefToggles([
      ['notifyResults', 'Resultados das apostas por email', 'Aviso quando uma aposta é resolvida'],
      ['notifyPromos', 'Promoções por email', 'Ofertas e campanhas'],
      ['notifySms', 'Alertas por SMS', 'Avisos importantes da conta'],
      ['notifyPush', 'Notificações no dispositivo', 'Golos e resultados dos jogos em que apostou'],
    ]);
    case 'sessoes': setTimeout(loadSessions); return '<div id="sessionsBox"><div class="loading">A carregar…</div></div>';
    case 'suporte': return supportView();
    case 'privacidade': return `${prefToggles([
      ['cookiesAnalytics', 'Cookies analíticos', 'Dados de utilização para melhorar a plataforma'],
      ['cookiesMarketing', 'Cookies de marketing', 'Personalização de anúncios e conteúdos'],
      ['shareData', 'Partilha de dados com parceiros', 'Dados partilhados com entidades afiliadas'],
    ])}
      <div class="pf-actions"><a class="outline-btn" href="/api/me/export" download>⬇ Descarregar os meus dados</a>
        <button class="danger-outline" data-action="delete-account">🗑 Eliminar conta</button></div>`;
    default: return personalView();
  }
}

function personalView() {
  const u = state.user;
  return `<form data-form="profile"><div class="form-grid">
      <div class="field"><label>Nome completo</label><input name="name" value="${esc(u.name)}" required autocomplete="name"></div>
      <div class="field"><label>Telemóvel</label><input name="phone" type="tel" value="${esc(u.phone || '')}" placeholder="+351 900 000 000" autocomplete="tel"></div>
      <div class="field"><label>Email</label><input value="${esc(u.email)}" readonly></div>
      <div class="field"><label>Data de nascimento</label><input value="${esc(u.birthdate ? new Date(u.birthdate).toLocaleDateString('pt-PT') : '')}" readonly></div>
      <div class="field"><label>ID de membro</label><input value="${memberId(u)}" readonly></div>
      <div class="field"><label>Membro desde</label><input value="${esc(new Date(u.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }))}" readonly></div>
    </div><div class="form-actions"><button class="primary-btn">Guardar alterações</button></div></form>
    <p class="muted small">O email e a data de nascimento não podem ser alterados aqui: contacte o suporte.</p>`;
}

const KYC_STATE = {
  approved: ['verified', 'Verificado'], pending: ['pending', 'Pendente'], rejected: ['rejected', 'Recusado'],
  given: ['verified', 'Indicado'], missing: ['none', 'Não enviado'], none: ['none', 'Em falta'],
};
const badge = (label, st, sub = '') => `<div class="pf-row"><div><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><span class="pf-badge ${KYC_STATE[st][0]}">${KYC_STATE[st][1]}</span></div>`;

async function loadKyc() {
  let k;
  try { k = await api('/api/me/kyc'); } catch (err) { toast('Erro', err.message, 'error'); return; }
  const box = $('#kycBox');
  if (!box) return;
  // A slot's state: its best document (approved, else pending, else rejected).
  const slot = (kinds) => {
    const docs = k.documents.filter((d) => kinds.includes(d.kind)).map((d) => d.status);
    return docs.includes('approved') ? 'approved' : docs.includes('pending') ? 'pending' : docs.includes('rejected') ? 'rejected' : 'missing';
  };
  const u = state.user;
  const notice = {
    approved: '<div class="pf-note ok"><strong>Conta verificada.</strong> Os levantamentos estão desbloqueados.</div>',
    pending: '<div class="pf-note warn"><strong>Documentos em análise.</strong> A equipa responde até 48 horas úteis.</div>',
    rejected: '<div class="pf-note bad"><strong>Verificação recusada.</strong> Envie documentos legíveis e dentro da validade.</div>',
  }[k.status] || '<div class="pf-note">Envie um documento de identificação (Cartão de Cidadão ou passaporte) e um comprovativo de IBAN ou morada.</div>';
  box.innerHTML = `${notice}
    <div class="pf-list">
      ${badge('Email', 'given', esc(u.email))}
      ${badge('NIF', u.nif ? 'given' : 'none', u.nif ? esc(u.nif) : 'Indique-o em Dados bancários')}
      ${badge('Documento de identificação', slot(['Documento (frente)', 'Documento (verso)', 'Passaporte']), 'Cartão de Cidadão (frente e verso) ou passaporte')}
      ${badge('Comprovativo de IBAN / morada', slot(['Comprovativo de IBAN / morada']))}
    </div>
    <h4>Enviar documento</h4>
    <form data-form="kyc"><div class="form-grid">
      <div class="field"><label>Tipo de documento</label><select name="kind">
        <option value="id_front">Cartão de Cidadão — frente</option><option value="id_back">Cartão de Cidadão — verso</option>
        <option value="passport">Passaporte</option><option value="address">Comprovativo de IBAN / morada</option></select></div>
      <div class="field"><label>Ficheiro (JPG, PNG, WEBP ou PDF, máx. 5 MB)</label><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></div>
    </div><div class="form-actions"><button class="primary-btn">Enviar documento</button></div></form>
    ${k.documents.length ? `<h4>Documentos enviados</h4><div class="pf-list">${k.documents.map((d) => `<div class="pf-row"><div><b>${esc(d.kind)}</b><small>${esc(d.fileName)} · ${esc(fmtDateTime(d.createdAt))}</small></div>
      <span class="pf-badge ${KYC_STATE[d.status][0]}">${KYC_STATE[d.status][1]}</span></div>`).join('')}</div>` : ''}`;
}

function securityView() {
  return `<h4>Alterar palavra-passe</h4>
    <form data-form="password"><div class="form-grid">
      <div class="field"><label>Palavra-passe atual</label><input name="currentPassword" type="password" required autocomplete="current-password"></div>
      <div class="field"><label>Nova palavra-passe (mín. 8 caracteres)</label><input name="newPassword" type="password" minlength="8" required autocomplete="new-password"></div>
      <div class="field"><label>Confirmar nova palavra-passe</label><input name="confirmPassword" type="password" minlength="8" required autocomplete="new-password"></div>
    </div><div class="form-actions"><button class="primary-btn">Alterar palavra-passe</button></div></form>
    <div class="pf-note">Ao alterar a palavra-passe, as sessões abertas noutros dispositivos são terminadas. Veja-as em <a href="#/perfil/sessoes">Sessões ativas</a>.</div>`;
}

function preferencesView() {
  return `<div class="pf-box"><h4>📈 Formato de odds</h4><div class="pf-chips"><span class="pf-chip on">Decimal (2.50)</span></div>
      <small class="muted">As odds são apresentadas em formato decimal.</small></div>
    <div class="pf-box"><h4>🌐 Idioma e região</h4>
      <div class="pf-row plain"><div><b>Idioma</b><small>Português (Portugal)</small></div><span class="pf-tag">🇵🇹 PT</span></div>
      <div class="pf-row plain"><div><b>Fuso horário</b><small>Europe/Lisbon</small></div><span class="pf-tag">WET/WEST</span></div>
      <div class="pf-row plain"><div><b>Moeda</b><small>Euro</small></div><span class="pf-tag">€ EUR</span></div></div>`;
}

function responsibleView() {
  const u = state.user;
  const excluded = u.excludedUntil && new Date(u.excludedUntil) > new Date();
  setTimeout(loadLimits);
  return `<p class="muted">Apostar deve ser uma forma de entretenimento. Faça pausas e nunca aposte dinheiro de que precise. Se sentir que perdeu o controlo, procure apoio especializado.</p>
    <div class="pf-box"><h4>🔒 Limites pessoais</h4><div id="limitsBox"><div class="loading">A carregar…</div></div></div>
    <div class="pf-box"><h4>⚠️ Pausa e autoexclusão</h4>
    ${excluded ? `<div class="pf-note warn"><strong>Autoexclusão ativa</strong> até ${esc(fmtDateTime(u.excludedUntil))}. Durante este período não é possível apostar nem depositar; os levantamentos continuam disponíveis.</div>` : `
      <p class="muted small">A autoexclusão é imediata e não pode ser anulada antes do fim. Os levantamentos continuam disponíveis.</p>
      <div class="pf-excl">${[[1, 'Pausa 24 horas'], [3, 'Pausa 72 horas'], [7, '1 semana'], [30, '1 mês'], [90, '3 meses'], [180, '6 meses'], [365, '1 ano']]
        .map(([d, l]) => `<button class="pf-excl-btn" data-exclude="${d}" data-label="${l}">${l}</button>`).join('')}</div>`}
    </div>
    <div class="pf-note">Ajuda com problemas de jogo: <strong>SICAD — Linha Vida 1414</strong> (chamada anónima e confidencial).</div>`;
}

const LIMIT_FIELDS = [['depositDay', 'Depósito diário'], ['depositWeek', 'Depósito semanal'], ['depositMonth', 'Depósito mensal'], ['betMax', 'Aposta máxima'], ['lossWeek', 'Perda semanal']];
async function loadLimits() {
  let r;
  try { r = await api('/api/me/limits'); } catch (err) { toast('Erro', err.message, 'error'); return; }
  const box = $('#limitsBox');
  if (!box) return;
  const l = r.limits;
  box.innerHTML = `<form data-form="limits"><div class="form-grid">${LIMIT_FIELDS.map(([k, label]) => `<div class="field"><label>${label} (€)</label>
      <input name="${k}" type="number" min="1" step="1" inputmode="decimal" placeholder="Sem limite" value="${l[k] ?? ''}">
      ${l.pending[k] ? `<small class="muted">Passa a ${l.pending[k].value === null ? 'sem limite' : money(l.pending[k].value)} em ${esc(fmtDateTime(l.pending[k].at))}</small>` : ''}</div>`).join('')}
    </div><div class="form-actions"><button class="primary-btn">Guardar limites</button></div></form>
    <small class="muted">Baixar um limite aplica-se de imediato; subir ou retirar um limite só produz efeito 24 horas depois.</small>`;
}

async function loadStats() {
  let s;
  try { s = await api('/api/me/stats'); } catch (err) { toast('Erro', err.message, 'error'); return; }
  const box = $('#statsBox');
  if (!box) return;
  box.innerHTML = `<div class="pf-stats">
      <div><small>Apostas feitas</small><strong>${s.bets}</strong></div>
      <div><small>Total apostado</small><strong>${money(s.staked)}</strong></div>
      <div><small>Total ganho</small><strong class="green">${money(s.won)}</strong></div>
      <div><small>Maior ganho</small><strong class="gold">${money(s.biggestWin)}</strong></div>
      <div><small>Taxa de vitória</small><strong>${s.winRate}%</strong></div>
      <div><small>Total depositado</small><strong>${money(s.deposits)}</strong></div>
    </div>
    <div class="pf-actions"><a class="outline-btn" href="#/perfil/apostas">Ver as minhas apostas</a><a class="outline-btn" href="#/perfil/carteira">Ver movimentos</a></div>`;
}

function bankView() {
  const u = state.user;
  return `<form data-form="bank"><div class="form-grid">
      <div class="field"><label>IBAN</label><input name="iban" value="${esc(u.iban || '')}" placeholder="PT50 0000 0000 0000 0000 0000 0" autocomplete="off"></div>
      <div class="field"><label>Titular da conta</label><input name="ibanName" value="${esc(u.ibanName || u.name)}" autocomplete="name"></div>
      <div class="field"><label>NIF</label><input name="nif" value="${esc(u.nif || '')}" inputmode="numeric" maxlength="9" placeholder="123456789"></div>
    </div><div class="form-actions"><button class="primary-btn">Guardar dados bancários</button></div></form>
    <div class="pf-note">🔒 Os levantamentos são pagos apenas para contas em nome do titular da conta Bet62.</div>`;
}

function prefToggles(items) {
  const p = state.user.prefs || {};
  return `<div class="pf-list">${items.map(([k, label, sub]) => `<div class="pf-row"><div><b>${label}</b><small>${sub}</small></div>
    <button class="pf-toggle${p[k] ? ' on' : ''}" data-pref="${k}" role="switch" aria-checked="${!!p[k]}" aria-label="${label}"><i></i></button></div>`).join('')}</div>`;
}

const deviceName = (ua) => {
  if (!ua) return 'Dispositivo desconhecido';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Outro';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${br} · ${os}`;
};

// ---------- affiliate programme ----------

const AFF_STATE = {
  active: ['verified', 'Ativo'], pending: ['', 'Pendente de ativação'], suspended_balance: ['warn', 'Suspenso (saldo)'],
  suspended: ['warn', 'Suspenso'], blocked: ['bad', 'Bloqueado'],
};
const COMMISSION_LABEL = { pending: 'Em análise', approved: 'Aprovada', paid: 'Paga', reversed: 'Revertida', rejected: 'Rejeitada' };
const REFERRAL_LABEL = { pending: 'Registado', qualified: 'Qualificado', rejected: 'Não elegível' };

async function loadAffiliates() {
  let me; let stats; let refs; let coms;
  try {
    [me, stats, refs, coms] = await Promise.all([
      api('/api/affiliates/me'), api('/api/affiliates/me/stats'), api('/api/affiliates/me/referrals?size=20'), api('/api/affiliates/me/commissions'),
    ]);
  } catch (err) { toast('Erro', err.message, 'error'); return; }
  const box = $('#affBox');
  if (!box) return;
  if (!me.enabled) { box.innerHTML = '<div class="notice">O programa de afiliados ainda não está disponível. Avisaremos quando abrir.</div>'; return; }
  const [cls, label] = AFF_STATE[me.status] || ['', me.status];
  const a = me.activation;
  const check = (ok, text) => `<li class="${ok ? 'ok' : ''}">${ok ? '✔' : '○'} ${text}</li>`;
  // Each status apart: what is under review is not money the player has.
  const sums = ['pending', 'approved', 'paid', 'reversed'].map((k) => `<div class="aff-sum"><small>${COMMISSION_LABEL[k]}</small><b>${money(Number(stats.commissions[k].amount))}</b><span>${stats.commissions[k].count}</span></div>`).join('');
  box.innerHTML = `
    <div class="aff-link">
      <small>O seu link de convite</small>
      <div class="aff-url"><input readonly value="${esc(me.referralUrl)}" aria-label="Link de convite"><button class="primary-btn" data-aff-copy="${esc(me.referralUrl)}">Copiar</button>${navigator.share ? `<button class="outline-btn" data-aff-share="${esc(me.referralUrl)}">Partilhar</button>` : ''}</div>
      <div class="aff-code">Código: <b>${esc(me.referralCode)}</b> <span class="pf-badge ${cls}">${label}</span></div>
      ${me.reason ? `<p class="muted small">${esc(me.reason)}</p>` : ''}
    </div>
    <h4 class="aff-h">Ativação</h4>
    <ul class="aff-checks">
      ${check(a.hasQualifyingDeposit, `Depósito próprio confirmado de pelo menos ${money(Number(a.minimumDeposit))}`)}
      ${check(Number(a.eligibleBalance) >= Number(a.minimumBalance), `Saldo elegível de pelo menos ${money(Number(a.minimumBalance))} (atual: ${money(Number(a.eligibleBalance))}; sem bónus nem comissões)`)}
      ${check(!['suspended', 'blocked'].includes(me.status), 'Conta de afiliado sem suspensões')}
    </ul>
    <h4 class="aff-h">Resumo</h4>
    <div class="aff-sums">${sums}</div>
    <p class="muted small">${stats.clicks} visitas ao link · ${stats.referrals} registos · ${stats.qualified} qualificados</p>
    <h4 class="aff-h">Convidados</h4>
    ${refs.items.length ? `<div class="pf-list">${refs.items.map((r) => `<div class="pf-row"><div><b>${esc(r.name)}</b><small>${esc(fmtDateTime(r.registeredAt))}</small></div>
      <span class="pf-badge">${r.commissionStatus ? COMMISSION_LABEL[r.commissionStatus] : REFERRAL_LABEL[r.status] || r.status}</span></div>`).join('')}</div>
      ${refs.total > refs.items.length ? `<p class="muted small">A mostrar ${refs.items.length} de ${refs.total}.</p>` : ''}` : '<p class="muted small">Ainda não tem convidados.</p>'}
    <h4 class="aff-h">Comissões</h4>
    ${coms.items.length ? `<div class="pf-list">${coms.items.map((c) => `<div class="pf-row"><div><b>${money(Number(c.amount))} <small style="display:inline">(${c.rate}% de ${money(Number(c.deposit))})</small></b>
      <small>${esc(fmtDateTime(c.createdAt))}${c.reason && c.status !== 'paid' ? ` · ${esc(c.reason)}` : ''}</small></div><span class="pf-badge ${c.status === 'paid' ? 'verified' : ''}">${COMMISSION_LABEL[c.status] || c.status}</span></div>`).join('')}</div>` : '<p class="muted small">Ainda sem comissões.</p>'}
    <details class="aff-rules"><summary>Regras do programa</summary><ul>
      <li>Recebe ${me.commission.rate}% do <b>primeiro depósito elegível e confirmado</b> de cada convidado, uma única vez por convidado.</li>
      <li>Depósitos seguintes do mesmo convidado não geram comissão.</li>
      <li>Para ganhar, precisa de um depósito próprio confirmado de ${money(Number(a.minimumDeposit))} e de manter ${money(Number(a.minimumBalance))} de saldo elegível (bónus, free bets e comissões não contam).</li>
      <li>Não é permitido convidar-se a si próprio nem criar contas duplicadas. As comissões podem ser analisadas, e são revertidas se o depósito de origem for reembolsado ou contestado.</li>
      <li>Um convidado fica associado ao primeiro código com que se registou; isso não muda depois.</li>
    </ul></details>`;
}

async function loadSessions() {
  let r;
  try { r = await api('/api/me/sessions'); } catch (err) { toast('Erro', err.message, 'error'); return; }
  const box = $('#sessionsBox');
  if (!box) return;
  const others = r.sessions.filter((s) => !s.current).length;
  box.innerHTML = `<div class="pf-list">${r.sessions.map((s) => `<div class="pf-row"><div><b>${/Mobi|Android|iPhone/.test(s.device || '') ? '📱' : '💻'} ${esc(deviceName(s.device))}</b>
      <small>Início: ${esc(fmtDateTime(s.createdAt))}</small></div>${s.current ? '<span class="pf-badge verified">Este dispositivo</span>' : ''}</div>`).join('')}</div>
    ${others ? `<div class="pf-actions"><button class="danger-outline" data-action="end-sessions">Terminar as outras ${others} sessões</button></div>` : '<p class="muted small">Não há outras sessões abertas.</p>'}`;
}

function supportView() {
  const c = state.config || {};
  const rows = [
    c.supportEmail && ['✉️', 'Email de suporte', `<a href="mailto:${esc(c.supportEmail)}">${esc(c.supportEmail)}</a>`, 'Resposta até 24 horas úteis'],
    c.supportPhone && ['📞', 'Linha de apoio', `<a href="tel:${esc(c.supportPhone.replace(/\s+/g, ''))}">${esc(c.supportPhone)}</a>`, ''],
    ['🕒', 'Horário de atendimento', '24 horas, 7 dias por semana', ''],
    ['🛡️', 'Jogo responsável', 'SICAD — Linha Vida 1414', 'Apoio anónimo e confidencial'],
  ].filter(Boolean);
  return `<div class="pf-list">${rows.map(([i, l, v, s]) => `<div class="pf-row plain"><span class="pf-ico big">${i}</span><div class="grow"><small>${l}</small><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div></div>`).join('')}</div>
    <div class="pf-actions"><a class="outline-btn" href="#/perfil/limites">Limites e autoexclusão</a><a class="outline-btn" href="#/perfil/privacidade">Privacidade</a></div>`;
}

/** An element of the wallet forms: the one in the open wallet window first, else the one on the page. */
const walletEl = (sel) => $(`#modal ${sel}`) || $(sel);

const DEPOSIT_PRESETS = [10, 20, 50, 100, 200];
function depositFormHtml() {
  const c = state.config || {};
  if (c.paymentsMode === 'disabled') return '<div class="notice">Os depósitos ficam disponíveis assim que um fornecedor de pagamentos for configurado.</div>';
  return `${c.paymentsMode === 'demo' ? '<div class="notice"><strong>Modo demonstração:</strong> nenhum pagamento real é processado; o valor é creditado de imediato.</div><br>' : ''}
    <form data-form="deposit" class="deposit-form">
      <div class="methods">
        <label class="method"><input type="radio" name="method" value="mbway" checked>MB WAY</label>
        <label class="method"><input type="radio" name="method" value="multibanco">Multibanco</label>
        <label class="method"><input type="radio" name="method" value="cartao">Cartão</label>
      </div>
      <div class="amount-presets">${DEPOSIT_PRESETS.map((v) => `<button type="button" data-amount="${v}">€${v}</button>`).join('')}</div>
      <div class="form-grid">
        <div class="field"><label>Valor (€${c.minDeposit ?? 5} – €${c.maxDeposit ?? 5000})</label><input name="amount" type="number" min="${c.minDeposit ?? 5}" max="${c.maxDeposit ?? 5000}" step="0.01" value="20" required inputmode="decimal"></div>
        <div class="field mbway-only"><label>Telemóvel MB WAY</label><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="912 345 678" value="${esc(state.user.phone || '')}"></div>
      </div>
      <div class="promo-pick"><span>Promoção deste depósito</span>
        <label><input type="radio" name="promo" value="sport" checked> Bónus de desporto</label>
        <label><input type="radio" name="promo" value="casino"> Free Spins casino</label>
        <label><input type="radio" name="promo" value="none"> Sem promoção</label></div>
      <div class="deposit-offer" id="depositOffer"></div>
      <div class="form-actions"><button class="primary-btn">Depositar</button></div>
    </form>
    <div id="depositPanel"></div>`;
}

function withdrawFormHtml() {
  const c = state.config || {};
  return `<div class="pf-note warn">Mínimo €${c.minWithdraw ?? 10}. Transferência bancária para uma conta em seu nome, em 2 a 5 dias úteis.</div>
    <form data-form="withdraw"><div class="form-grid">
      <div class="field"><label>Valor (mín. €${c.minWithdraw ?? 10})</label><input name="amount" type="number" min="${c.minWithdraw ?? 10}" step="0.01" required inputmode="decimal"></div>
      <div class="field"><label>IBAN</label><input name="iban" required placeholder="PT50 0000 0000 0000 0000 0000 0" value="${esc(state.user.iban || '')}"></div>
    </div><div class="form-actions"><button class="outline-btn">Pedir levantamento</button></div></form>`;
}

function walletView() {
  setTimeout(loadWallet);
  setTimeout(depositOffer);
  // Back from a bank check (3-D Secure) that left the page: follow that deposit.
  const back = currentRoute().query.get('deposito');
  if (back) setTimeout(() => { history.replaceState(null, '', '#/perfil/carteira'); watchDeposit(back); });
  return `<div class="stat-grid"><div class="stat"><small>Saldo real (levantável)</small><strong id="walletBalance">${money(state.user.balance)}</strong></div>
      <div class="stat"><small>Saldo de bónus</small><strong>${money(state.user.bonus || 0)}</strong></div>
      <div class="stat"><small>Free bets</small><strong>${money(state.user.freebet || 0)}</strong></div></div>
    <h3>Depositar</h3>
    ${depositFormHtml()}
    <h3>Levantar</h3>
    ${withdrawFormHtml()}
    <div id="walletLists"><div class="loading">A carregar movimentos…</div></div>`;
}

/** The wallet window (the balance pill in the header): Depósito / Levantamento, in the middle of the screen. */
function openWalletModal(tab = 'deposit') {
  if (!state.user) return openAuth('login');
  const modal = $('#modal');
  modal.className = 'modal wallet-modal';
  const dep = tab === 'deposit';
  modal.innerHTML = `<div class="wm-head">
      <span class="wm-icon ${dep ? 'dep' : 'wd'}">${dep ? '+' : '↑'}</span>
      <div><strong>${dep ? 'Depósito' : 'Levantamento'}</strong><small>${dep ? 'MB WAY · Multibanco · Cartão' : 'Transferência bancária · IBAN'}</small></div>
      <div class="wm-bal"><small>Saldo atual</small><b>${money(state.user.balance)}</b></div>
      <button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></div>
    <div class="wm-tabs"><button class="${dep ? 'active dep' : ''}" data-wallet-tab="deposit">+ DEPOSITAR</button><button class="${dep ? '' : 'active wd'}" data-wallet-tab="withdraw">↑ LEVANTAR</button></div>
    <div class="modal-body">${dep ? depositFormHtml() : withdrawFormHtml()}</div>`;
  $('#modalBackdrop').classList.remove('hidden');
  if (dep) setTimeout(depositOffer);
}

// ---------- deposits through Stripe, inside the page ----------

function depositPanel(html) {
  const box = walletEl('#depositPanel');
  if (box) box.innerHTML = html;
  return box;
}

function depositDone(r) {
  state.depositWatch = null;
  state.user.balance = r.balance;
  depositPanel(`<div class="pay-box ok"><strong>Depósito confirmado</strong><span>${money(r.amount)} creditados na sua conta.</span></div>`);
  toast('Depósito confirmado', `Novo saldo: ${money(r.balance)}`);
  updateHeader(); loadWallet(); refreshMe();
}

/** Asks for the deposit's state until it is final (or the player leaves the wallet). */
async function watchDeposit(id, { every = 5000, forMs = 10 * 60_000 } = {}) {
  state.depositWatch = id;
  const until = Date.now() + forMs;
  while (state.depositWatch === id && Date.now() < until) {
    let r;
    try { r = await api(`/api/wallet/deposit/${encodeURIComponent(id)}`); } catch { r = null; }
    if (state.depositWatch !== id) return;
    if (r?.status === 'paid') return depositDone(r);
    if (r && ['failed', 'expired', 'mismatch'].includes(r.status)) {
      state.depositWatch = null;
      depositPanel(`<div class="pay-box error"><strong>Pagamento não concluído</strong><span>${r.method === 'mbway' ? 'O pedido MB WAY foi recusado ou expirou.' : 'O pagamento não foi confirmado.'} Pode tentar de novo.</span></div>`);
      return;
    }
    if (r && !walletEl('#depositPanel')?.innerHTML.trim()) depositPanel('<div class="pay-box"><strong>A aguardar confirmação do pagamento…</strong></div>');
    await new Promise((ok) => setTimeout(ok, every));
    if (!walletEl('#depositPanel')) { state.depositWatch = null; return; }
  }
}

let stripeJs = null;
function loadStripeJs() {
  stripeJs ||= new Promise((ok, fail) => {
    if (window.Stripe) return ok(window.Stripe);
    const el = document.createElement('script');
    el.src = 'https://js.stripe.com/v3/';
    el.onload = () => ok(window.Stripe);
    el.onerror = () => { stripeJs = null; fail(new Error('Não foi possível carregar o formulário de pagamento.')); };
    document.head.append(el);
  });
  return stripeJs;
}

/**
 * The card form in our own layout: card number, expiry and CVC are our fields (each one a small
 * Stripe frame, so the card data never touches our server), plus Stripe's Link button above them.
 */
async function showCardForm(p, clientSecret, publishableKey) {
  depositPanel('<div class="pay-box"><strong>A carregar o formulário seguro…</strong></div>');
  const Stripe = await loadStripeJs();
  const stripe = Stripe(publishableKey);
  const css = getComputedStyle(document.documentElement);
  const v = (n, d) => css.getPropertyValue(n).trim() || d;
  const returnUrl = `${location.origin}/#/perfil/carteira?deposito=${encodeURIComponent(p.id)}`;
  depositPanel(`<div class="pay-box card">
    <div class="pay-head"><strong>Pagamento por cartão</strong><b>${money(p.amount)}</b></div>
    <div class="link-pay hidden" id="linkPay"><div id="linkButton"></div><div class="pay-or"><span>ou pague com cartão</span></div></div>
    <div class="field"><label for="cardNumber">Número do cartão</label><div class="stripe-field" id="cardNumber"></div></div>
    <div class="pay-row">
      <div class="field"><label for="cardExpiry">Data de validade</label><div class="stripe-field" id="cardExpiry"></div></div>
      <div class="field"><label for="cardCvc">Código CVC</label><div class="stripe-field" id="cardCvc"></div></div>
    </div>
    <small class="pay-err" id="cardErr" role="alert"></small>
    <button class="primary-btn pay-btn" id="cardPay" disabled>Depositar ${money(p.amount)}</button>
    <small class="muted pay-safe">🔒 Pagamento seguro: os dados do cartão vão diretamente para a Stripe e não passam pelo nosso servidor.</small></div>`);

  const done = (status) => {
    depositPanel('<div class="pay-box"><strong>A confirmar o pagamento…</strong></div>');
    watchDeposit(p.id, { every: status === 'succeeded' ? 1500 : 5000 });
  };

  // Card fields.
  const cardEls = stripe.elements({ locale: 'pt' });
  const style = {
    base: {
      color: v('--text', '#e8eaed'), iconColor: v('--text-2', '#b0b7bf'), fontSize: '16px', fontWeight: '500',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSmoothing: 'antialiased', '::placeholder': { color: v('--text-4', '#676f79') },
    },
    invalid: { color: v('--down', '#e95a74'), iconColor: v('--down', '#e95a74') },
  };
  const fields = {
    cardNumber: cardEls.create('cardNumber', { style, showIcon: true, placeholder: '1234 1234 1234 1234' }),
    cardExpiry: cardEls.create('cardExpiry', { style, placeholder: 'MM/AA' }),
    cardCvc: cardEls.create('cardCvc', { style, placeholder: 'CVC' }),
  };
  const complete = {};
  const errors = {};
  const refresh = () => {
    const err = walletEl('#cardErr');
    if (err) err.textContent = Object.values(errors).find(Boolean) || '';
    const btn = walletEl('#cardPay');
    if (btn && !btn.dataset.busy) btn.disabled = !Object.keys(fields).every((k) => complete[k]);
  };
  for (const [id, el] of Object.entries(fields)) {
    el.mount(walletEl(`#${id}`));
    el.on('change', (e) => { complete[id] = e.complete; errors[id] = e.error?.message || ''; refresh(); });
  }
  walletEl('#cardPay').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.dataset.busy = '1'; btn.textContent = 'A processar…';
    const again = () => { delete btn.dataset.busy; btn.textContent = `Depositar ${money(p.amount)}`; refresh(); };
    try {
      // 3-D Secure, when the bank asks for it, opens over the page and comes back here.
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, { payment_method: { card: fields.cardNumber }, return_url: returnUrl });
      if (error) { toast('Pagamento recusado', error.message || 'Verifique os dados do cartão.', 'error'); return again(); }
      done(paymentIntent?.status);
    } catch (err) {
      toast('Pagamento', err.message, 'error');
      again();
    }
  });

  // Link: Stripe's own button (shown only when Link is available for this payment).
  try {
    const linkEls = stripe.elements({ clientSecret, locale: 'pt', appearance: { theme: 'night', variables: { borderRadius: '6px' } } });
    const ece = linkEls.create('expressCheckout', {
      paymentMethods: { link: 'auto', applePay: 'never', googlePay: 'never' },
      buttonHeight: 44,
    });
    ece.on('ready', ({ availablePaymentMethods } = {}) => {
      if (availablePaymentMethods?.link) walletEl('#linkPay')?.classList.remove('hidden');
    });
    ece.on('confirm', async () => {
      const { error, paymentIntent } = await stripe.confirmPayment({ elements: linkEls, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
      if (error) return toast('Pagamento recusado', error.message || 'O pagamento com Link não foi concluído.', 'error');
      done(paymentIntent?.status);
    });
    ece.mount(walletEl('#linkButton'));
  } catch { /* no Link: the card fields alone */ }
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

// ---------- my bets: tickets (open / settled / cash out / void) ----------

const BET_TABS = [['abertas', 'Em aberto'], ['resolvidas', 'Resolvidas'], ['cashout', 'Cash Out'], ['anuladas', 'Anuladas']];
const inTab = (b, t) => (t === 'abertas' ? b.status === 'open' : t === 'cashout' ? b.status === 'cashout' : t === 'anuladas' ? b.status === 'void' : b.status === 'won' || b.status === 'lost');

function betsView() {
  if (!state.myBets) loadBets();
  return `<div id="betsList">${myBetsHtml()}</div>`;
}

/** "As minhas apostas" (the ticket button in the header). */
function myBetsPage() {
  if (!state.user) return `<div class="panel empty"><p>Inicie sessão para ver as suas apostas.</p><div class="hero-actions"><button class="primary-btn" data-action="login">Entrar</button></div></div>${footer()}`;
  if (!state.myBets) loadBets();
  return `<div class="page-title"><h1>🎟️ As minhas apostas</h1><p>Os seus bilhetes, com o placar e o relógio dos jogos a decorrer.</p></div>
    <div id="betsList">${myBetsHtml()}</div>${footer()}`;
}

function myBetsHtml() {
  const bets = state.myBets;
  if (!bets) return '<div class="loading">A carregar apostas…</div>';
  const tab = state.betsTab || 'abertas';
  const list = bets.filter((b) => inTab(b, tab));
  const empty = { abertas: 'Sem apostas em aberto.', resolvidas: 'Sem apostas resolvidas.', cashout: 'Sem apostas com cash out.', anuladas: 'Sem apostas anuladas.' }[tab];
  return `<div class="mb-tabs">${BET_TABS.map(([k, l]) => { const n = bets.filter((b) => inTab(b, k)).length;
      return `<button class="${k === tab ? 'active' : ''}" data-bets-tab="${k}">${l}${n ? `<b>${n}</b>` : ''}</button>`; }).join('')}</div>
    ${list.length ? `<div class="tickets">${list.map(ticketCard).join('')}</div>`
      : `<div class="mb-empty"><div>🎟️</div><p>${empty}</p>${tab === 'abertas' ? '<a class="outline-btn" href="#/desporto">Escolher um jogo</a>' : ''}</div>`}`;
}

async function loadBets({ quiet = false } = {}) {
  try {
    const { bets } = await api('/api/bets');
    state.myBets = bets;
    updateHeader();
    // Don't redraw while the player confirms a cash out.
    if (state.cashoutConfirm) return;
    const box = $('#betsList');
    if (box) box.innerHTML = myBetsHtml();
  } catch (err) { if (!quiet) toast('Erro', err.message, 'error'); }
}

const TICKET_BADGE = { open: ['Pendente', 'pending'], won: ['Ganha', 'won'], lost: ['Perdida', 'lost'], void: ['Anulada', 'void'], cashout: ['Cash Out', 'cashout'] };
const LEG_ICON = { won: '<span class="lg-ic won">✓</span>', lost: '<span class="lg-ic lost">✕</span>', void: '<span class="lg-ic void">—</span>' };

/** One ticket, as in Bet62Novo: type, per-leg status, each pick with its match box (live: clock and score), totals, cash out, reference. */
function ticketCard(b) {
  const [badge, cls] = TICKET_BADGE[b.status] || TICKET_BADGE.open;
  const multi = b.legs.length > 1;
  const kind = b.type === 'builder' ? `Criador de apostas (${b.legs.length})` : multi ? `Múltipla (${b.legs.length})` : 'Simples';
  const dots = multi ? `<div class="tk-dots">${b.legs.map((l) => `<span class="tk-dot ${l.status}">${l.status === 'won' ? '✓' : l.status === 'lost' ? '✕' : l.status === 'void' ? '—' : ''}</span>`).join('')}</div>` : '';
  const legs = b.legs.map((l) => {
    const live = b.status === 'open' && l.eventStatus === 'live';
    const icon = LEG_ICON[l.status] || `<span class="lg-ic sport">${SPORT_META[l.sport]?.icon || '⚽'}</span>`;
    const top = live ? `<span class="tk-live"><i class="pulse-dot"></i>${esc(l.clock || 'Ao vivo')}</span>`
      : l.eventStatus === 'finished' ? 'Terminado' : l.eventStatus === 'cancelled' ? 'Cancelado' : esc(fmtWhen(l.startTime));
    const body = (live || l.eventStatus === 'finished' || l.eventStatus === 'live') && l.score ? esc(l.score) : l.eventStatus === 'cancelled' ? 'Jogo cancelado' : l.eventStatus === 'scheduled' ? 'Por começar' : '—';
    return `<div class="tk-leg">
      <div class="tk-leg-head">${icon}<div class="tk-pick"><strong>${esc(l.label || CODE_LABEL[l.code])}</strong><small>${esc(l.marketName && l.market !== '1x2' ? `${l.marketName} · ` : '')}${esc(l.match)}</small></div>
        <span class="tk-odd">${fmtOdds(l.odds)}</span></div>
      <a class="tk-box${live ? ' live' : ''}" href="#/jogo/${l.eventId}"><span class="tk-box-top">${top}</span><span class="tk-box-body">${body}</span></a>
    </div>`;
  }).join('');
  const paid = b.status === 'won' || b.status === 'cashout' || b.status === 'void';
  const ret = b.status === 'open' ? ['Retorno potencial', money(b.potential), '']
    : b.status === 'lost' ? ['Retorno', money(0), 'red']
      : b.status === 'void' ? ['Reembolso', money(b.payout), '']
        : b.status === 'cashout' ? ['Cash out', money(b.payout), 'tk-cash'] : ['Retorno', money(b.payout), 'green'];
  const profit = b.status === 'open' ? null : (b.freebet ? b.payout : b.payout - b.stake);
  return `<div class="ticket ${cls}">
    <div class="tk-head"><div><strong>${kind}</strong>${dots}</div><span class="tk-badge ${cls}">${badge}</span></div>
    ${b.freebet || b.bonusStake || b.protected ? `<div class="bet-tags">${b.freebet ? '<span class="pill open">🎁 Free bet</span>' : ''}${b.bonusStake ? `<span class="pill open">${money(b.bonusStake)} com bónus</span>` : ''}${b.protected ? '<span class="pill open">🛡️ Primeira aposta protegida</span>' : ''}</div>` : ''}
    <div class="tk-legs">${legs}</div>
    <div class="tk-sum">
      <div><span>Aposta</span><b>${money(b.stake)}${b.freebet ? ' (free bet)' : ''}</b></div>
      <div><span>Odd total</span><b>${fmtOdds(b.totalOdds)}</b></div>
      <div><span>${ret[0]}</span><b class="${ret[2]}">${ret[1]}</b></div>
      ${profit !== null ? `<div><span>Lucro / prejuízo</span><b class="${profit > 0 ? 'green' : profit < 0 ? 'red' : ''}">${profit > 0 ? '+' : ''}${money(profit)}</b></div>` : ''}
    </div>
    ${cashoutBlock(b)}
    <div class="tk-foot"><button class="tk-ref" data-copy="${esc(b.ref)}" title="Copiar referência">🎟️ Ref ${esc(b.ref)}</button><span>${esc(fmtDateTime(b.createdAt))}</span>
      ${b.settledAt && b.status !== 'open' ? `<small>Resolvida: ${esc(fmtDateTime(b.settledAt))}</small>` : ''}
      ${b.status === 'open' ? '<span class="tk-ok">✔ Aposta confirmada</span>' : b.status === 'won' ? '<span class="tk-ok won">🏆 Bilhete vencedor</span>' : ''}</div>
  </div>`;
}

function cashoutBlock(b) {
  if (b.status === 'cashout') return '<div class="co-btn locked">🔒 Cash out efetuado</div>';
  if (b.status !== 'open') return '';
  const c = b.cashout;
  if (!c || c.status === 'unavailable') return `<div class="co-btn locked">🔒 Cash out indisponível${c?.reason ? ` · ${esc(c.reason)}` : ''}</div>`;
  if (c.status === 'suspended') return `<div class="co-btn locked">🔒 Cash out suspenso${c.reason ? ` · ${esc(c.reason)}` : ''}</div>`;
  if (state.cashoutConfirm === b.id) {
    return `<div class="co-confirm"><div><small>Cash out</small><b>${money(c.value)}</b></div>
      <button class="ghost-btn" data-cashout-cancel>Cancelar</button><button class="co-yes" data-cashout-do="${b.id}" data-value="${c.value}">CONFIRMAR</button></div>`;
  }
  return `<button class="co-btn" data-cashout="${b.id}">↻ Cash Out ${money(c.value)}</button>`;
}

async function doCashout(id, value) {
  try {
    const r = await api(`/api/bets/${id}/cashout`, { method: 'POST', body: { value } });
    state.cashoutConfirm = null;
    state.user = r.user;
    toast('Cash out efetuado', `${money(r.value)} creditados no saldo.`);
    updateHeader();
    state.betsTab = 'cashout';
    await loadBets();
  } catch (err) {
    state.cashoutConfirm = null;
    toast('Cash out', err.message, 'error');
    await loadBets();
  }
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
  state.builder = null; // a pick of its own replaces a bet builder
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

// ---------- free bets in the slip ----------

/** The player's free bets that can be used now (the server re-checks everything when the bet is placed). */
const usableFreebets = () => (state.promos?.freebets || []).filter((f) => f.status === 'active' && Date.parse(f.expiresAt) > Date.now())
  .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
/** The free bet chosen in the slip, when the slip is one bet (a multiple, a builder or a single pick). */
function chosenFreebet() {
  if (!state.freebetId || !state.user) return null;
  const oneBet = state.builder || state.mode === 'multiple' || state.slip.length === 1;
  return oneBet ? usableFreebets().find((f) => f.id === state.freebetId) || null : null;
}
/** Shows the free-bet picker; a chosen free bet fixes the stake (its own amount). */
function freebetUi() {
  const list = usableFreebets();
  const oneBet = state.builder || state.mode === 'multiple' || state.slip.length === 1;
  const show = !!state.user && list.length > 0 && oneBet;
  $('#freebetPick').classList.toggle('hidden', !show);
  const fb = chosenFreebet();
  // The switch: left real money, right the free bet (the one that expires first).
  const sw = $('#fbSwitch');
  sw.classList.toggle('on', !!fb);
  sw.setAttribute('aria-checked', fb ? 'true' : 'false');
  const next = fb || list[0];
  $('#fbInfo').textContent = !show ? '' : fb
    ? `Freebet de ${money(fb.amount)} · válida até ${new Date(fb.expiresAt).toLocaleDateString('pt-PT')}${fb.minOdds > 1 ? ` · odd mín. ${fmtOdds(fb.minOdds)}` : ''}. Só os ganhos são pagos.`
    : list.length > 1 ? `Tem ${list.length} freebets disponíveis. Deslize para usar.` : `Tem uma freebet de ${money(next.amount)} disponível. Deslize para usar.`;
  $('#stake').disabled = !!fb;
  $$('.quick-stakes button').forEach((b) => { b.disabled = !!fb; });
  if (fb) $('#stake').value = fb.amount;
}

function slipTotals() {
  const fb = chosenFreebet();
  const stake = fb ? fb.amount : Number(String($('#stake').value).replace(',', '.')) || 0;
  const items = state.slip;
  // A free bet pays only the winnings (its stake is not returned).
  const net = (p) => (fb ? Math.max(0, p - stake) : p);
  if (state.builder) {
    const odds = builderTotal(state.builder);
    return { stake, total: stake, odds, potential: net(Math.min(stake * odds, state.config?.maxPayout ?? Infinity)), freebet: fb };
  }
  if (state.mode === 'multiple') {
    const odds = items.reduce((a, s) => a * s.odds, 1);
    return { stake, total: stake, odds, potential: net(Math.min(stake * odds, state.config?.maxPayout ?? Infinity)), freebet: fb };
  }
  if (fb && items.length === 1) return { stake, total: stake, odds: null, potential: net(Math.min(stake * items[0].odds, state.config?.maxPayout ?? Infinity)), freebet: fb };
  const potential = items.reduce((a, s) => a + Math.min(stake * s.odds, state.config?.maxPayout ?? Infinity), 0);
  return { stake, total: stake * items.length, odds: null, potential };
}

function renderBuilderSlip() {
  const b = state.builder;
  const n = b.legs.length;
  $('#betCount').textContent = 'Criador de apostas';
  $('#slipFabCount').textContent = n;
  $('#slipFab').classList.toggle('hidden', false);
  $$('.bet-tabs button').forEach((x) => x.classList.remove('active'));
  const changed = b.legs.some((l) => l.newOdds);
  $('#betItems').innerHTML = `<div class="bet-item${changed ? ' warn' : ''}">
      <div class="bet-item-top"><span>${esc(b.competition)} · Criador de apostas</span><span><span class="odd">${fmtOdds(builderTotal(b))}</span><button class="remove-bet" data-remove-builder aria-label="Remover">×</button></span></div>
      <strong>${esc(b.match)}</strong>
      ${b.legs.map((l) => `<div class="selection">${esc(l.label)} <small class="muted">· ${esc(l.marketName)}</small>${l.newOdds ? ` <small class="note">${fmtOdds(l.odds)} → ${fmtOdds(l.newOdds)}</small>` : ''}</div>`).join('')}
    </div>`;
  $('#betFooter').classList.remove('hidden');
  freebetUi();
  const t = slipTotals();
  $('#oddsLabel').textContent = 'Cotação do criador';
  $('#totalOdds').textContent = fmtOdds(t.odds);
  $('#stakeLabel').textContent = 'Valor da aposta';
  $('#totalStake').textContent = money(t.total);
  $('#potential').textContent = money(t.potential);
  $('#slipError').classList.add('hidden');
  const btn = $('#placeBet');
  btn.disabled = false;
  btn.textContent = changed ? 'ACEITAR NOVAS ODDS' : state.user ? 'APOSTAR AGORA' : 'ENTRAR PARA APOSTAR';
  btn.dataset.state = changed ? 'accept' : 'place';
}

function renderSlip() {
  if (state.builder) return renderBuilderSlip();
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

  freebetUi();
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
    state.builder?.legs.forEach((l) => { if (l.newOdds) { l.odds = l.newOdds; delete l.newOdds; } });
    state.slip.forEach((s) => { if (s.newOdds) s.odds = s.newOdds; });
    saveSlip();
    renderSlip();
    return;
  }
  if (!state.user) return openAuth('login');
  const { stake, freebet } = slipTotals();
  btn.disabled = true;
  btn.textContent = 'A PROCESSAR…';
  try {
    const b = state.builder;
    const res = await api('/api/bets', {
      method: 'POST',
      body: b
        ? { mode: 'builder', stake, freebetId: freebet?.id, selections: b.legs.map((l) => ({ selectionId: l.selectionId, odds: l.odds })) }
        : { mode: state.mode, stake, freebetId: freebet?.id, selections: state.slip.map((s) => ({ selectionId: s.selectionId, odds: s.odds })) },
    });
    if (res.user) state.user = res.user; else state.user.balance = res.balance;
    if (freebet) { state.freebetId = null; loadPromos(); }
    loadBets({ quiet: true });
    state.slip = [];
    state.builder = null;
    saveSlip();
    toast('Aposta registada', `${res.betIds.length > 1 ? `${res.betIds.length} apostas` : `Aposta #${res.betIds[0]}`} · saldo ${money(res.balance)}`);
    updateHeader();
    syncSelectedButtons();
    setSlipOpen(false);
  } catch (err) {
    if (err.data?.changes) {
      for (const c of err.data.changes) {
        const item = state.slip.find((s) => s.selectionId === c.selectionId) || state.builder?.legs.find((l) => l.selectionId === c.selectionId);
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
  $('#myBetsBtn').classList.toggle('hidden', !u);
  if (!u) { $('#freebetPill').classList.add('hidden'); state.myBets = null; }
  $('#profileBtn').classList.toggle('hidden', !u);
  if (u) {
    $('#headerBalance').textContent = money(u.balance);
    // Open tickets on the ticket button.
    const open = (state.myBets || []).filter((b) => b.status === 'open').length;
    $('#myBetsCount').textContent = open || '';
    $('#myBetsCount').classList.toggle('hidden', !open);
    // Free bets beside the balance (shown only, not a button): "5,00 F".
    const fb = Number(u.freebet) || 0;
    $('#freebetPill').classList.toggle('hidden', !fb);
    $('#headerFreebet').textContent = `${fb.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} F`;
    $('#profileBtn').textContent = initials(u.name);
  }
}

// "England. Premier League" → "Premier League" under the England heading.
// "WTA. Beijing" → "WTA Beijing" (the tour is part of the name).
const leagueShort = (name) => String(name).replace(/^(ATP|WTA)\.\s+/, '$1 ').replace(/^[^.]+\.\s+(?=\S)/, '');

/** A sport's countries and leagues in the sidebar (opened by clicking the sport). */
function sideTree(sport) {
  const tree = state.leagueTree?.[sport];
  if (!tree || !state.sideOpen[sport]) return '';
  const { page, sub, rest } = currentRoute();
  const current = page === 'desporto' && sub === 'liga' ? decodeURIComponent(rest) : null;
  return `<div class="side-tree">${tree.map(({ country, leagues }) => {
    const total = leagues.reduce((n, l) => n + l.count, 0);
    const open = state.sideOpen[`${sport}|${country}`] || leagues.some((l) => l.name === current);
    return `<button class="side-country${open ? ' open' : ''}${total ? '' : ' none'}" data-side-country="${esc(`${sport}|${country}`)}">
        <i class="caret">${open ? '▾' : '▸'}</i>${countryFlag(country)}${esc(country)}<b>${total || ''}</b></button>
      ${open ? leagues.map((l) => `<a class="side-league${l.name === current ? ' active' : ''}${l.count ? '' : ' none'}" href="#/desporto/liga/${encodeURIComponent(l.name)}">
        ${esc(leagueShort(l.name))}<b>${l.count || ''}</b></a>`).join('') : ''}`;
  }).join('')}</div>`;
}

function renderSidebar() {
  const counts = {};
  for (const e of state.events) counts[e.sport] = (counts[e.sport] || 0) + 1;
  $('#sportLinks').innerHTML = Object.entries(SPORT_META)
    .map(([k, v]) => {
      const tree = !!state.leagueTree?.[k];
      return `<a class="side-link" href="#/desporto" data-sport-link="${k}"${tree ? ` data-side-open="${k}"` : ''}><span>${v.icon}</span> ${v.name} <b>${counts[k] || ''}</b>${tree ? `<i class="caret">${state.sideOpen[k] ? '▾' : '▸'}</i>` : ''}</a>${sideTree(k)}`;
    }).join('');
  const live = state.events.filter((e) => e.status === 'live').length;
  $('#liveCount').textContent = live || '';
}

/**
 * Sets `root` to `html` but keeps the element #keepId (and its ancestors) in place: everything
 * around it is replaced, it and its children stay untouched. Falls back to innerHTML when the new
 * page has no such element.
 */
function mergeKeeping(root, html, keepId) {
  const fresh = document.createElement('div');
  fresh.innerHTML = html;
  if (!fresh.querySelector(`#${keepId}`)) { root.innerHTML = html; return; }
  const holds = (n) => n.nodeType === 1 && (n.id === keepId || !!n.querySelector(`#${keepId}`));
  (function merge(oldEl, newEl) {
    if (oldEl !== root) {
      for (const a of [...oldEl.attributes]) if (!newEl.hasAttribute(a.name)) oldEl.removeAttribute(a.name);
      for (const a of [...newEl.attributes]) if (oldEl.getAttribute(a.name) !== a.value) oldEl.setAttribute(a.name, a.value);
    }
    if (oldEl.id === keepId) return;
    const oldPath = [...oldEl.childNodes].find(holds);
    const kids = [...newEl.childNodes];
    const i = kids.findIndex(holds);
    for (const c of [...oldEl.childNodes]) if (c !== oldPath) c.remove();
    oldPath.before(...kids.slice(0, i));
    oldPath.after(...kids.slice(i + 1));
    merge(oldPath, kids[i]);
  })(root, fresh);
}

function currentRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [page = '', sub = '', ...rest] = path.split('/');
  return { page: page || 'home', sub, rest: rest.join('/'), query: new URLSearchParams(query) };
}

function render({ keepScroll = false } = {}) {
  const { page, sub, rest } = currentRoute();
  const pages = {
    home: homePage, desporto: () => sportsPage(sub, rest), 'ao-vivo': livePage, casino: () => (sub === 'jogo' && rest ? casinoGamePage(Number(rest)) : casinoPage()),
    promocoes: promosPage, perfil: () => accountPage(sub), jogo: () => matchPage(sub), apostas: myBetsPage,
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
  // The casino has no sports menu nor bet slip: its pages take the whole width.
  document.body.classList.toggle('casino-mode', page === 'casino' && !immersive);
  // Carousels keep their position when the page refreshes itself (odds, live scores).
  const carScroll = keepScroll ? $$('#content .carousel').map((c) => [c.id, $('.car-track', c).scrollLeft]) : [];
  const html = immersive ? casinoPlayPage() : (pages[page] || homePage)();
  // A playing video must never leave the document: an iframe that is detached, even for a moment,
  // reloads (black "Loading stream…", sound lost). The match page refreshes every few seconds, so
  // there the new page is merged around the slot that holds it instead of replacing everything.
  const keep = page === 'jogo' ? $('#content #trackerInline') : null;
  if (keep?.querySelector('iframe')) mergeKeeping($('#content'), html, 'trackerInline');
  else $('#content').innerHTML = html;
  for (const [id, left] of carScroll) { const t = $(`#${id} .car-track`); if (t) t.scrollLeft = left; }
  if (page === 'jogo') afterMatchRender();
  $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === page));
  if (!keepScroll) window.scrollTo({ top: 0 });
}

/** The phone menu: opened and closed by its button (or a swipe), never by a page refresh. */
function setSideMenu(open) {
  $('#leftSidebar').classList.toggle('open', open);
  $('#menuBtn')?.setAttribute('aria-expanded', String(open));
}

/** Re-renders only pages that show odds, and never while the user is typing. */
function refreshView() {
  const { page } = currentRoute();
  if (!['home', 'desporto', 'ao-vivo'].includes(page)) return;
  if (document.activeElement && $('#content').contains(document.activeElement) && document.activeElement.matches('input, select')) return;
  render({ keepScroll: true });
  if (!$('#modalBackdrop').classList.contains('hidden') && $('#searchInput')) renderSearch($('#searchInput').value);
}

async function loadLeagues() {
  try {
    const { leagues } = await api('/api/leagues');
    const first = !state.leagueTree;
    state.leagueTree = leagues;
    renderSidebar();
    // A league page opened before the trees arrived: now its sport is known.
    if (first && currentRoute().sub === 'liga') render({ keepScroll: true });
  } catch { /* the sidebar works without it */ }
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
    if (user) { loadPromos(); loadBets({ quiet: true }); } else state.promos = null;
  } catch (err) {
    // Only a real sign-out clears the account; a dropped connection keeps the last balance shown.
    if (err.status === 401) state.user = null;
  }
  updateHeader();
}

/**
 * Coming back to the page (tab shown again, app reopened, phone unlocked, back online): fetch
 * everything fresh at once instead of waiting for the next poll, so old data never stays on screen.
 */
let lastResume = 0;
async function resume() {
  if (document.hidden || Date.now() - lastResume < 2000) return;
  lastResume = Date.now();
  try {
    const c = await api('/api/config');
    // A deploy happened while away: load the new version.
    if (state.config?.version && c.version && c.version !== state.config.version && !state.casinoSession) { window.location.reload(); return; }
  } catch { /* offline: the polls retry */ }
  await Promise.all([refreshMe(), refreshEvents(), loadLeagues()]);
  const { page, sub } = currentRoute();
  if (page === 'jogo' && state.match.id) loadMatch(state.match.id, { quiet: true });
  if (page === 'perfil' && sub === 'carteira') loadWallet();
  renderSlip();
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
      body: { name: d.name, email: d.email, birthdate: d.birthdate, phone: d.phone, password: d.password, acceptTerms: form.acceptTerms.checked, ref: referralCode() || undefined },
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
  async limits(form) {
    const d = formData(form);
    await api('/api/me/limits', { method: 'PUT', body: Object.fromEntries(LIMIT_FIELDS.map(([k]) => [k, d[k] === '' ? null : d[k]])) });
    toast('Limites guardados');
    loadLimits();
  },
  async bank(form) {
    const d = formData(form);
    const { user } = await api('/api/me', { method: 'PATCH', body: { iban: d.iban, ibanName: d.ibanName, nif: d.nif } });
    state.user = user;
    toast('Dados bancários guardados');
    render({ keepScroll: true });
  },
  async kyc(form) {
    const file = form.file.files[0];
    if (!file) throw new Error('Escolha um ficheiro.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Ficheiro demasiado grande (máximo 5 MB).');
    const data = await new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1] || '');
      r.onerror = () => fail(new Error('Não foi possível ler o ficheiro.'));
      r.readAsDataURL(file);
    });
    await api('/api/me/kyc', { method: 'POST', body: { kind: form.kind.value, mimeType: file.type, fileName: file.name, data } });
    if (state.user.kycStatus !== 'approved') state.user.kycStatus = 'pending';
    toast('Documento enviado', 'A equipa vai analisá-lo em até 48 horas úteis.');
    loadKyc();
  },
  async password(form) {
    const d = formData(form);
    if (d.newPassword !== d.confirmPassword) throw new Error('As palavras-passe novas não coincidem.');
    await api('/api/me/password', { method: 'POST', body: { currentPassword: d.currentPassword, newPassword: d.newPassword } });
    form.reset();
    toast('Palavra-passe alterada', 'As outras sessões foram terminadas.');
  },
  async deposit(form) {
    const d = formData(form);
    const res = await api('/api/wallet/deposit', { method: 'POST', body: { amount: d.amount, method: d.method, phone: d.phone, promo: d.promo || 'none' } });
    if (res.payment) {
      const p = res.payment;
      state.depositWatch = null;
      if (p.status === 'paid') return depositDone({ ...p, balance: res.balance });
      if (p.method === 'cartao') return showCardForm(p, res.clientSecret, res.publishableKey);
      if (p.method === 'multibanco') {
        depositPanel(`<div class="pay-box mb"><strong>Referência Multibanco</strong>
          <dl><dt>Entidade</dt><dd>${esc(p.entity || '—')}</dd><dt>Referência</dt><dd>${esc(String(p.reference || '—').replace(/(\d{3})(?=\d)/g, '$1 '))}</dd><dt>Valor</dt><dd>${money(p.amount)}</dd>
          ${p.expiresAt ? `<dt>Válida até</dt><dd>${esc(fmtDateTime(p.expiresAt))}</dd>` : ''}</dl>
          <span>Pague num multibanco ou no homebanking. O saldo é creditado automaticamente após o pagamento.</span></div>`);
        return watchDeposit(p.id, { every: 15_000, forMs: 60 * 60_000 });
      }
      depositPanel(`<div class="pay-box"><strong>Pedido MB WAY enviado</strong><span>Confirme o pagamento de ${money(p.amount)} na app MB WAY (tem cerca de 4 minutos).</span></div>`);
      return watchDeposit(p.id, { every: 4000, forMs: 6 * 60_000 });
    }
    if (res.user) state.user = res.user; else state.user.balance = res.balance;
    if (form.closest('#modal')) closeModal();
    toast('Depósito efetuado', `Novo saldo: ${money(res.balance)}${res.bonus ? ` · ${res.bonus.name}: ${res.bonus.spins ? `${res.bonus.spins} rodadas (${money(res.bonus.amount)})` : money(res.bonus.amount)}` : ''}`);
    updateHeader(); loadWallet(); loadPromos();
  },
  async withdraw(form) {
    const d = formData(form);
    let res;
    try {
      res = await api('/api/wallet/withdraw', { method: 'POST', body: { amount: d.amount, iban: d.iban } });
    } catch (err) {
      // A deposit bonus is running: withdrawing cancels it, so the player confirms first.
      if (!err.data?.bonusActive || !confirm(`${err.message}\n\nContinuar com o levantamento?`)) throw err;
      res = await api('/api/wallet/withdraw', { method: 'POST', body: { amount: d.amount, iban: d.iban, forfeitBonus: true } });
      loadPromos(); refreshMe();
    }
    state.user.balance = res.balance;
    form.reset();
    if (form.closest('#modal')) closeModal();
    toast('Levantamento pedido', 'O pedido será analisado pela equipa.');
    updateHeader(); loadWallet();
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
  const liveTv = e.target.closest('[data-live-tv]');
  if (liveTv) { state.liveTv = !state.liveTv; render({ keepScroll: true }); return; }
  const liveSport = e.target.closest('[data-live-sport]');
  if (liveSport) { state.liveSport = liveSport.dataset.liveSport; render({ keepScroll: true }); return; }
  const matchView = e.target.closest('[data-match-view]');
  if (matchView) { state.match.view = matchView.dataset.matchView; render({ keepScroll: true }); return; }
  const expand = e.target.closest('[data-expand]');
  if (expand) { toggleExpand(expand.closest('.trk, .stream-box')); return; }
  const marketCatBtn = e.target.closest('[data-market-cat]');
  if (marketCatBtn) { state.match.cat = marketCatBtn.dataset.marketCat; render({ keepScroll: true }); return; }

  const remove = e.target.closest('[data-remove]');
  if (remove) {
    state.slip = state.slip.filter((s) => s.selectionId !== Number(remove.dataset.remove));
    saveSlip(); autoMode(); syncSelectedButtons(); renderSlip();
    return;
  }

  const builderBtn = e.target.closest('[data-builder]');
  if (builderBtn) { addBuilder(Number(builderBtn.dataset.builder)); return; }
  const accaBtn = e.target.closest('[data-acca]');
  if (accaBtn) { addAcca(Number(accaBtn.dataset.acca)); return; }
  if (e.target.closest('[data-remove-builder]')) { state.builder = null; saveSlip(); renderSlip(); return; }

  const sport = e.target.closest('[data-sport]');
  if (sport) { state.sport = sport.dataset.sport; render({ keepScroll: true }); return; }
  const sportLink = e.target.closest('[data-sport-link]');
  if (sportLink) {
    // A sport with a league tree opens / closes its countries as well.
    if (sportLink.dataset.sideOpen) { state.sideOpen[sportLink.dataset.sideOpen] = !state.sideOpen[sportLink.dataset.sideOpen]; renderSidebar(); }
    state.sport = sportLink.dataset.sportLink;
    if (location.hash === '#/desporto') render();
    return;
  }
  const sideCountry = e.target.closest('[data-side-country]');
  if (sideCountry) { const k = sideCountry.dataset.sideCountry; state.sideOpen[k] = !state.sideOpen[k]; renderSidebar(); return; }
  // A league or page picked in the phone menu: go there and put the menu away (expanding a sport or
  // a country above keeps it open).
  if (e.target.closest('#leftSidebar a[href]:not([data-sport-link])')) setSideMenu(false);

  const gameId = e.target.closest('[data-game-id]');
  if (gameId) { location.hash = `#/casino/jogo/${gameId.dataset.gameId}`; return; }
  const game = e.target.closest('[data-game]');
  if (game && !game.matches('form')) {
    // BigBang: the game's own page first (Jogar / Testar); the older aggregator opens it straight away.
    const g = state.casino.games[Number(game.dataset.game)];
    if (state.casino.bigbang && g) location.hash = `#/casino/jogo/${g.id}`; else openGame(Number(game.dataset.game));
    return;
  }
  const betsTab = e.target.closest('[data-bets-tab]');
  if (betsTab) { state.betsTab = betsTab.dataset.betsTab; state.cashoutConfirm = null; const box = $('#betsList'); if (box) box.innerHTML = myBetsHtml(); return; }
  const coAsk = e.target.closest('[data-cashout]');
  if (coAsk) { state.cashoutConfirm = Number(coAsk.dataset.cashout); $('#betsList').innerHTML = myBetsHtml(); return; }
  if (e.target.closest('[data-cashout-cancel]')) { state.cashoutConfirm = null; $('#betsList').innerHTML = myBetsHtml(); return; }
  const coDo = e.target.closest('[data-cashout-do]');
  if (coDo) { coDo.disabled = true; coDo.textContent = 'A CONFIRMAR…'; doCashout(Number(coDo.dataset.cashoutDo), Number(coDo.dataset.value)); return; }
  const affCopy = e.target.closest('[data-aff-copy]');
  if (affCopy) { navigator.clipboard?.writeText(affCopy.dataset.affCopy).then(() => toast(affCopy.dataset.affLabel || 'Link copiado', affCopy.dataset.affCopy)).catch(() => {}); return; }
  const affShare = e.target.closest('[data-aff-share]');
  if (affShare) { navigator.share?.({ title: 'Bet62', text: 'Junta-te a mim na Bet62', url: affShare.dataset.affShare }).catch(() => {}); return; }
  const copy = e.target.closest('[data-copy]');
  if (copy) { navigator.clipboard?.writeText(copy.dataset.copy).then(() => toast('Referência copiada', copy.dataset.copy)).catch(() => {}); return; }
  const walletTab = e.target.closest('[data-wallet-tab]');
  if (walletTab) { openWalletModal(walletTab.dataset.walletTab); return; }
  const preset = e.target.closest('.amount-presets [data-amount]');
  if (preset) {
    const input = preset.closest('form').amount;
    input.value = preset.dataset.amount;
    $$('[data-amount]', preset.parentElement).forEach((b) => b.classList.toggle('active', b === preset));
    depositOffer();
    return;
  }
  const cgPlay = e.target.closest('[data-cg-play]');
  if (cgPlay) { playCasino(cgPlay.dataset.cgPlay); return; }
  const cat = e.target.closest('[data-casino-cat]');
  if (cat) { Object.assign(state.casinoFilter, { category: cat.dataset.casinoCat, provider: '' }); loadCasino({ reset: true }); window.scrollTo({ top: 0 }); return; }
  const prov = e.target.closest('[data-casino-prov]');
  if (prov) { Object.assign(state.casinoFilter, { provider: prov.dataset.casinoProv, category: '' }); loadCasino({ reset: true }); window.scrollTo({ top: 0 }); return; }

  // Profile: the phone accordion (a tap on the open section closes it), switches and buttons.
  const acc = e.target.closest('[data-pf-acc]');
  if (acc) {
    e.preventDefault();
    const id = acc.dataset.pfAcc;
    const wasOpen = acc.parentElement.classList.contains('open');
    state.profileCollapsed = wasOpen;
    if (!wasOpen) history.replaceState(null, '', `#/perfil/${id}`);
    render({ keepScroll: true });
    if (!wasOpen) $(`#pf-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  const pref = e.target.closest('[data-pref]');
  if (pref) {
    const k = pref.dataset.pref;
    const on = !pref.classList.contains('on');
    pref.classList.toggle('on', on);
    pref.setAttribute('aria-checked', String(on));
    try {
      const { user } = await api('/api/me', { method: 'PATCH', body: { prefs: { [k]: on } } });
      state.user = user;
    } catch (err) {
      pref.classList.toggle('on', !on);
      pref.setAttribute('aria-checked', String(!on));
      toast('Erro', err.message, 'error');
    }
    return;
  }
  const excl = e.target.closest('[data-exclude]');
  if (excl) {
    if (!confirm(`Ativar autoexclusão por ${excl.dataset.label}? Não pode ser anulada antes do fim.`)) return;
    try {
      const { user } = await api('/api/me/self-exclusion', { method: 'POST', body: { days: Number(excl.dataset.exclude) } });
      state.user = user;
      toast('Autoexclusão ativada');
      render({ keepScroll: true });
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }

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
  } else if (action === 'logout') {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    state.user = null;
    toast('Sessão terminada');
    updateHeader(); renderSlip();
    location.hash = '#/';
    render();
  } else if (action === 'fs-claim') {
    if (!confirm('Terminar as Free Spins? Os ganhos acima do valor oferecido passam a saldo real; o resto das rodadas deixa de estar disponível.')) return;
    try {
      const r = await api(`/api/me/free-spins/${actionEl.dataset.id}/claim`, { method: 'POST', body: {} });
      state.user = r.user;
      toast('Free Spins terminadas', r.paid > 0 ? `${money(r.paid)} de ganhos creditados no saldo.` : 'Sem ganhos a pagar.');
      updateHeader(); loadPromos();
    } catch (err) { toast('Erro', err.message, 'error'); }
  } else if (action === 'end-sessions') {
    try {
      const { ended } = await api('/api/me/sessions/end-others', { method: 'POST', body: {} });
      toast('Sessões terminadas', `${ended} ${ended === 1 ? 'sessão terminada' : 'sessões terminadas'}.`);
      loadSessions();
    } catch (err) { toast('Erro', err.message, 'error'); }
  } else if (action === 'delete-account') {
    const c = state.config || {};
    toast('Eliminar conta', c.supportEmail ? `Para eliminar a conta, contacte ${c.supportEmail}.` : 'Para eliminar a conta, contacte o suporte.');

  }
});

// A casino thumbnail that fails to load shows the generic art instead.
document.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement && e.target.classList.contains('game-img')) e.target.replaceWith('🎰');
}, true);

// A sidebar flag that fails to load becomes a globe (same size, so the list does not jump).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('side-flag')) return;
  const globe = document.createElement('span');
  globe.className = 'side-flag globe';
  globe.textContent = '🌐';
  img.replaceWith(globe);
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
  if (e.target.closest('form[data-form="deposit"]')) depositOffer();
});
document.addEventListener('change', (e) => { if (e.target.closest('form[data-form="deposit"]')) depositOffer(); });

// What the deposit typed would earn (decided again by the server when the payment is confirmed).
let offerTimer = null;
function depositOffer() {
  clearTimeout(offerTimer);
  offerTimer = setTimeout(async () => {
    const form = walletEl('form[data-form="deposit"]');
    const box = walletEl('#depositOffer');
    if (!form || !box) return;
    const promo = form.promo?.value || 'none';
    if (promo === 'none') { box.innerHTML = '<small class="muted">Sem promoção neste depósito.</small>'; return; }
    try {
      const o = await api(`/api/promotions/offer?amount=${encodeURIComponent(form.amount.value)}&method=${encodeURIComponent(form.method.value)}&promo=${promo}`);
      box.innerHTML = o.spins > 0
        ? `<div class="offer ok">🎰 ${esc(o.name)}: <b>${o.spins} rodadas de ${money(o.spinValue)}</b> (${money(o.bonus)}) após a confirmação do pagamento.</div>`
        : o.bonus > 0
          ? `<div class="offer ok">🎁 ${esc(o.name)}: <b>+${money(o.bonus)}</b> em saldo de bónus após a confirmação do pagamento.</div>`
          : `<small class="muted">${esc(o.name)}: ${esc(o.reason || 'não aplicável')}.</small>`;
    } catch { box.innerHTML = ''; }
  }, 300);
}

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
  $('#menuBtn').addEventListener('click', () => setSideMenu(!$('#leftSidebar').classList.contains('open')));
  $('#closeMenu').addEventListener('click', () => setSideMenu(false));
  // A swipe to the left on the open menu closes it.
  const side = $('#leftSidebar');
  let touch = null;
  side.addEventListener('touchstart', (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; }, { passive: true });
  side.addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    touch = null;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) setSideMenu(false);
  }, { passive: true });
  $('#slipFab').addEventListener('click', () => setSlipOpen(true));
  $('#closeSlip').addEventListener('click', () => setSlipOpen(false));
  $('#clearBets').addEventListener('click', () => { state.slip = []; state.builder = null; saveSlip(); autoMode(); syncSelectedButtons(); renderSlip(); });
  $('#placeBet').addEventListener('click', placeBet);
  $$('.bet-tabs button').forEach((b) => b.addEventListener('click', () => {
    if (state.builder) return; // a bet builder is one bet
    state.mode = b.dataset.tab;
    try { localStorage.setItem('classicbet_mode_touched', '1'); } catch { /* ignore */ }
    renderSlip();
  }));
  $$('.quick-stakes button').forEach((b) => b.addEventListener('click', () => { $('#stake').value = b.dataset.stake; renderSlip(); }));
  $('#balanceBtn').addEventListener('click', () => openWalletModal('deposit'));
  $('#fbSwitch').addEventListener('click', () => {
    // Real money ↔ free bet: the one that expires first, or the next one when the player switches again.
    state.freebetId = chosenFreebet() ? null : usableFreebets()[0]?.id ?? null;
    renderSlip();
  });
  $('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); setSlipOpen(false); const big = $('.expanded'); if (big) toggleExpand(big); } });
  window.addEventListener('hashchange', () => { state.profileCollapsed = false; render(); });
  // Phone / installed app: the page never zooms (Safari ignores user-scalable=no, so pinches are stopped here;
  // double taps are stopped by touch-action in the CSS, focusing a field by 16px text).
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // The profile is a side menu on a computer and an accordion on a phone: redrawn when that changes.
  matchMedia('(max-width: 760px)').addEventListener('change', () => { if (currentRoute().page === 'perfil') render({ keepScroll: true }); });
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
  goalkick: 'Pontapé de baliza', penalty: 'Penálti', shot: 'Remate', halftime: 'Intervalo',
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
  stopRapid();
  Object.assign(m, { id: null, data: null, extras: null, tab: 'mercados', cat: 'todos', view: 'tracker', es: null, timer: null, ball: null, prevBall: null, actions: [], live: null, streaming: false, widget: null, widgetKind: null, streamEl: null, streamKey: null });
  clearTimeout(m.streamTimer);
  $('#sideTracker')?.replaceChildren();
}

async function loadMatch(id, { quiet = false } = {}) {
  try {
    const { event } = await api(`/api/events/${id}`);
    if (state.match.id !== id) return;
    const wasLive = state.match.data?.status === 'live';
    state.match.data = event;
    if (event.status !== 'scheduled') loadMatchExtras(id);
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
  const tabs = [['mercados', 'Mercados'], ['estatisticas', 'Estatísticas']];
  if (!tabs.some(([k]) => k === m.tab)) m.tab = 'mercados';
  const body = m.tab === 'estatisticas' ? (football ? matchStatsView(e) : sportStatsView(e)) : marketsView(e);

  return `<a class="back-link" href="#/${live ? 'ao-vivo' : 'desporto'}">‹ Voltar</a>
    <section class="match-hero">
      <div class="match-comp">${e.leagueLogo ? `<span class="league-logo" data-icon="⚽"><img class="league-img" src="${esc(e.leagueLogo)}" alt=""></span>` : SPORT_META[e.sport]?.icon || '⚽'} ${esc(e.competition)}</div>
      <div class="match-teams">
        <div class="match-team">${sideBadge(e, 'home', 'big')}<strong>${esc(e.home)}${e.sport === 'tenis' && live ? ' <i class="serve-dot" data-serve="home" title="Ao serviço"></i>' : ''}</strong></div>
        <div class="match-center">${center}</div>
        <div class="match-team">${sideBadge(e, 'away', 'big')}<strong>${esc(e.away)}${e.sport === 'tenis' && live ? ' <i class="serve-dot" data-serve="away" title="Ao serviço"></i>' : ''}</strong></div>
      </div>
      <div id="trackerInline" class="tracker-inline"></div>
    </section>
    ${live ? `<div class="match-views">
      <button class="${m.view === 'stream' ? 'active' : ''}${hasTv(e) ? '' : ' none'}" data-match-view="stream" title="${hasTv(e) ? 'Transmissão ao vivo' : 'Sem transmissão para este jogo'}">${ICON_PLAY}<span>Live</span></button>
      ${e.liveTracker || e.sport === 'tenis' ? `<button class="${m.view !== 'stream' ? 'active' : ''}" data-match-view="tracker" title="Tracker">${ICON_PITCH}<span>Tracker</span></button>` : ''}
    </div>` : ''}
    <div class="match-tabs">${tabs.map(([k, l]) => `<button class="${m.tab === k ? 'active' : ''}" data-match-tab="${k}">${l}</button>`).join('')}</div>
    <div class="match-body">${body}</div>
    ${footer()}`;
}

// Market menu of the match page, in this order. Our own markets by type; the provider's ('x') by name.
const MARKET_CATS = [
  ['todos', 'Todos'], ['principais', 'Principais'], ['golos', 'Golos'], ['handicap', 'Handicap'], ['equipa', 'Equipa'],
  ['combinadas', 'Combinadas'], ['resultados', 'Resultados'], ['periodos', 'Períodos'], ['especiais', 'Especiais'],
  ['marcadores', 'Marcadores'], ['cantos', 'Cantos e cartões'],
];
const CAT_BY_MARKET = {
  '1x2': 'principais', dc: 'principais', dnb: 'principais', ml: 'principais',
  ou: 'golos', btts: 'golos', oe: 'golos', gou: 'golos', goe: 'golos',
  hcp: 'handicap', ghcp: 'handicap', tou: 'equipa', cs: 'resultados',
  pw: 'periodos', pou: 'periodos', phcp: 'periodos', poe: 'periodos', pbtts: 'periodos',
};
const CAT_BY_NAME = [
  ['cantos', /corner|card|booking|canto|cart[aã]o/],
  ['marcadores', /scorer|player|marcador|jogador/],
  ['periodos', /\b(half|halves|quarter|period|set|innings?)\b|intervalo|parte\b|tempo\b/],
  ['combinadas', /&|\+|\band\b|combo|\be\b.*\b(total|golos)/],
  ['handicap', /handicap/],
  ['equipa', /\bteam [12]\b|home team|away team|individual|equipa/],
  ['golos', /goal|total|both|btts|golo|odd|even|multi|will score|exact number/],
  ['resultados', /result|score|exact|margin|winner|draw|1x2|double chance|\bwin/],
];
function marketCat(mk) {
  if (mk.market !== 'x') return CAT_BY_MARKET[mk.market] || 'especiais';
  const name = String(mk.name || '').toLowerCase();
  return CAT_BY_NAME.find(([, re]) => re.test(name))?.[0] || 'especiais';
}

/** Tracker / video full screen: the browser's full screen where it has one for elements, else a page overlay. */
function toggleExpand(box) {
  if (!box) return;
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  if (box.classList.contains('expanded')) { box.classList.remove('expanded'); document.body.classList.remove('no-scroll'); return; }
  const overlay = () => { box.classList.add('expanded'); document.body.classList.add('no-scroll'); };
  if (box.requestFullscreen) box.requestFullscreen().catch(overlay); else overlay();
}

/** Why this viewer may not watch (signed out / no balance), or null. The server checks the same. */
function streamLock() {
  if (!state.user) return { text: 'Inicie sessão para ver a transmissão ao vivo.', btn: '<button class="primary-btn" data-action="login">Entrar</button>' };
  if (!(Number(state.user.balance) > 0)) return { text: 'Saldo insuficiente. Deposite para ver a transmissão ao vivo.', btn: '<a class="primary-btn" href="#/perfil/carteira">Depositar</a>' };
  return null;
}

const streamLockHtml = (l) => `<span>${ICON_TV}</span><p><strong>${l.text}</strong></p>${l.btn}`;

/** The match's live video box: locked, or waiting for WinHouse's player address (loadStream). */
function streamBox(e) {
  const lock = hasTv(e) ? streamLock() : null;
  if (lock) return `<div class="stream-box empty locked">${streamLockHtml(lock)}</div>`;
  return `<div class="stream-box empty"><span>${ICON_PLAY}</span><p>${hasTv(e) ? 'A abrir a transmissão…' : 'Sem transmissão ao vivo para este jogo.'}</p></div>`;
}

/**
 * Whether a live match may have video: WinHouse says so (e.stream), or, on trial, the RapidAPI
 * streaming source is on and it is football (whether that source has the game is asked on opening).
 */
const hasTv = (e) => !!e && (!!e.stream || (!!state.config?.rapidStream && e.sport === 'futebol' && e.status === 'live'));

// ---- trial video source (RapidAPI): HTTPS HLS streams played here with hls.js (Safari plays HLS itself) ----
let hlsLoading = null;
function loadHlsJs() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsLoading) {
    hlsLoading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = '/vendor/hls-1.5.20.min.js';
      s.onload = () => ok(window.Hls);
      s.onerror = () => { hlsLoading = null; fail(new Error('hls.js')); };
      document.head.appendChild(s);
    });
  }
  return hlsLoading;
}

// FLV servers play with mpegts.js (also loaded only when needed). Phones without MSE (iPhone) skip them.
let mpegtsLoading = null;
function loadMpegts() {
  if (window.mpegts) return Promise.resolve(window.mpegts);
  if (!mpegtsLoading) {
    mpegtsLoading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = '/vendor/mpegts-1.7.3.min.js';
      s.onload = () => ok(window.mpegts);
      s.onerror = () => { mpegtsLoading = null; fail(new Error('mpegts.js')); };
      document.head.appendChild(s);
    });
  }
  return mpegtsLoading;
}

function stopRapid() {
  const r = state.match.rapid;
  if (!r) return;
  clearTimeout(r.watchdog);
  try { r.hls?.destroy(); } catch { /* already gone */ }
  try { r.flv?.destroy(); } catch { /* already gone */ }
  state.match.rapid = null;
}

/** Plays server `i` of the list in the box; on a fatal error, the next one. */
async function playRapid(el, servers, i, why = '') {
  const m = state.match;
  stopRapid();
  if (m.streamEl !== el) return;
  if (i >= servers.length) {
    el.className = 'stream-box empty';
    // The last server's reason, small: what to tell the support when a stream will not open.
    el.innerHTML = `<span>${ICON_PLAY}</span><p>Nenhum servidor desta transmissão abriu. Tente daqui a pouco.</p>${why ? `<small class="muted">${esc(why)}</small>` : ''}`;
    return;
  }
  const r = { servers, i, hls: null, why: '', got: false, since: Date.now() };
  m.rapid = r;
  el.className = 'stream-box rapid';
  // Just the picture: no server buttons or expand square on top (a server that fails gives way to
  // the next one by itself; the player's own controls have full screen).
  el.innerHTML = '<video playsinline controls autoplay muted></video>';
  const video = el.querySelector('video');
  const next = (reason) => {
    if (m.rapid !== r || m.streamEl !== el) return;
    clearTimeout(r.watchdog);
    playRapid(el, servers, i + 1, reason || r.why);
  };
  // A server with no picture in 12 s gives way to the next one; one whose video is still arriving
  // (segments loaded) is given up to 40 s on a slow connection.
  const watch = () => {
    r.watchdog = setTimeout(() => {
      if (r.got && Date.now() - r.since < 40_000) return watch();
      next(r.why || (r.got ? 'o vídeo chega devagar demais' : 'sem resposta do servidor de vídeo'));
    }, r.got ? 8_000 : 12_000);
  };
  watch();
  // Picture ready (even if the browser holds autoplay back: its play button then starts it).
  const ok = () => clearTimeout(r.watchdog);
  video.addEventListener('playing', ok, { once: true });
  video.addEventListener('loadeddata', ok, { once: true });
  if (servers[i].kind === 'flv') {
    try {
      const mpegts = await loadMpegts();
      if (m.rapid !== r || m.streamEl !== el) return;
      if (!mpegts?.isSupported()) throw new Error('mse');
      const flv = mpegts.createPlayer({ type: 'flv', isLive: true, url: new URL(servers[i].url, location.href).href }, { enableWorker: false, liveBufferLatencyChasing: true });
      r.flv = flv;
      flv.on(mpegts.Events.ERROR, (type, detail) => next(`flv: ${type} ${detail || ''}`.trim()));
      flv.attachMediaElement(video);
      flv.load();
      flv.play()?.catch?.(() => {});
    } catch (err) { next(`flv: ${err.message}`); }
    return;
  }
  let Hls = null;
  const startHlsJs = () => startHlsJsFor(m, el, r, video, Hls, next);
  const hlsJs = async () => {
    try { Hls = Hls || await loadHlsJs(); } catch { /* none */ }
    return m.rapid === r && m.streamEl === el && !!Hls?.isSupported();
  };
  const loadNative = (thenHlsJs) => {
    video.src = servers[i].url;
    video.addEventListener('error', async () => {
      const why = `hls nativo: erro ${video.error?.code ?? ''}`.trim();
      // The device's own player could not (e.g. decode error 3): hls.js on the same server next,
      // where the device has it (iOS 17+), before giving up on the server.
      if (thenHlsJs && m.rapid === r && await hlsJs()) { r.why = why; video.removeAttribute('src'); video.load(); return startHlsJs(); }
      next(why);
    }, { once: true });
  };
  // Safari / iOS play HLS themselves (well); elsewhere hls.js, even where the browser says it could
  // (Chrome on Android now does, but chokes on some live streams hls.js plays).
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(navigator.userAgent));
  if (apple && video.canPlayType('application/vnd.apple.mpegurl')) return loadNative(true);
  if (!(await hlsJs())) {
    if (m.rapid !== r || m.streamEl !== el) return;
    if (video.canPlayType('application/vnd.apple.mpegurl')) return loadNative(false);
    return next('este navegador não reproduz HLS');
  }
  startHlsJs();
}

/** hls.js for server `r.i` in `video` (the one place the stream is wired to it). */
function startHlsJsFor(m, el, r, video, Hls, next) {
  const servers = r.servers;
  const i = r.i;
  // Ordinary (not low-latency) live streams: 14 s behind the edge (counted in seconds: these hosts
  // declare 6 s segments but send 2 s ones). Closer than that the player ran dry and stuttered;
  // no speeding up (it ate the buffer). Give up on a dead playlist quickly, keep 30 s of buffer.
  const hls = new Hls({
    enableWorker: false, lowLatencyMode: false, liveSyncDuration: 14, liveMaxLatencyDuration: 45, maxBufferLength: 30, backBufferLength: 30,
    manifestLoadingTimeOut: 10000, manifestLoadingMaxRetry: 2, levelLoadingTimeOut: 10000, levelLoadingMaxRetry: 4,
    fragLoadingTimeOut: 20000, fragLoadingMaxRetry: 4,
  });
  r.hls = hls;
  let recovered = false;
  let netTries = 0;
  // Data flowing again: the stream host's hiccup is over.
  const flowing = () => { r.got = true; netTries = 0; };
  hls.on(Hls.Events.FRAG_LOADED, flowing);
  hls.on(Hls.Events.LEVEL_LOADED, () => { netTries = 0; });
  hls.on(Hls.Events.ERROR, (_ev, data) => {
    const code = data?.response?.code;
    r.why = `hls: ${data?.details || data?.type || 'erro'}${code ? ` (${code})` : ''}`;
    if (!data?.fatal) return;
    // A media error (decoding / buffer) is tried once more before giving up on the server.
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) { recovered = true; hls.recoverMediaError(); return; }
    // The stream host slow to give the next playlist / segment (it happens mid-match): load again,
    // waiting a little longer each time, rather than dropping a stream that was playing.
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && r.got && netTries < 6) {
      netTries += 1;
      setTimeout(() => { if (m.rapid === r && m.streamEl === el) hls.startLoad(); }, 1500 * netTries);
      return;
    }
    next(r.why);
  });
  hls.loadSource(servers[i].url);
  hls.attachMedia(video);
}

/** The trial source's streams for this match (/api/live2/:id), or why there are none. */
async function loadRapid(e, el) {
  const m = state.match;
  try {
    const r = await api(`/api/live2/${e.id}`);
    if (m.streamEl !== el) return;
    if (!r.servers?.length) throw new Error('none');
    playRapid(el, r.servers, 0);
  } catch (err) {
    if (m.streamEl !== el) return;
    const reason = err.data?.reason;
    if (reason === 'login' || reason === 'balance') {
      el.className = 'stream-box empty locked';
      el.innerHTML = streamLockHtml(reason === 'login' ? { text: 'Inicie sessão para ver a transmissão ao vivo.', btn: '<button class="primary-btn" data-action="login">Entrar</button>' } : { text: 'Saldo insuficiente. Deposite para ver a transmissão ao vivo.', btn: '<a class="primary-btn" href="#/perfil/carteira">Depositar</a>' });
      return;
    }
    const p = el.querySelector('p');
    if (p) p.textContent = err.status === 404 ? 'Sem transmissão ao vivo para este jogo.' : 'Transmissão indisponível de momento. Tente daqui a pouco.';
  }
}

const streamFrame = (url) => `${expandBtn()}<iframe src="${esc(url)}" title="Transmissão ao vivo" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe>`;

/**
 * The live video of a game with TV: /api/live/:id gives WinHouse's player address (it expires);
 * asked again a minute before it does, as the book itself does.
 */
async function loadStream(e, el) {
  const m = state.match;
  clearTimeout(m.streamTimer);
  try {
    const r = await api(`/api/live/${e.id}`);
    if (m.streamEl !== el || !r.embed_url) return;
    const frame = el.querySelector('iframe');
    if (frame) { if (frame.src !== r.embed_url) frame.src = r.embed_url; } else { el.classList.remove('empty'); el.innerHTML = streamFrame(r.embed_url); }
    const wait = Math.max(30, Number(r.expires_at) - Date.now() / 1000 - 60) * 1000;
    m.streamTimer = setTimeout(() => { if (m.streamEl === el && el.isConnected) loadStream(e, el); }, Math.min(wait, 30 * 60_000));
  } catch (err) {
    if (m.streamEl !== el) return;
    // Signed out or out of balance (e.g. the session ended): the player goes, the reason shows.
    const reason = err.data?.reason;
    if (reason === 'login' || reason === 'balance') {
      el.className = 'stream-box empty locked';
      el.innerHTML = streamLockHtml(reason === 'login' ? { text: 'Inicie sessão para ver a transmissão ao vivo.', btn: '<button class="primary-btn" data-action="login">Entrar</button>' } : { text: 'Saldo insuficiente. Deposite para ver a transmissão ao vivo.', btn: '<a class="primary-btn" href="#/perfil/carteira">Depositar</a>' });
      return;
    }
    if (el.querySelector('iframe')) return;
    const p = el.querySelector('p');
    if (p) p.textContent = 'Transmissão indisponível de momento. Tente daqui a pouco.';
  }
}

function marketsView(e) {
  if (!e.markets?.length) {
    return `<div class="panel empty">${e.status === 'live' ? '<span class="odds-state suspended">Suspenso</span>' : 'Ainda não há mercados para este jogo.'}</div>`;
  }
  const m = state.match;
  const counts = new Map();
  for (const mk of e.markets) counts.set(marketCat(mk), (counts.get(marketCat(mk)) || 0) + 1);
  if (m.cat !== 'todos' && !counts.has(m.cat)) m.cat = 'todos';
  const chips = MARKET_CATS.filter(([k]) => k === 'todos' || counts.has(k))
    .map(([k, l]) => `<button class="${m.cat === k ? 'active' : ''}" data-market-cat="${k}">${l}<small>${k === 'todos' ? e.markets.length : counts.get(k)}</small></button>`).join('');
  const shown = m.cat === 'todos' ? e.markets : e.markets.filter((mk) => marketCat(mk) === m.cat);
  return `<div class="market-cats">${chips}</div>${marketBlocks(e, shown)}`;
}

function marketBlocks(e, markets) {
  const locked = !isOpen(e);
  const btn = (s, label = s.label) => {
    const off = locked || !s.active;
    return `<button class="odd-btn market-odd${inSlip(s.id) ? ' selected' : ''}${off ? ' locked' : ''}" data-sel="${s.id}" ${off ? 'disabled' : ''}>
      <small>${esc(label)}</small>${off ? '🔒' : fmtOdds(s.odds)}</button>`;
  };
  return markets.map((mk) => {
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
  const inc = (x.incidents || []).map((i) => `<div class="incident ${i.side || ''}"><span class="inc-min">${esc(i.minuteLabel || (i.minute !== null && i.minute !== undefined ? `${i.minute}'` : ''))}</span>
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

function sportStatsView(e) {
  const x = state.match.extras;
  if (e.status === 'scheduled') return '<div class="panel empty">As estatísticas aparecem quando o jogo começar.</div>';
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

// A real football (the 12 pentagons and 20 hexagons of a truncated icosahedron, seams curved
// along the sphere, shaded), the same as the app icon's.
const BALL_SVG = `<svg viewBox="0 0 64 64" class="trk-ball-svg" aria-hidden="true"><defs><radialGradient id="trkbs" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".05"/><stop offset=".85" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient><radialGradient id="trkbh" cx="34%" cy="27%" r="30%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><clipPath id="trkbc"><circle cx="32" cy="32" r="30"/></clipPath></defs><circle cx="32" cy="32" r="31.2" fill="#0d1114" opacity=".35"/><g clip-path="url(#trkbc)"><circle cx="32" cy="32" r="30" fill="#f4f6f8"/><polygon points="2.6,38.3 3.2,40.4 3.8,42.3 4.5,44.0 5.2,45.6 4.5,44.0 3.8,42.4 3.3,40.8 2.9,39.1 2.3,36.2 2.0,33.2 2.0,30.3 2.3,27.3 2.4,26.9 2.4,26.5 2.5,26.1 2.6,25.7 2.1,28.6 2.0,31.7 2.1,34.9" fill="#15191d" stroke="#15191d" stroke-width="0.6" stroke-linejoin="round"/><polygon points="29.3,61.7 26.3,61.2 23.4,60.5 20.5,59.4 17.8,58.1 16.5,57.6 15.3,56.9 14.2,56.1 13.1,55.3 14.7,56.5 16.6,57.7 18.6,58.8 20.9,59.8 23.8,60.8 26.6,61.5 29.4,61.8 32.1,62.0 31.3,61.9 30.6,61.9 30.0,61.9" fill="#15191d" stroke="#15191d" stroke-width="0.6" stroke-linejoin="round"/><polygon points="12.5,9.5 12.9,8.8 13.4,8.3 14.0,7.9 14.6,7.5 12.9,8.8 11.2,10.2 9.6,12.0 7.9,14.0 6.0,16.8 4.5,19.8 3.4,22.7 2.6,25.7 2.5,26.1 2.4,26.5 2.4,26.9 2.3,27.3 2.8,25.1 3.6,23.0 4.7,20.9 6.0,19.0 7.3,16.3 8.8,13.8 10.5,11.5" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="59.6,20.2 58.1,17.2 56.2,14.3 54.0,11.7 51.6,9.2 50.2,8.1 48.8,7.2 47.5,6.3 46.2,5.6 47.4,6.3 48.6,7.0 49.6,8.0 50.4,9.2 52.6,11.3 54.6,13.6 56.3,16.1 57.8,18.7 59.1,20.1 60.0,21.6 60.6,23.2 61.1,24.8 60.8,23.7 60.5,22.6 60.1,21.5" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="20.9,59.8 23.8,60.8 26.6,61.5 29.4,61.8 32.1,62.0 31.3,61.9 30.6,61.9 30.0,61.9 29.3,61.7 31.4,61.5 33.5,61.1 35.5,60.3 37.6,59.2 32.5,60.3 27.4,60.4 22.5,59.7 17.8,58.1 16.5,57.6 15.3,56.9 14.2,56.1 13.1,55.3 14.7,56.5 16.6,57.7 18.6,58.8" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="50.4,9.2 49.6,8.0 48.6,7.0 47.4,6.3 46.2,5.6 43.5,4.2 40.6,3.2 37.6,2.5 34.6,2.1 32.5,2.0 30.4,2.0 28.2,2.2 25.9,2.6 27.4,2.3 28.9,2.1 30.4,2.3 31.9,3.3 34.4,4.0 36.8,4.9 39.2,6.2 41.6,7.7 44.0,7.7 46.3,7.9 48.4,8.5" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="7.2,42.5 5.7,41.8 4.5,41.0 3.6,40.1 2.9,39.1 3.3,40.8 3.8,42.4 4.5,44.0 5.2,45.6 6.8,48.3 8.7,50.9 10.8,53.2 13.1,55.3 14.2,56.1 15.3,56.9 16.5,57.6 17.8,58.1 16.8,56.9 15.9,55.5 15.2,53.8 14.7,52.0 12.5,49.8 10.5,47.5 8.8,45.1" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="58.8,37.7 57.6,40.3 56.1,42.7 54.3,45.0 52.4,47.2 51.7,49.6 50.9,51.8 49.9,53.8 48.7,55.6 49.6,55.7 50.4,55.5 51.0,55.1 51.6,54.6 53.7,52.6 55.6,50.4 57.3,48.0 58.8,45.4 59.8,43.2 60.6,41.0 61.2,38.8 61.6,36.6 61.3,36.9 60.8,37.3 60.0,37.5" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="31.9,3.3 34.4,4.0 36.8,4.9 39.2,6.2 41.6,7.7 44.0,7.7 46.3,7.9 48.4,8.5 50.4,9.2 49.6,8.0 48.6,7.0 47.4,6.3 46.2,5.6 43.5,4.2 40.6,3.2 37.6,2.5 34.6,2.1 34.0,2.0 33.3,2.2 32.6,2.6" fill="#15191d" stroke="#15191d" stroke-width="0.6" stroke-linejoin="round"/><polygon points="58.8,37.7 60.0,37.5 60.8,37.3 61.3,36.9 61.6,36.6 61.9,33.6 61.9,30.7 61.7,27.7 61.1,24.8 60.6,23.2 60.0,21.6 59.1,20.1 57.8,18.7 57.9,20.5 57.7,22.5 57.2,24.6 56.5,26.7 57.5,29.4 58.2,32.2 58.7,35.0" fill="#15191d" stroke="#15191d" stroke-width="0.6" stroke-linejoin="round"/><polygon points="61.1,24.8 60.6,23.2 60.0,21.6 59.1,20.1 57.8,18.7 57.9,20.5 57.7,22.5 57.2,24.6 56.5,26.7 54.6,26.2 52.5,25.8 50.2,25.4 47.7,25.1 51.5,28.2 54.7,31.4 57.2,34.6 58.8,37.7 60.0,37.5 60.8,37.3 61.3,36.9 61.6,36.6 61.9,33.6 61.9,30.7 61.7,27.7" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="19.4,14.9 19.6,12.6 19.9,10.5 20.3,8.6 20.8,7.0 18.5,7.2 16.3,7.7 14.3,8.5 12.5,9.5 10.5,11.5 8.8,13.8 7.3,16.3 6.0,19.0 6.7,19.6 7.7,20.4 8.9,21.3 10.3,22.3 12.3,20.3 14.5,18.4 16.9,16.6" fill="#15191d" stroke="#15191d" stroke-width="0.6" stroke-linejoin="round"/><polygon points="43.6,45.7 41.4,47.8 39.1,49.8 36.8,51.5 34.4,53.1 35.3,55.0 36.1,56.7 36.9,58.1 37.6,59.2 35.5,60.3 33.5,61.1 31.4,61.5 29.3,61.7 34.4,61.5 39.4,60.4 44.2,58.4 48.7,55.6 49.9,53.8 50.9,51.8 51.7,49.6 52.4,47.2 50.4,47.1 48.3,46.8 46.0,46.3" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="12.5,9.5 10.5,11.5 8.8,13.8 7.3,16.3 6.0,19.0 6.7,19.6 7.7,20.4 8.9,21.3 10.3,22.3 10.1,25.2 10.2,28.1 10.4,31.1 10.9,34.1 12.2,29.0 14.1,24.0 16.5,19.3 19.4,14.9 19.6,12.6 19.9,10.5 20.3,8.6 20.8,7.0 18.5,7.2 16.3,7.7 14.3,8.5" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="43.6,45.7 41.4,47.8 39.1,49.8 36.8,51.5 34.4,53.1 35.3,55.0 36.1,56.7 36.9,58.1 37.6,59.2 40.5,58.7 43.4,57.9 46.1,56.9 48.7,55.6 49.9,53.8 50.9,51.8 51.7,49.6 52.4,47.2 50.4,47.1 48.3,46.8 46.0,46.3" fill="#15191d" stroke="#15191d" stroke-width="0.6" stroke-linejoin="round"/><polygon points="41.6,7.7 39.2,6.2 36.8,4.9 34.4,4.0 31.9,3.3 29.0,3.8 26.2,4.6 23.4,5.6 20.8,7.0 20.3,8.6 19.9,10.5 19.6,12.6 19.4,14.9 21.7,15.8 24.2,16.8 26.6,18.0 29.2,19.3 32.0,18.1 34.8,17.1 37.5,16.3 40.3,15.6 40.7,13.3 41.1,11.2 41.4,9.3" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="23.0,49.5 22.3,46.9 21.6,44.2 21.1,41.4 20.7,38.4 18.0,37.4 15.5,36.3 13.1,35.2 10.9,34.1 9.6,36.3 8.6,38.4 7.8,40.5 7.2,42.5 8.8,45.1 10.5,47.5 12.5,49.8 14.7,52.0 16.5,51.6 18.6,51.1 20.7,50.4" fill="#15191d" stroke="#15191d" stroke-width="0.6" stroke-linejoin="round"/><polygon points="23.0,49.5 22.3,46.9 21.6,44.2 21.1,41.4 20.7,38.4 18.0,37.4 15.5,36.3 13.1,35.2 10.9,34.1 10.4,31.1 10.2,28.1 10.1,25.2 10.3,22.3 8.4,27.3 7.2,32.4 6.8,37.5 7.2,42.5 8.8,45.1 10.5,47.5 12.5,49.8 14.7,52.0 16.5,51.6 18.6,51.1 20.7,50.4" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="29.8,31.0 32.7,31.9 35.6,32.8 38.5,33.8 41.2,34.6 43.1,32.2 44.7,29.8 46.3,27.5 47.7,25.1 50.2,25.4 52.5,25.8 54.6,26.2 56.5,26.7 53.3,23.4 49.5,20.4 45.1,17.8 40.3,15.6 37.5,16.3 34.8,17.1 32.0,18.1 29.2,19.3 29.3,22.1 29.4,25.0 29.6,28.0" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="20.7,38.4 21.1,41.4 21.6,44.2 22.3,46.9 23.0,49.5 25.8,50.7 28.6,51.7 31.5,52.5 34.4,53.1 36.8,51.5 39.1,49.8 41.4,47.8 43.6,45.7 43.2,43.1 42.6,40.3 42.0,37.5 41.2,34.6 38.5,33.8 35.6,32.8 32.7,31.9 29.8,31.0 27.4,32.9 25.1,34.8 22.8,36.6" fill="none" stroke="#9aa3ad" stroke-width="0.6" stroke-linejoin="round"/><polygon points="29.8,31.0 32.7,31.9 35.6,32.8 38.5,33.8 41.2,34.6 43.1,32.2 44.7,29.8 46.3,27.5 47.7,25.1 46.0,22.6 44.2,20.1 42.3,17.8 40.3,15.6 37.5,16.3 34.8,17.1 32.0,18.1 29.2,19.3 29.3,22.1 29.4,25.0 29.6,28.0" fill="#15191d" stroke="#15191d" stroke-width="0.6" stroke-linejoin="round"/><circle cx="32" cy="32" r="30" fill="url(#trkbs)"/><circle cx="32" cy="32" r="30" fill="url(#trkbh)"/></g><circle cx="32" cy="32" r="30" fill="none" stroke="#0d1114" stroke-opacity=".55" stroke-width="0.9"/></svg>`;

function footballWidget(e) {
  const flags = ['tl', 'tr', 'bl', 'br'].map((c) => `<i class="trk-corner c-${c}"></i><i class="trk-flag f-${c}"></i>`).join('');
  return `<div class="trk" data-kind="football">${expandBtn()}
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
  return `<div class="trk" data-kind="tennis">${expandBtn()}
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
  const wide = window.matchMedia('(min-width: 1001px)').matches;
  const slot = wide ? $('#sideTracker') : $('#trackerInline');
  // Live video chosen: it takes the tracker's place (beside the slip on wide screens, in the header on phones).
  if (e?.status === 'live' && m.view === 'stream') {
    // Signing in, or the balance crossing zero, opens or closes the player.
    const lock = hasTv(e) ? streamLock() : null;
    const key = `${e.id}|${hasTv(e)}|${lock ? lock.text : 'open'}`;
    if (!m.streamEl || m.streamKey !== key) {
      stopRapid();
      const holder = document.createElement('div');
      holder.innerHTML = streamBox(e);
      m.streamEl = holder.firstElementChild;
      m.streamKey = key;
      if (hasTv(e) && !lock) (e.stream ? loadStream : loadRapid)(e, m.streamEl);
    }
    if (slot && m.streamEl.parentElement !== slot) slot.replaceChildren(m.streamEl);
    return;
  }
  // Leaving the video: the trial player stops (no stream left downloading in the background).
  if (m.rapid) { stopRapid(); m.streamEl?.remove(); m.streamEl = null; m.streamKey = null; }
  const kind = e?.status === 'live' ? (e.liveTracker ? 'football' : e.sport === 'tenis' ? 'tennis' : null) : null;
  if (!kind) {
    m.widget?.remove();
    m.widget = null;
    if (m.streamEl?.parentElement) m.streamEl.remove();
    return;
  }
  if (!m.widget || m.widgetKind !== kind) {
    m.widget?.remove();
    const holder = document.createElement('div');
    holder.innerHTML = kind === 'football' ? footballWidget(e) : tennisWidget(e);
    m.widget = holder.firstElementChild;
    m.widgetKind = kind;
  }
  if (slot && m.widget.parentElement !== slot) slot.replaceChildren(m.widget);
  if (kind === 'football') { updateTracker({ instant: true }); updateActionsList(); } else updateTennisCourt();
}

function afterMatchRender() {
  // Bar widths are data, set through the CSSOM (the CSP forbids inline styles).
  if (state.match.data?.sport === 'tenis') updateServe(state.match.data);
  $$('#content [data-w]').forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.w) || 0))}%`; });
  // The chosen market menu entry stays in view (the row scrolls sideways on phones).
  const cat = $('.market-cats .active');
  if (cat) cat.parentElement.scrollLeft = cat.offsetLeft - (cat.parentElement.clientWidth - cat.offsetWidth) / 2;
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
  // Half time: the ball rests on the centre spot, no arrow, no trail; the badge says "Intervalo".
  if (b.situation === 'halftime') {
    ball.classList.remove('idle');
    ball.classList.add('instant', 'resting');
    ball.style.left = '50%';
    ball.style.top = '50%';
    arrow.style.clipPath = 'polygon(0 0, 0 0, 0 0)';
    badge.classList.add('on');
    badge.classList.remove('away', 'hot');
    $('#trkBadgeTeam', w).textContent = '';
    $('#trkBadgeText', w).textContent = 'Intervalo';
    badge.style.left = '50%';
    badge.style.top = '30%';
    m.prevBall = null;
    return;
  }
  ball.classList.remove('idle', 'resting');
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
  box.innerHTML = items.map((a) => `<div class="trk-action ${a.team || ''}"><span>${esc(a.minuteLabel || (a.minute !== null && a.minute !== undefined ? `${a.minute}'` : ''))}</span><b>${esc(ACTION_LABEL[a.type] || String(a.type || '').replaceAll('_', ' '))}</b>
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

// A referral link (bet62.plus/GAB052 → /?ref=GAB052): the code is kept for the registration (the
// server also keeps it in a cookie and decides), the address is cleaned and the sign-up form opens.
const REF_KEY = 'b62_ref';
function referralCode() { try { return sessionStorage.getItem(REF_KEY) || ''; } catch { return ''; } }
function captureReferral() {
  const code = new URLSearchParams(location.search).get('ref');
  if (!code || !/^[A-Za-z]{3}\d{3}$/.test(code)) return false;
  try { sessionStorage.setItem(REF_KEY, code.toUpperCase()); } catch { /* private mode */ }
  history.replaceState(null, '', location.pathname + location.hash);
  return true;
}

async function init() {
  const referred = captureReferral();
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
  if (referred && !state.user) openAuth('register');
  loadCasino({ reset: true });
  loadCasinoLobby();
  await refreshEvents();
  loadLeagues();
  setInterval(() => { if (!document.hidden) loadLeagues(); }, 60_000);
  // My bets: scores, clocks and cash-out values kept fresh while the tickets are on screen.
  setInterval(() => {
    const { page, sub } = currentRoute();
    if (!document.hidden && state.user && (page === 'apostas' || (page === 'perfil' && sub === 'apostas'))) loadBets({ quiet: true });
  }, 10_000);
  // Live events refresh every 10s; the rest of the board rides along.
  setInterval(() => { if (!document.hidden) refreshEvents(); }, 5_000);
  // Keep the balance fresh (settlements and admin credits happen server-side).
  setInterval(() => { if (!document.hidden && state.user) refreshMe(); }, 20_000);
  // Back to the page: refresh everything right away (hidden tab, reopened app, back/forward cache).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) resume(); });
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
}

init();
