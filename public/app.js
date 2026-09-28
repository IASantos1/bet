// ClassicBet frontend — vanilla JS single-page app talking to the JSON API in /server.

const SPORT_META = {
  futebol: { name: 'Futebol', icon: '⚽' },
  basquetebol: { name: 'Basquetebol', icon: '🏀' },
  tenis: { name: 'Ténis', icon: '🎾' },
  hoquei: { name: 'Hóquei no Gelo', icon: '🏒' },
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

function matchCard(e) {
  return `<article class="match-card">
    <div class="match-top"><span>${esc(e.competition)}</span><span>${e.status === 'live' ? `<span class="live-label">● AO VIVO ${esc(e.clock || '')}</span>` : esc(fmtWhen(e.startTime))}</span></div>
    <div class="teams">
      <div class="team"><div class="team-icon">${esc(initials(e.home))}</div>${esc(e.home)}</div>
      <div class="vs">${e.status === 'live' ? `<b>${e.homeScore ?? 0}-${e.awayScore ?? 0}</b>` : 'VS'}</div>
      <div class="team"><div class="team-icon">${esc(initials(e.away))}</div>${esc(e.away)}</div>
    </div>
    ${oddsButtons(e)}
  </article>`;
}

function liveCard(e) {
  return `<article class="live-card">
    <div class="match-top"><span class="live-label">● AO VIVO</span><span>${esc(e.competition)} · ${esc(e.clock || '')}</span></div>
    <div class="live-teams"><div><span>${esc(e.home)}</span><b>${e.homeScore ?? 0}</b></div><div><span>${esc(e.away)}</span><b>${e.awayScore ?? 0}</b></div></div>
    ${oddsButtons(e, { labels: 'name' })}
  </article>`;
}

function eventRow(e) {
  const when = e.status === 'live'
    ? `<span class="live-label">● AO VIVO</span><br>${esc(e.clock || '')}`
    : esc(fmtWhen(e.startTime)).replace(' ', '<br>');
  const score = (side) => (e.status === 'live' ? `<b>${side === 'h' ? e.homeScore ?? 0 : e.awayScore ?? 0}</b>` : '');
  return `<div class="event-row">
    <div class="event-time">${when}</div>
    <div class="event-teams"><div><span>${esc(e.home)}</span>${score('h')}</div><div><span>${esc(e.away)}</span>${score('a')}</div></div>
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
    return `<div class="comp-block"><div class="comp-head"><span>${SPORT_META[sport]?.icon || '🏆'} ${esc(comp)}</span><span>${list.length}</span></div>${list.map(eventRow).join('')}</div>`;
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
    <section class="section"><div class="section-head"><h2>Casino</h2><a href="#/casino">Ver casino ›</a></div><div class="game-grid grid">${GAMES.slice(0, 5).map(gameCard).join('')}</div></section>
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

function casinoPage() {
  return `<div class="page-title"><h1>Casino</h1><p>Jogos, mesas e entretenimento num só espaço.</p></div>
    <div class="notice"><strong>Casino em integração.</strong> Os jogos ficam disponíveis assim que um fornecedor de casino licenciado for ligado à plataforma.</div>
    <section class="section"><div class="section-head"><h2>Catálogo</h2><span>${GAMES.length} jogos</span></div><div class="game-grid grid">${GAMES.map(gameCard).join('')}</div></section>
    ${footer()}`;
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
    ${b.legs.map((l) => `<div class="bet-leg"><div>${esc(l.match)}<small>${esc(l.competition)} · ${CODE_LABEL[l.code]}${l.score ? ` · ${esc(l.score)}` : ''}</small></div><div class="num"><b class="gold">${fmtOdds(l.odds)}</b><br><span class="pill ${l.status}">${STATUS_LABEL[l.status]}</span></div></div>`).join('')}
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
  const tabs = [['eventos', 'Eventos'], ['novo', 'Novo evento'], ['feed', 'Dados ao vivo'], ['levantamentos', 'Levantamentos'], ['apostas', 'Apostas'], ['utilizadores', 'Utilizadores']];
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
      ? `<p class="muted">Jogos, odds de consenso (pré-jogo), marcadores ao vivo e resultados são importados automaticamente. As apostas são liquidadas quando o jogo termina. Em jogo, os mercados ficam suspensos porque o fornecedor só publica odds antes do início.</p>
         <p>Eventos importados: <strong>${esc(counts)}</strong></p>
         ${f.lastError ? `<div class="form-error">Último erro (${esc(fmtDateTime(f.lastErrorAt))}): ${esc(f.lastError)}</div>` : ''}
         <div class="table-wrap"><table><thead><tr><th>Sincronização</th><th>Última execução</th><th>Resultado</th></tr></thead><tbody>
           ${last('fixtures', 'Jogos e odds')}${last('live', 'Ao vivo')}${last('results', 'Resultados')}
         </tbody></table></div><br>
         <button class="primary-btn" data-action="feed-sync">Sincronizar agora</button>`
      : '<div class="notice">Defina a variável <strong>BZZOIRO_API_TOKEN</strong> no servidor (token gratuito em sports.bzzoiro.com) e reinicie para importar jogos reais.</div>'}
  </div>`;
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

function toggleSelection(selId) {
  const ev = state.events.find((e) => e.selections.some((s) => s.id === selId));
  if (!ev) return;
  const sel = ev.selections.find((s) => s.id === selId);
  const idx = state.slip.findIndex((s) => s.selectionId === selId);
  if (idx >= 0) {
    state.slip.splice(idx, 1);
  } else {
    // One pick per event: choosing another outcome replaces the previous one.
    state.slip = state.slip.filter((s) => s.eventId !== ev.id);
    state.slip.push({ selectionId: sel.id, eventId: ev.id, code: sel.code, odds: sel.odds, match: `${ev.home} vs ${ev.away}`, competition: ev.competition });
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
    const ev = state.events.find((e) => e.id === item.eventId);
    const sel = ev?.selections.find((s) => s.id === item.selectionId);
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
        <strong>${esc(s.match)}</strong><div class="selection">${CODE_LABEL[s.code]}</div>
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
    promocoes: promosPage, perfil: () => accountPage(sub), admin: adminPage,
  };
  $('#content').innerHTML = (pages[page] || homePage)();
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

  const adminTab = e.target.closest('[data-admin-tab]');
  if (adminTab) { state.adminTab = adminTab.dataset.adminTab; render({ keepScroll: true }); return; }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'close-modal') closeModal();
  else if (action === 'login') openAuth('login');
  else if (action === 'register') openAuth('register');
  else if (action === 'game') toast('Casino em integração', 'Os jogos ficam disponíveis com a ligação a um fornecedor licenciado.');
  else if (action === 'logout') {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    state.user = null;
    updateHeader(); renderSlip();
    location.hash = '#/';
    toast('Sessão terminada');
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

document.addEventListener('input', (e) => {
  if (e.target.id === 'searchInput') renderSearch(e.target.value);
  if (e.target.id === 'stake') renderSlip();
});

function setSlipOpen(open) {
  $('#betslip').classList.toggle('open', open);
  document.body.classList.toggle('slip-open', open);
}

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

async function init() {
  bindChrome();
  autoMode();
  renderSlip();
  const [config] = await Promise.all([api('/api/config').catch(() => null), refreshMe()]);
  state.config = config;
  if (config) $('#stake').min = config.minStake;
  render();
  await refreshEvents();
  // Live events refresh every 10s; the rest of the board rides along.
  setInterval(() => { if (!document.hidden) refreshEvents(); }, 10_000);
  // Keep the balance fresh (settlements happen server-side).
  setInterval(() => { if (!document.hidden && state.user) refreshMe(); }, 60_000);
}

init();
