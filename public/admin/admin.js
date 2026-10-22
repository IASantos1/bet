// Bet62 administration — a separate page at /admin with its own login. Talks to /api/admin/*.

const SPORT_META = {
  futebol: { name: 'Futebol', icon: '⚽' }, basquetebol: { name: 'Basquetebol', icon: '🏀' }, tenis: { name: 'Ténis', icon: '🎾' },
  hoquei: { name: 'Hóquei no Gelo', icon: '🏒' }, dardos: { name: 'Dardos', icon: '🎯' }, esports: { name: 'CS2 (eSports)', icon: '🎮' },
  voleibol: { name: 'Voleibol', icon: '🏐' }, andebol: { name: 'Andebol', icon: '🤾' },
  futsal: { name: 'Futsal', icon: '⚽' }, tenismesa: { name: 'Ténis de mesa', icon: '🏓' }, badminton: { name: 'Badminton', icon: '🏸' },
};
const CODE_LABEL = { 1: 'Casa', X: 'Empate', 2: 'Fora' };
const STATUS_LABEL = {
  open: 'Em aberto', won: 'Ganha', lost: 'Perdida', void: 'Anulada', cashout: 'Cash out', pending: 'Pendente', approved: 'Aprovado',
  rejected: 'Rejeitado', scheduled: 'Agendado', live: 'Ao vivo', finished: 'Terminado', cancelled: 'Cancelado',
};

const ADMIN_ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  scale: '<path d="M12 3v18M5 7h14M7 7l-4 8h8L7 7zm10 0-4 8h8l-4-8zM8 21h8"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2z"/><path d="M13 5v2m0 4v2m0 4v2"/>',
  wallet: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M16 15h2M7 6V4a1 1 0 0 1 1-1h10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-1.6-3.8-5.5-4-5.5-1.5S9.8 8 12 8zm0 0c1.6-3.8 5.5-4 5.5-1.5S14.2 8 12 8z"/>',
  affiliate: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="m8.7 10.6 6.5-3.2m-6.5 6 6.5 3.2"/>',
  megaphone: '<path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 15.4 13 21H8l-2-7.2M3 11v2"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8m-4-4h8"/>',
  radio: '<path d="M4 8.5A11 11 0 0 1 20 8.5M7 11.5a7 7 0 0 1 10 0M10 14.5a3 3 0 0 1 4 0"/><circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"/>',
  casino: '<path d="M4 4h16v16H4z"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none"/>',
  catalog: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8m-8 4h8"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z"/>',
  logout: '<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 6.4L20 12M4 12l3 5.6A7 7 0 0 0 18.4 15"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',
  warning: '<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0z"/><path d="M12 9v4m0 4h.01"/>',
  coins: '<circle cx="8" cy="8" r="5"/><path d="M12.5 4.5A5 5 0 1 1 10 13M8 6v4m-2-2h4M16 16v4m-2-2h4"/>',
  chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};
const adminIcon = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ADMIN_ICON_PATHS[name] || ADMIN_ICON_PATHS.dashboard}</svg>`;

const TABS = [
  { id: 'painel', label: 'Painel', icon: 'dashboard', section: 'Operações' },
  { id: 'eventos', label: 'Eventos', icon: 'calendar', section: 'Operações' },
  { id: 'liquidacao', label: 'Liquidação', icon: 'scale', section: 'Operações' },
  { id: 'apostas', label: 'Apostas', icon: 'ticket', section: 'Operações' },
  { id: 'levantamentos', label: 'Levantamentos', icon: 'wallet', section: 'Operações' },
  { id: 'utilizadores', label: 'Utilizadores', icon: 'users', section: 'Operações' },
  { id: 'promocoes', label: 'Promoções', icon: 'gift', section: 'Operações' },
  { id: 'campanhas', label: 'Campanhas', icon: 'megaphone', section: 'Operações' },
  { id: 'afiliados', label: 'Afiliados', icon: 'affiliate', section: 'Operações' },
  { id: 'telegram', label: 'Telegram', icon: 'megaphone', section: 'Operações' },
  { id: 'novo', label: 'Novo evento', icon: 'plus', section: 'Avançado' },
  { id: 'feed', label: 'Dados ao vivo', icon: 'radio', section: 'Avançado' },
  { id: 'casino', label: 'Casino', icon: 'casino', section: 'Avançado' },
  { id: 'peliculas', label: 'Películas', icon: 'casino', section: 'Avançado' },
  { id: 'mercados', label: 'Catálogo de mercados', icon: 'catalog', section: 'Avançado' },
];
const MOBILE_TABS = ['painel', 'eventos', 'apostas', 'levantamentos'];

const state = { user: null, config: null, tab: 'painel', stats: null, userDetail: null };

// ---------- utilities ----------

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const fmtOdds = (n) => Number(n).toFixed(2);
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status}. Tente novamente.`);
    err.status = res.status;
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

// ---------- players ----------
const KYC_LABEL = { not_submitted: 'Não enviado', pending: 'Pendente', approved: 'Validado', rejected: 'Rejeitado' };
const ICON = {
  wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="3" y="7.5" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="13.5" r="1.4" fill="currentColor"/></svg>',
  gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="9" width="17" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 9h19M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  ban: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 14l5 5M21 14l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  notes: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

function usersTable(users) {
  return `<div class="table-wrap"><table class="users-table"><thead><tr><th>#</th><th>Nome</th><th>Email</th><th class="num">Saldo</th><th class="num">FreeBets</th><th>KYC</th><th class="num">Apostas</th><th>Registo</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr class="${u.banned ? 'is-banned' : ''}"><td>${u.id}</td><td>${esc(u.name)}${u.role === 'admin' ? ' <span class="pill">Admin</span>' : ''}${u.banned ? ' <span class="pill lost">Banido</span>' : ''}</td><td>${esc(u.email)}</td>
      <td class="num">${money(u.balance)}</td><td class="num">${money(u.freebet)}</td><td><span class="pill ${u.kycStatus}">${KYC_LABEL[u.kycStatus] || u.kycStatus}</span></td>
      <td class="num">${u.bets}</td><td>${esc(fmtDateTime(u.createdAt))}</td>
      <td><div class="user-acts">
        <button class="ua wallet" data-action="user-balance" data-id="${u.id}" data-name="${esc(u.name)}" data-balance="${u.balance}" title="Ajustar saldo">${ICON.wallet}</button>
        <button class="ua gift" data-action="user-freebet" data-id="${u.id}" data-name="${esc(u.name)}" data-freebet="${u.freebet}" title="FreeBet / Free Spins">${ICON.gift}</button>
        ${u.role === 'admin' ? '' : `<button class="ua ban${u.banned ? ' on' : ''}" data-action="user-ban" data-id="${u.id}" data-name="${esc(u.name)}" data-banned="${u.banned ? 1 : 0}" title="${u.banned ? 'Desbanir' : 'Banir'}">${ICON.ban}</button>`}
        <button class="ua notes" data-action="user-detail" data-id="${u.id}" title="Ver detalhe">${ICON.notes}</button>
      </div></td></tr>`).join('')}
  </tbody></table></div>`;
}

const TX_LABEL = {
  deposit: 'Depósito', withdrawal: 'Levantamento', withdrawal_refund: 'Levantamento devolvido', bet: 'Aposta', payout: 'Prémio', refund: 'Reembolso',
  casino_out: 'Casino (saldo levado para o jogo)', casino_in: 'Casino (saldo que voltou do jogo)', admin_credit: 'Crédito do admin', admin_debit: 'Débito do admin',
  bonus_convert: 'Bónus convertido', chargeback: 'Chargeback', cashout: 'Cash out', casino_bet: 'Casino (aposta)', casino_win: 'Casino (ganho)', free_spin_win: 'Ganhos Free Spins',
};

// ---------- promotions ----------

const PROMO_STATUS = { active: 'Ativo', completed: 'Cumprido', expired: 'Expirado', cancelled: 'Cancelado', used: 'Usada', granted: 'Atribuído', refused: 'Recusado' };
const CAMPAIGN = { accaBoost: 'Boost de múltiplas', casinoFs: 'Free Spins casino (CASINO_FREE_SPINS)', welcome: 'Boas-vindas', reload: 'Reload semanal', cashback: 'Cashback semanal', firstBet: 'Primeira aposta protegida', general: 'Geral', all: 'Todas' };
// Fields of each campaign in the admin form: [key, label, type].
const PROMO_FIELDS = {
  welcome: [['percent', 'Bónus (%)'], ['minDeposit', 'Depósito mínimo (€)'], ['maxBonus', 'Bónus máximo (€)'], ['rolloverMult', 'Rollover (×)'], ['rolloverBase', 'Base do rollover', 'base'],
    ['minOdds', 'Odd mínima'], ['validityDays', 'Validade (dias)'], ['maxCountStake', 'Aposta máx. contabilizável (€)', 'opt'], ['maxCountPct', '… ou % do bónus (o menor)', 'opt']],
  reload: [['percent', 'Bónus (%)'], ['minDeposit', 'Depósito mínimo (€)'], ['maxBonus', 'Bónus máximo (€)'], ['rolloverMult', 'Rollover (×)'], ['rolloverBase', 'Base do rollover', 'base'],
    ['minOdds', 'Odd mínima'], ['validityDays', 'Validade (dias)'], ['maxCountStake', 'Aposta máx. contabilizável (€)', 'opt'], ['maxCountPct', '… ou % do bónus (o menor)', 'opt']],
  casinoFs: [['tiers', 'Escalões (depósito € : rodadas)', 'tiers'], ['spinValue', 'Valor por rodada padrão', 'spin'], ['validityDays', 'Validade (dias)'], ['maxDeposit', 'Depósito máximo promocional (€)'],
    ['maxClaims', 'Máximo de utilizações por jogador', 'opt'], ['games', 'Jogos elegíveis e valor por rodada (ID:€, separados por vírgula)', 'games']],
  accaBoost: [['tiers', 'Escalões (seleções : % de boost, ex.: 4:5, 8:10, 12:15, 17:20)', 'tiers'], ['minOdds', 'Odd mínima por seleção'], ['maxBoost', 'Boost máximo por aposta (€)']],
  firstBet: [['minStake', 'Aposta mínima (€)'], ['minOdds', 'Odd mínima'], ['maxRefund', 'Reembolso máximo em free bet (€)'], ['validityDays', 'Validade da free bet (dias)']],
  cashback: [['percent', 'Cashback (%)'], ['minLoss', 'Perda líquida mínima (€)'], ['max', 'Cashback máximo (€/semana)'], ['rolloverMult', 'Rollover (×)'], ['minOdds', 'Odd mínima'], ['validityDays', 'Validade (dias)']],
};
const localDT = (iso) => (iso ? toLocalInput(iso) : '');

const fsChip = (id, name, bet, missing = false) => `<span class="fs-chip${missing ? ' missing' : ''}" data-id="${id}">${esc(name)}${bet ? ` · €${bet}` : ''}${missing ? ' (não encontrado)' : ''}
  <button type="button" data-action="fs-game-remove" data-id="${id}" aria-label="Retirar">×</button></span>`;
/** The free-spins games input: "id[:€], …" as a list of [id, bet]. */
const fsTokens = () => String($('#fsGamesInput')?.value || '').split(/[\s,;]+/).filter(Boolean).map((t) => t.split(':'));
const fsWrite = (tokens) => { $('#fsGamesInput').value = tokens.map(([id, bet]) => (bet ? `${id}:${bet}` : id)).join(', '); };

// ---------- player modals (balance, free bet / free spins) ----------

function openAdminModal(html) {
  closeAdminModal();
  const back = document.createElement('div');
  back.className = 'adm-modal-back';
  back.innerHTML = `<div class="adm-modal" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back) closeAdminModal(); });
  document.body.appendChild(back);
  back.querySelector('input:not([type=hidden])')?.focus();
}
function closeAdminModal() { $('.adm-modal-back')?.remove(); }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAdminModal();
  // Enter in a game search picks nothing and must not submit the form around it.
  if (e.key === 'Enter' && (e.target.id === 'amGameSearch' || e.target.id === 'fsGameSearch')) e.preventDefault();
});
const modalHead = (icon, title) => `<div class="am-head"><h2>${icon}${esc(title)}</h2><button type="button" class="am-x" data-action="am-close" aria-label="Fechar">×</button></div>`;

function balanceModal({ id, name, balance }) {
  openAdminModal(`${modalHead(ICON.wallet, 'Ajustar saldo')}
    <div class="am-who"><small>${esc(name)}</small><strong class="am-bal">${money(Number(balance) || 0)}</strong></div>
    <form data-form="user-balance" data-id="${id}">
      <input type="hidden" name="op" value="add">
      <div class="am-ops">
        <button type="button" class="am-op on" data-action="am-op" data-op="add">Adicionar</button>
        <button type="button" class="am-op" data-action="am-op" data-op="subtract">Subtrair</button>
        <button type="button" class="am-op" data-action="am-op" data-op="set">Definir</button>
      </div>
      <input name="amount" type="number" step="0.01" min="0" placeholder="Valor em €" required>
      <input name="note" maxlength="120" placeholder="Nota (opcional, fica no extrato)">
      <button class="primary-btn am-go">${ICON.wallet} Confirmar</button>
    </form>`);
}

function giftModal({ id, name, freebet }) {
  openAdminModal(`${modalHead(ICON.gift, 'Atribuir prémio')}
    <div class="am-who"><small>${esc(name)}</small><span class="am-fb">FreeBet atual: ${money(Number(freebet) || 0)}</span></div>
    <div class="am-tabs"><button type="button" class="am-tab on" data-action="am-tab" data-tab="fb">FreeBet</button><button type="button" class="am-tab" data-action="am-tab" data-tab="fs">Free Spins</button></div>
    <form data-form="user-freebet" data-id="${id}" data-pane="fb">
      <input name="amount" type="number" step="0.01" min="0.01" placeholder="Valor da free bet em €" required>
      <label class="am-row">Válida durante <input name="days" type="number" min="1" max="365" value="7"> dias</label>
      <input name="note" maxlength="120" placeholder="Nota (opcional)">
      <button class="primary-btn am-go gift">${ICON.gift} Atribuir FreeBet</button>
    </form>
    <form data-form="user-spins" data-id="${id}" data-pane="fs" hidden>
      <div class="am-two"><label>Rodadas<input name="spins" type="number" min="1" max="500" value="5" required></label>
        <label>Valor por rodada<select name="spinValue"><option value="0.1">€0,10</option><option value="0.2" selected>€0,20</option></select></label></div>
      <label class="am-row">Válidas durante <input name="days" type="number" min="1" max="365" value="7"> dias</label>
      <input name="note" maxlength="120" placeholder="Nota (opcional)">
      <div class="am-games"><span class="am-lbl">Jogos (o jogador escolhe 1) — só jogos que aceitam €0,10 / €0,20 por rodada</span>
        <div class="fs-chips" id="amChips"><small class="muted">A carregar os jogos da campanha…</small></div>
        <input id="amGameSearch" placeholder="Procurar jogo para juntar (ex.: Big Bass)…" autocomplete="off"><div class="fs-results" id="amGameResults"></div></div>
      <button class="primary-btn am-go gift">${ICON.gift} Atribuir Free Spins</button>
    </form>`);
  amLoadGames();
}

// The free-spins games of the gift modal: the campaign's to start with, changed by name.
let amGames = [];
const amChip = (g) => `<span class="fs-chip">${esc(g.name)}<button type="button" data-action="am-game-remove" data-id="${g.id}" aria-label="Retirar">×</button></span>`;
function amRenderGames() {
  const box = $('#amChips');
  if (box) box.innerHTML = amGames.length ? amGames.map(amChip).join('') : '<small class="muted">Sem jogos: procure e junte pelo menos um.</small>';
}
async function amLoadGames() {
  amGames = [];
  try {
    const d = await api('/api/admin/promotions');
    amGames = (d.fsGames || []).filter((g) => g.found !== false).map((g) => ({ id: g.id, name: g.name }));
  } catch { /* none */ }
  amRenderGames();
}

function adminPromos(d) {
  const c = d.config;
  const field = (camp, [k, label, type]) => {
    const v = c[camp][k];
    if (type === 'tiers') return `<label class="field">${esc(label)}<input name="${camp}.${k}" value="${esc(v.map(([d, n]) => `${d}:${n}`).join(', '))}" required></label>`;
    if (type === 'games') {
      const bets = c[camp].gameBets || {};
      const names = new Map((d.fsGames || []).map((g) => [g.id, g]));
      return `<div class="field wide"><span>Jogos das Free Spins — o jogador escolhe 1 (recomendado: 5)</span>
        <div class="fs-chips" id="fsChips">${v.map((id) => fsChip(id, names.get(id)?.name || `Jogo ${id}`, bets[id], names.get(id)?.found === false)).join('') || '<small class="muted">Sem jogos: a campanha não fica disponível.</small>'}</div>
        <div class="fs-search"><input id="fsGameSearch" placeholder="Procurar jogo para juntar (ex.: Big Bass, Gates of Olympus)…" autocomplete="off"><div class="fs-results" id="fsGameResults"></div></div>
        <label class="field">${esc(label)}<input name="${camp}.${k}" id="fsGamesInput" value="${esc(v.map((id) => (bets[id] ? `${id}:${bets[id]}` : String(id))).join(', '))}" placeholder="ex.: 4821:0.20, 4822:0.10"></label>
        <small class="muted">⚠ As rodadas valem €0,10 ou €0,20: escolha só jogos que aceitam essa aposta (há jogos com aposta mínima maior — confirme no próprio jogo). Cada rodada é jogada ao valor indicado (ID:€, com €0,10 ou €0,20; sem valor: o padrão).</small></div>`;
    }
    if (type === 'spin') return `<label class="field">${esc(label)}<select name="${camp}.${k}">${[0.1, 0.2].map((x) => `<option value="${x}"${Math.round(Number(v) * 100) === x * 100 ? ' selected' : ''}>€${x.toFixed(2).replace('.', ',')}</option>`).join('')}</select></label>`;
    if (type === 'base') return `<label class="field">${esc(label)}<select name="${camp}.${k}"><option value="deposit_bonus"${v !== 'bonus' ? ' selected' : ''}>Depósito + bónus</option><option value="bonus"${v === 'bonus' ? ' selected' : ''}>Só o bónus</option></select></label>`;
    return `<label class="field">${esc(label)}<input name="${camp}.${k}" type="number" step="0.01" value="${v ?? ''}"${type === 'opt' ? ' placeholder="sem limite"' : ' required'}></label>`;
  };
  const campaign = (camp) => `<div class="panel promo-camp"><h3><label class="adm-switch"><input type="checkbox" name="${camp}.active"${c[camp].active ? ' checked' : ''}> ${CAMPAIGN[camp]}</label>
      <span class="pill ${c[camp].active ? 'won' : 'void'}">${c[camp].active ? 'ACTIVE' : 'INACTIVE'}</span></h3>
    <div class="adm-grid">${PROMO_FIELDS[camp].map((f) => field(camp, f)).join('')}
      <label class="field">Início (opcional)<input name="${camp}.startAt" type="datetime-local" value="${localDT(c[camp].startAt)}"></label>
      <label class="field">Fim (opcional)<input name="${camp}.endAt" type="datetime-local" value="${localDT(c[camp].endAt)}"></label></div></div>`;
  const methods = [['mbway', 'MB WAY'], ['multibanco', 'Multibanco'], ['cartao', 'Cartão'], ['demo', 'Modo demonstração']];
  const totals = d.totals.length ? `<div class="adm-cards">${d.totals.map((t) => `<div class="adm-card"><small>${esc(CAMPAIGN[t.kind] || t.kind)}</small><strong>${money(t.granted)}</strong><em>${t.count} atribuídos · ${t.completed} cumpridos</em></div>`).join('')}</div>` : '';
  const bonuses = d.bonuses.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Jogador</th><th>Campanha</th><th class="num">Bónus</th><th class="num">Saldo</th><th>Rollover</th><th>Expira</th><th>Estado</th><th></th></tr></thead><tbody>
    ${d.bonuses.map((b) => `<tr><td>${b.id}</td><td>${esc(b.user)}<br><small class="muted">${esc(b.email)}</small></td><td>${esc(b.name)}</td><td class="num">${money(b.amount)}</td><td class="num">${money(b.balance)}</td>
      <td>${money(b.rolloverProgress)} / ${money(b.rolloverTarget)}</td><td>${esc(fmtDateTime(b.expiresAt))}</td>
      <td><span class="pill ${b.status === 'active' ? 'open' : b.status === 'completed' ? 'won' : 'void'}">${PROMO_STATUS[b.status]}</span>${b.cancelReason ? `<br><small class="muted">${esc(b.cancelReason)}</small>` : ''}</td>
      <td>${b.status === 'active' ? `<button class="danger-btn btn-sm" data-action="bonus-cancel" data-id="${b.id}">Cancelar</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Ainda não há bónus atribuídos.</p>';
  const freebets = d.freebets.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Jogador</th><th>Origem</th><th class="num">Valor</th><th>Expira</th><th>Estado</th><th></th></tr></thead><tbody>
    ${d.freebets.map((f) => `<tr><td>${f.id}</td><td>${esc(f.user)}</td><td>${f.source === 'first_bet' ? 'Primeira aposta' : 'Administrador'}</td><td class="num">${money(f.amount)}</td><td>${esc(fmtDateTime(f.expiresAt))}</td>
      <td><span class="pill ${f.status === 'active' ? 'open' : 'void'}">${PROMO_STATUS[f.status]}</span>${f.betId ? ` <small class="muted">aposta #${f.betId}</small>` : ''}</td>
      <td>${f.status === 'active' ? `<button class="danger-btn btn-sm" data-action="freebet-cancel" data-id="${f.id}">Cancelar</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Sem free bets.</p>';
  const log = d.log.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Jogador</th><th>Campanha</th><th>Decisão</th><th>Motivo</th></tr></thead><tbody>
    ${d.log.map((l) => `<tr><td>${esc(fmtDateTime(l.createdAt))}</td><td>${esc(l.user)}</td><td>${esc(CAMPAIGN[l.campaign] || l.campaign)}</td><td>${esc(PROMO_STATUS[l.outcome] || l.outcome)}</td><td>${esc(l.reason || '')}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Sem decisões registadas.</p>';
  return `${totals}
    <form data-form="promo-config">
      <div class="panel"><h3>Regras gerais</h3>
        <label class="adm-switch"><input type="checkbox" name="general.requireKyc"${c.general.requireKyc ? ' checked' : ''}> Exigir identidade verificada (KYC) para receber promoções</label>
        <p class="muted">Métodos de pagamento elegíveis:</p>
        <div class="form-actions">${methods.map(([k, l]) => `<label class="adm-switch"><input type="checkbox" name="general.methods" value="${k}"${c.general.methods.includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</div>
        <p class="muted">Sempre aplicado: uma promoção de depósito ativa por jogador, sem autoexclusão nem conta suspensa, sem contas duplicadas (telemóvel / NIF / IBAN), depósito confirmado e não revertido. Os valores e o rollover são sempre calculados pelo servidor.</p></div>
      ${['welcome', 'firstBet', 'reload', 'cashback', 'accaBoost', 'casinoFs'].map(campaign).join('')}
      <div class="form-actions"><button class="primary-btn">Guardar configuração</button></div>
    </form>
    <div class="panel"><h3>Bónus</h3>${bonuses}</div>
    <div class="panel"><h3>Free bets</h3>${freebets}</div>
    <div class="panel"><h3>Free Spins casino</h3>${d.spins?.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Jogador</th><th>Rodadas</th><th class="num">Valor</th><th class="num">Ganhos</th><th class="num">Ganhos pagos</th><th>Expira</th><th>Estado</th></tr></thead><tbody>
      ${d.spins.map((x) => `<tr><td>${x.id}</td><td>${esc(x.user)}</td><td>${x.spinsLeft} de ${x.spins}</td><td class="num">${money(x.value)}</td><td class="num">${money(x.winnings)}</td><td class="num">${money(x.paid)}</td>
        <td>${esc(fmtDateTime(x.expiresAt))}</td><td><span class="pill ${x.status === 'active' ? 'open' : 'void'}">${({ active: 'Ativa', closed: 'Terminada', expired: 'Expirada', cancelled: 'Cancelada' })[x.status]}</span>${x.reason ? `<br><small class="muted">${esc(x.reason)}</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Sem Free Spins atribuídas.</p>'}</div>
    <div class="panel"><h3>Decisões (atribuídas / recusadas)</h3>${log}</div>`;
}

// ---------- affiliates ----------

const AFF_STATUS = { pending: 'Pendente', active: 'Ativo', suspended: 'Suspenso', blocked: 'Bloqueado' };
const COMM_STATUS = { pending: 'Em análise', approved: 'Aprovada', paid: 'Paga', reversed: 'Revertida', rejected: 'Rejeitada' };
const COMM_PILL = { pending: 'pending', approved: 'open', paid: 'won', reversed: 'lost', rejected: 'void' };
const AFF_FIELDS = [
  ['rateBps', 'Comissão (pontos base; 1000 = 10%)'], ['minDepositCents', 'Depósito próprio mínimo (cêntimos)'],
  ['minBalanceCents', 'Saldo elegível mínimo (cêntimos)'], ['dualApprovalCents', 'Dupla aprovação a partir de (cêntimos; 0 = desligada)'],
  ['velocityPerDay', 'Registos por código em 24 h antes de rever'],
];

function adminAffiliates({ config: c, affiliates, reconciliation: r }, { items: commissions }, { items: auditLog }) {
  const rec = `<div class="adm-cards">
    <div class="adm-card"><small>Comissões pagas</small><strong>${money(r.commissionsPaid)}</strong><em>${r.paidCount} pagamentos</em></div>
    <div class="adm-card"><small>Créditos na carteira</small><strong>${money(r.ledgerCredits)}</strong><em>${r.ledgerCount} movimentos</em></div>
    <div class="adm-card"><small>Revertido</small><strong>${money(r.reversed)}</strong><em>movimentos: ${money(r.ledgerReversals)}</em></div>
    <div class="adm-card"><small>Reconciliação</small><strong>${r.ok ? '✔ Certa' : '⚠ Diferença'}</strong><em><button class="ghost-btn btn-sm" data-action="aff-recover">Recuperar comissões em falta</button></em></div></div>`;
  const cfg = `<form class="panel" data-form="aff-config"><h3><label class="adm-switch"><input type="checkbox" name="enabled"${c.enabled ? ' checked' : ''}> Programa de afiliados ativo</label>
      <span class="pill ${c.enabled ? 'won' : 'void'}">${c.enabled ? 'ATIVO' : 'DESLIGADO'}</span></h3>
    <p class="muted">⚖️ Antes de ativar, confirme com o jurista a conformidade com o SRIJ / Regime Jurídico dos Jogos e Apostas Online e com as regras de publicidade a jogo em Portugal.</p>
    <div class="adm-grid">${AFF_FIELDS.map(([k, l]) => `<label class="field">${esc(l)}<input name="${k}" type="number" step="1" min="0" value="${c[k]}" required></label>`).join('')}</div>
    <div class="form-actions"><label class="adm-switch"><input type="checkbox" name="autoPayout"${c.autoPayout ? ' checked' : ''}> Pagar automaticamente as comissões aprovadas</label>
      <label class="adm-switch"><input type="checkbox" name="countDemoDeposits"${c.countDemoDeposits ? ' checked' : ''}> Contar depósitos de demonstração (só servidores de teste)</label></div>
    <label class="field wide">Justificação da alteração (obrigatória, fica na auditoria)<input name="reason" required minlength="5" placeholder="ex.: aprovação jurídica de 09/10"></label>
    <div class="form-actions"><button class="primary-btn">Guardar configuração</button></div></form>`;
  const affs = affiliates.length ? `<div class="table-wrap"><table><thead><tr><th>Afiliado</th><th>Código</th><th>Estado</th><th class="num">Visitas</th><th class="num">Registos</th><th class="num">Qualif.</th><th class="num">Saldo eleg.</th><th class="num">Pago</th><th class="num">Em aberto</th><th></th></tr></thead><tbody>
    ${affiliates.map((a) => `<tr><td>${esc(a.name)}<br><small class="muted">${esc(a.email)}</small></td><td><b>${esc(a.code)}</b></td>
      <td><span class="pill ${a.status === 'active' ? 'won' : a.status === 'pending' ? 'pending' : 'lost'}">${AFF_STATUS[a.status] || a.status}</span>${a.adminReason ? `<br><small class="muted">${esc(a.adminReason)}</small>` : ''}</td>
      <td class="num">${a.clicks}</td><td class="num">${a.referrals}</td><td class="num">${a.qualified}</td><td class="num">${money(a.eligibleBalance)}</td><td class="num">${money(a.paid)}</td><td class="num">${money(a.open)}</td>
      <td><div class="form-actions">${a.adminStatus ? `<button class="ghost-btn btn-sm" data-action="aff-status" data-status="active" data-id="${a.userId}">Reativar</button>` : `<button class="ghost-btn btn-sm" data-action="aff-status" data-status="suspended" data-id="${a.userId}">Suspender</button>`}
        ${a.adminStatus !== 'blocked' ? `<button class="danger-btn btn-sm" data-action="aff-status" data-status="blocked" data-id="${a.userId}">Bloquear</button>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Ainda não há afiliados (o código é criado quando o jogador abre a secção no perfil).</p>';
  const actions = (x) => [
    x.status === 'pending' ? `<button class="primary-btn btn-sm" data-action="aff-review" data-decision="approve" data-id="${x.id}">Aprovar</button>` : '',
    x.status === 'approved' ? `<button class="primary-btn btn-sm" data-action="aff-pay" data-id="${x.id}">Pagar</button>` : '',
    ['pending', 'approved'].includes(x.status) ? `<button class="danger-btn btn-sm" data-action="aff-review" data-decision="reject" data-id="${x.id}">Rejeitar</button>` : '',
    x.status === 'approved' ? `<button class="ghost-btn btn-sm" data-action="aff-review" data-decision="review" data-id="${x.id}">Rever</button>` : '',
    x.status === 'paid' ? `<button class="danger-btn btn-sm" data-action="aff-reverse" data-id="${x.id}">Reverter</button>` : '',
  ].join('');
  const comms = commissions.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Data</th><th>Afiliado</th><th>Convidado</th><th class="num">Depósito</th><th class="num">Comissão</th><th>Estado</th><th></th></tr></thead><tbody>
    ${commissions.map((x) => `<tr><td>${x.id}</td><td>${esc(fmtDateTime(x.createdAt))}</td><td>${esc(x.affiliate.name)}<br><small class="muted">${esc(x.affiliate.email)}</small></td>
      <td>${esc(x.referred.name)}<br><small class="muted">${esc(x.referred.email)}</small></td><td class="num">${money(x.deposit)}<br><small class="muted">${esc(x.depositPayment || x.depositRef)}</small></td>
      <td class="num">${money(x.amount)}<br><small class="muted">${x.rate}%</small></td>
      <td><span class="pill ${COMM_PILL[x.status]}">${COMM_STATUS[x.status]}</span>${x.reason ? `<br><small class="muted">${esc(x.reason)}</small>` : ''}</td>
      <td><div class="form-actions">${actions(x)}</div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Sem comissões.</p>';
  const log = auditLog.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Admin</th><th>Ação</th><th>Entidade</th><th>Resultado</th><th>Detalhes</th></tr></thead><tbody>
    ${auditLog.map((l) => `<tr><td>${esc(fmtDateTime(l.created_at))}</td><td>${l.actor_user_id ?? '—'}</td><td>${esc(l.action)}</td><td>${esc(l.entity_type)} ${esc(l.entity_id ?? '')}</td><td>${esc(l.result)}</td>
      <td><small class="muted">${esc(l.metadata ? JSON.stringify(l.metadata) : '')}</small></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Sem registos.</p>';
  return `${rec}${cfg}
    <div class="panel"><h3>Afiliados</h3><form class="form-actions" data-form="aff-search"><input name="q" value="${esc(state.affQ || '')}" placeholder="Código, nome ou email"><button class="ghost-btn">Procurar</button></form>${affs}</div>
    <div class="panel"><h3>Comissões</h3>${comms}</div>
    <div class="panel"><h3>Auditoria (só de leitura)</h3>${log}</div>`;
}

/** Cash out: its rules (saved on the server) and what has been paid. */
function cashoutPanel({ config: c, totals: t, recent }) {
  const num = (k, label, step = '1', placeholder = '') => `<label class="field">${esc(label)}<input name="${k}" type="number" step="${step}" value="${c[k] ?? ''}"${placeholder ? ` placeholder="${placeholder}"` : ''}></label>`;
  return `<div class="panel"><h3>Cash out <span class="pill ${c.enabled ? 'won' : 'void'}">${c.enabled ? 'ATIVO' : 'DESLIGADO'}</span></h3>
    <div class="adm-cards"><div class="adm-card"><small>Cash outs</small><strong>${t.count}</strong><em>${t.live} ao vivo</em></div>
      <div class="adm-card"><small>Pago</small><strong>${money(t.paid)}</strong><em>apostado ${money(t.stake)}</em></div>
      <div class="adm-card green"><small>Margem retida</small><strong>${money(t.margin)}</strong><em>valor justo − pago</em></div></div>
    <form data-form="cashout-config">
      <div class="form-actions"><label class="adm-switch"><input type="checkbox" name="enabled"${c.enabled ? ' checked' : ''}> Cash out ativo</label>
        <label class="adm-switch"><input type="checkbox" name="prematch"${c.prematch ? ' checked' : ''}> Antes do início</label>
        <label class="adm-switch"><input type="checkbox" name="live"${c.live ? ' checked' : ''}> Ao vivo</label></div>
      <div class="adm-grid">${num('factor', 'Fator (0.95 = 5% de margem)', '0.01')}${num('minAgeSeconds', 'Só depois de (s) da aposta')}${num('liveDelaySeconds', 'Atraso de aceitação ao vivo (s)')}
        ${num('goalLockSeconds', 'Bloqueio após golo/ponto (s)')}${num('minValue', 'Valor mínimo (€)', '0.01')}${num('maxValue', 'Valor máximo por aposta (€)', '0.01', 'sem limite')}</div>
      <div class="form-actions"><button class="primary-btn">Guardar regras</button></div>
    </form>
    <p class="muted">Só simples e múltiplas pagas com dinheiro real (não free bets, bónus nem criador de apostas). Suspenso com mercado fechado, preço ao vivo antigo ou anterior ao último golo, e com o jogo a começar/terminado. Se o valor baixar durante o atraso, o jogador confirma o novo valor. Não conta para o rollover.</p>
    ${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Aposta</th><th>Jogador</th><th class="num">Aposta</th><th class="num">Pago</th><th class="num">Valor justo</th><th></th><th>Data</th></tr></thead><tbody>
      ${recent.map((r) => `<tr><td>#${r.betId}</td><td>${esc(r.user)}</td><td class="num">${money(r.stake)}</td><td class="num">${money(r.value)}</td><td class="num">${money(r.fair)}</td><td>${r.live ? 'ao vivo' : 'pré-jogo'}</td><td>${esc(fmtDateTime(r.createdAt))}</td></tr>`).join('')}
    </tbody></table></div>` : ''}</div>`;
}

function userPromosPanel(d) {
  const p = d.promotions;
  const u = d.user;
  const lim = d.limits;
  const LIM = [['depositDay', 'Depósito diário'], ['depositWeek', 'Depósito semanal'], ['depositMonth', 'Depósito mensal'], ['betMax', 'Aposta máxima'], ['lossWeek', 'Perda semanal']];
  return `<div class="panel"><h3>Promoções ${u.promoBlocked ? '<span class="pill lost">Bloqueadas</span>' : ''}</h3>
    <p>Saldo de bónus <b>${money(p.bonusBalance)}</b> · Free bets <b>${money(p.freebetBalance)}</b> · Primeira aposta protegida: ${p.firstBetUsed ? 'utilizada' : 'disponível'}</p>
    ${p.bonuses.length ? `<div class="table-wrap"><table><tbody>${p.bonuses.map((b) => `<tr><td>${esc(b.name)}</td><td class="num">${money(b.amount)}</td><td>${money(b.rolloverProgress)} / ${money(b.rolloverTarget)}</td><td><span class="pill">${PROMO_STATUS[b.status]}</span>${b.cancelReason ? ` <small class="muted">${esc(b.cancelReason)}</small>` : ''}</td>
      <td>${b.status === 'active' ? `<button class="danger-btn btn-sm" data-action="bonus-cancel" data-id="${b.id}">Cancelar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem bónus.</p>'}
    <div class="form-actions"><button class="${u.promoBlocked ? 'ghost-btn' : 'danger-btn'} btn-sm" data-action="promo-block" data-id="${u.id}" data-blocked="${u.promoBlocked ? 0 : 1}">${u.promoBlocked ? 'Desbloquear promoções' : 'Bloquear promoções (abuso)'}</button></div>
    <p class="muted">Limites do jogador: ${LIM.map(([k, l]) => `${l} ${lim[k] === null ? '—' : money(lim[k])}`).join(' · ')}</p></div>`;
}

/** Bringing the players of the previous platform (Bet62Novo): a dry run first, then the import. */
let novoReport = null;
function novoPanel() {
  const r = novoReport;
  const out = r ? `<div class="table-wrap"><table><tbody>
      <tr><td>${r.dryRun ? '<b>Simulação</b> (nada foi gravado)' : '<b>Importação concluída</b>'}</td><td></td></tr>
      <tr><td>Jogadores no Bet62Novo</td><td class="num">${r.players}</td></tr>
      <tr><td>${r.dryRun ? 'Seriam importados' : 'Importados'}</td><td class="num">${r.imported}</td></tr>
      <tr><td>Já importados antes</td><td class="num">${r.alreadyImported}</td></tr>
      <tr><td>Saldo real transferido</td><td class="num">${money(r.balance)}</td></tr>
      <tr><td>Free bets transferidas</td><td class="num">${money(r.freebets)}</td></tr>
      <tr><td>Documentos KYC</td><td class="num">${r.documents}</td></tr>
      <tr><td>Levantamentos (pendentes)</td><td class="num">${r.withdrawals} (${r.pendingWithdrawals})</td></tr>
      <tr><td>Apostas ainda pendentes no Bet62Novo</td><td class="num">${r.pendingBets}${r.pendingBets ? ' ⚠️ liquide-as lá antes' : ''}</td></tr>
    </tbody></table></div>
    ${r.skipped.length ? `<p class="muted">Não importados (${r.skipped.length}): ${r.skipped.slice(0, 30).map((s) => `${esc(s.email || `#${s.id}`)} — ${esc(s.reason)}`).join(' · ')}${r.skipped.length > 30 ? ' …' : ''}</p>` : ''}` : '';
  return `<div class="panel"><h3>Migração do Bet62Novo</h3>
    <p class="muted">Traz os jogadores da plataforma anterior: contas (entram com a mesma palavra-passe), saldo real, free bets, KYC e levantamentos.
      O Bet62Novo só é lido. Precisa da variável BET62NOVO_DATABASE_URL no Railway. Faça primeiro a simulação e confira os totais.</p>
    <div class="form-actions"><button class="ghost-btn btn-sm" data-action="novo-import" data-dry="1">Simular importação</button>
      <button class="danger-btn btn-sm" data-action="novo-import" data-dry="0">Importar agora</button></div>${out}</div>`;
}

/** Telegram channel: the bot's state, a post to publish, the history and the games posted automatically. */
const TG_TYPE = { custom: 'Publicação', promotion: '🎁 Promoção', bet_ticket: '🎟️ Bilhete' };
const TG_PROMO = { sent: ['open', 'Pré-jogo'], live: ['won', 'Ao vivo'], finished: ['void', 'Finalizado'], deleted: ['void', 'Apagado'], failed: ['lost', 'Falhou'] };
const TG_REASON = { too_soon: 'à espera do intervalo entre publicações', no_candidates: 'nenhum jogo das ligas escolhidas nas próximas 24 h', auto_off: 'publicação automática desligada', no_public_url: 'falta PUBLIC_URL (o endereço do site, para os botões)', telegram_not_configured: 'Telegram não configurado' };
const TG_TICKET = { sent: ['open', 'Em jogo'], won: ['won', 'Ganho'], lost: ['lost', 'Perdido'], void: ['void', 'Anulado'], failed: ['lost', 'Falhou'] };
const TG_TICKET_REASON = { not_enough_games: 'não há jogos suficientes com essas odds na janela escolhida', tickets_off: 'bilhetes desligados', not_time: 'fora dos horários' };
function ticketsPanel(c, tickets) {
  return `<form class="panel" data-form="tg-tickets"><h3>Bilhetes sugeridos (só para o Telegram)</h3>
    <p class="muted">Nos horários escolhidos (hora de Lisboa) é montada uma múltipla com os favoritos de jogos de futebol diferentes, das ligas principais primeiro,
      com uma aposta de exemplo e o retorno. <b>Não é feita nenhuma aposta</b>: é só publicado. O botão do Telegram põe as seleções no boletim do site.
      A mensagem marca depois cada jogo ✅ / ❌ e o resultado do bilhete.</p>
    <div class="form-actions"><label class="adm-switch"><input type="checkbox" name="on"${c.on ? ' checked' : ''}> Publicar automaticamente nos horários</label></div>
    <div class="form-grid three">
      <div class="field"><label>Horários (HH:MM, separados por vírgula)</label><input name="times" value="${esc(c.times.join(', '))}" placeholder="12:00, 18:00"></div>
      <div class="field"><label>Jogos por bilhete</label><input name="legs" type="number" min="2" max="8" value="${c.legs}"></div>
      <div class="field"><label>Odd mínima por jogo</label><input name="minOdds" inputmode="decimal" value="${c.minOdds}"></div>
      <div class="field"><label>Odd máxima por jogo</label><input name="maxOdds" inputmode="decimal" value="${c.maxOdds}"></div>
      <div class="field"><label>Aposta de exemplo (€)</label><input name="stake" inputmode="decimal" value="${c.stake}"></div>
      <div class="field"><label>Jogos a começar nas próximas (horas)</label><input name="hours" type="number" min="1" max="48" value="${c.hours}"></div>
    </div>
    <div class="form-actions"><button class="primary-btn">Guardar</button><button type="button" class="ghost-btn" data-action="tg-ticket">Gerar e publicar um bilhete agora</button></div>
    ${tickets.length ? `<div class="table-wrap"><table><thead><tr><th>Publicado</th><th>Jogos</th><th>Odd</th><th>Aposta → retorno</th><th>Estado</th></tr></thead><tbody>
      ${tickets.map((t) => `<tr><td>${fmtDateTime(t.createdAt)}${t.slot ? `<br><small class="muted">${esc(t.slot)}</small>` : ''}</td>
        <td>${t.legs.length ? t.legs.map((l) => `${esc(l.home)} x ${esc(l.away)} <small class="muted">(${l.code === '1' ? '1' : l.code === '2' ? '2' : 'X'} · ${fmtOdds(l.odds)})</small>`).join('<br>') : '—'}</td>
        <td class="num">${t.odds ? fmtOdds(t.odds) : '—'}</td><td class="num">${t.stake ? `${money(t.stake)} → ${money(t.stake * t.odds)}` : '—'}</td>
        <td><span class="pill ${(TG_TICKET[t.status] || ['void'])[0]}">${(TG_TICKET[t.status] || [0, t.status])[1]}</span>${t.error ? `<br><small class="muted">${esc(t.error)}</small>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Ainda nenhum bilhete.</p>'}</form>`;
}
function adminTelegram({ status: st, posts = [], promos = [], tickets = [] }) {
  if (!st.enabled) {
    return `<div class="panel"><h3>Telegram</h3><p class="muted">Não configurado. No Railway, defina <b>TELEGRAM_BOT_TOKEN</b> (o bot criado no @BotFather)
      e <b>TELEGRAM_CHANNEL_ID</b> (@canal ou o id -100… de um canal privado). O bot tem de ser administrador do canal, com permissão para publicar.</p></div>`;
  }
  const last = st.lastTick?.result;
  const lastText = st.lastTick ? (st.lastTick.error ? `erro: ${st.lastTick.error}` : last?.action === 'posted' ? `publicou o jogo #${last.eventId} (${last.status === 'sent' ? 'enviado' : `falhou: ${last.error || ''}`})` : TG_REASON[last?.reason] || last?.reason || '—') : 'ainda não correu';
  return `<div class="panel"><h3>Canal ${esc(st.channel)}</h3>
    <p class="muted">Publicação automática: um jogo de futebol das ligas principais de cada vez (no mínimo ${st.gapMinutes} min entre jogos), com as odds 1X2 e Ambas marcam em botões que abrem o jogo no site.
      A mesma mensagem passa a <b>AO VIVO</b> com o resultado, a <b>FINALIZADO</b> no fim, e é apagada ${st.deleteMinutes} min depois.</p>
    ${st.production ? '' : '<p class="muted">⚠️ Este não é o ambiente de produção do Railway: a publicação automática não corre aqui.</p>'}
    <div class="form-actions"><label class="adm-switch"><input type="checkbox" data-action="tg-auto"${st.auto ? ' checked' : ''}> Publicação automática</label>
      <button class="ghost-btn btn-sm" data-action="tg-promote">Publicar o próximo jogo agora</button></div>
    <p class="muted">Última verificação: ${esc(lastText)}${st.lastTick ? ` (${fmtDateTime(st.lastTick.at)})` : ''}</p></div>
  ${ticketsPanel(st.tickets, tickets)}
  <form class="panel" data-form="tg-post"><h3>Nova publicação</h3>
    <div class="form-grid">
      <div class="field"><label>Tipo</label><select name="type">${Object.entries(TG_TYPE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label>Título</label><input name="title" required maxlength="200"></div>
      <div class="field wide"><label>Texto</label><textarea name="body" required rows="5" maxlength="3500"></textarea></div>
      <div class="field"><label>Botão (opcional)</label><input name="ctaText" maxlength="60" placeholder="APOSTAR AGORA"></div>
      <div class="field"><label>Link do botão</label><input name="ctaUrl" type="url" placeholder="https://…"></div>
    </div>
    <div class="form-actions"><button class="primary-btn">Publicar no Telegram</button></div></form>
  <div class="panel"><h3>Jogos publicados automaticamente</h3>${promos.length ? `<div class="table-wrap"><table><thead><tr><th>Jogo</th><th>Competição</th><th>Início</th><th>Estado</th><th>Publicado</th></tr></thead><tbody>
    ${promos.map((p) => `<tr><td>${esc(p.game)}</td><td>${esc(p.competition || '')}${p.tier ? ` <small class="muted">(${esc(p.tier)})</small>` : ''}</td><td>${fmtDateTime(p.startTime)}</td>
      <td><span class="pill ${(TG_PROMO[p.status] || ['void'])[0]}">${(TG_PROMO[p.status] || [0, p.status])[1]}</span>${p.error ? `<br><small class="muted">${esc(p.error)}</small>` : ''}</td><td>${fmtDateTime(p.createdAt)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Ainda nenhum.</p>'}</div>
  <div class="panel"><h3>Publicações</h3>${posts.length ? `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Título</th><th>Por</th><th>Estado</th><th>Data</th></tr></thead><tbody>
    ${posts.map((p) => `<tr><td>${TG_TYPE[p.type] || esc(p.type)}</td><td>${esc(p.title)}</td><td>${esc(p.created_by || '')}</td>
      <td><span class="pill ${p.status === 'sent' ? 'won' : 'lost'}">${p.status === 'sent' ? 'Enviada' : 'Falhou'}</span>${p.error ? `<br><small class="muted">${esc(p.error)}</small>` : ''}</td><td>${fmtDateTime(p.created_at)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Ainda nenhuma.</p>'}</div>`;
}

/** Promotional campaigns by email / SMS (Brevo): a message to the players who accept promotions. */
const CP_TEMPLATES = {
  freebet: ['🎁 {nome}, tem uma FreeBet à sua espera', 'Olá {nome},\n\nPreparámos uma FreeBet para si. Entre na sua conta e use-a na aposta que quiser.\n\nBoa sorte!', 'VER PROMOÇÃO'],
  freespins: ['🎰 Free Spins grátis para si, {nome}', 'Olá {nome},\n\nTem Free Spins à sua espera no casino. Escolha o jogo e comece a rodar.\n\nBoa sorte!', 'JOGAR AGORA'],
  deposito: ['💶 Bónus no seu próximo depósito', 'Olá {nome},\n\nFaça um depósito hoje e receba um bónus extra para apostar.\n\nConsulte as condições na página de promoções.', 'DEPOSITAR'],
  boost: ['🚀 Odds aumentadas nas múltiplas', 'Olá {nome},\n\nAs suas apostas múltiplas pagam mais: o boost aumenta o ganho conforme o número de seleções.', 'APOSTAR AGORA'],
  volta: ['Sentimos a sua falta, {nome}', 'Olá {nome},\n\nHá jogos novos todos os dias e promoções à sua espera. Volte e veja o que preparámos para si.', 'VOLTAR À BET62'],
};
const CP_STATUS = { sending: ['open', 'A enviar'], sent: ['won', 'Enviada'], failed: ['lost', 'Falhou'] };
function adminCampaigns({ status: st, segments, optedIn, campaigns = [] }) {
  const site = location.origin;
  const off = !st.email && !st.sms;
  return `<div class="panel"><h3>Campanhas por email e SMS</h3>
    ${off ? `<p class="muted">⚠️ Brevo não configurado. No Railway, defina <b>BREVO_API_KEY</b> (Brevo → SMTP &amp; API → API Keys) e <b>BREVO_SENDER_EMAIL</b>
      (um remetente verificado no Brevo, por exemplo promocoes@o-seu-dominio). Para SMS, também <b>BREVO_SMS_SENDER</b> (nome até 11 letras, ex.: BET62).</p>`
      : `<p class="muted">Email: ${st.email ? `ligado (${esc(st.sender)})` : 'desligado'} · SMS: ${st.sms ? 'ligado' : 'desligado (defina BREVO_SMS_SENDER)'}</p>`}
    <p class="muted">Recebem todos os registados que aceitaram promoções, tenham ou não depositado (email: <b>${optedIn.email}</b> · SMS: <b>${optedIn.sms}</b> de <b>${optedIn.registered ?? '—'}</b> registados).
      O site pergunta a cada jogador se quer receber promoções por email e SMS (quem responde "Agora não" volta a ser perguntado 30 dias depois). Contas em autoexclusão ou banidas nunca recebem.
      Cada email leva o aviso 18+ e um link para deixar de receber. O plano grátis do Brevo envia até 300 emails por dia; os SMS são pagos com créditos Brevo e só saem entre as 09:00 e as 21:00.
      Use <b>{nome}</b> no texto para o primeiro nome do jogador.</p>
    <div class="form-actions"><button class="ghost-btn btn-sm" data-action="cp-check">Verificar configuração do Brevo</button></div><div id="cpCheck"></div></div>
  <form class="panel" data-form="campaign" id="cpForm"><h3>Nova campanha</h3>
    <div class="form-grid three">
      <div class="field"><label>Canal</label><select name="channel" data-cp="1"><option value="email">Email</option><option value="sms"${st.sms ? '' : ' disabled'}>SMS${st.sms ? '' : ' (não configurado)'}</option></select></div>
      <div class="field"><label>Público</label><select name="segment" data-cp="1">${Object.entries(segments).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label>X dias (sem apostas / registados)</label><input name="days" type="number" min="1" max="365" value="7" data-cp="1"></div>
    </div>
    <p class="cp-count" id="cpCount">A contar…</p>
    <div class="form-grid">
      <div class="field"><label>Modelo (opcional)</label><select name="template" data-cp="tpl"><option value="">— Escrever do zero —</option>
        <option value="freebet">FreeBet</option><option value="freespins">Free Spins casino</option><option value="deposito">Bónus de depósito</option><option value="boost">Boost de múltiplas</option><option value="volta">Jogadores inativos</option></select></div>
      <div class="field cp-email"><label>Assunto</label><input name="subject" maxlength="150"></div>
      <div class="field wide"><label>Mensagem</label><textarea name="body" rows="7" maxlength="5000" required></textarea><small class="muted" id="cpChars"></small></div>
      <div class="field cp-email"><label>Botão (opcional)</label><input name="ctaText" maxlength="60" placeholder="VER PROMOÇÃO"></div>
      <div class="field cp-email"><label>Link do botão</label><input name="ctaUrl" type="url" value="${esc(site)}/#/promocoes"></div>
      <div class="field cp-sms" hidden><label>Telefone para o teste</label><input name="testPhone" placeholder="+351 9…"></div>
    </div>
    <div class="form-actions"><button type="button" class="ghost-btn" data-action="cp-test">Enviar teste para mim</button><button class="primary-btn">Enviar campanha</button></div></form>
  <div class="panel"><h3>Campanhas enviadas</h3>${campaigns.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Canal</th><th>Mensagem</th><th>Público</th><th>Enviados</th><th>Estado</th></tr></thead><tbody>
    ${campaigns.map((c) => `<tr><td>${fmtDateTime(c.createdAt)}<br><small class="muted">${esc(c.createdBy || '')}</small></td><td>${c.channel === 'sms' ? 'SMS' : 'Email'}</td>
      <td>${esc(c.subject || c.body.slice(0, 60))}</td><td>${esc(segments[c.segment] || c.segment)}${['inactive', 'new'].includes(c.segment) ? ` <small class="muted">(${c.days} dias)</small>` : ''}</td>
      <td class="num">${c.sent} / ${c.total}${c.failed ? `<br><small class="muted">${c.failed} falharam</small>` : ''}</td>
      <td><span class="pill ${(CP_STATUS[c.status] || ['void'])[0]}">${(CP_STATUS[c.status] || [0, c.status])[1]}</span>${c.error ? `<br><small class="muted">${esc(c.error)}</small>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Ainda nenhuma.</p>'}</div>`;
}
const campaignBody = (form) => {
  const d = formData(form);
  return { channel: d.channel, segment: d.segment, days: d.days, subject: d.subject, body: d.body, ctaText: d.ctaText, ctaUrl: d.ctaUrl, testPhone: d.testPhone };
};
let cpTimer = null;
function campaignCount() {
  const form = $('#cpForm');
  if (!form) return;
  const sms = form.channel.value === 'sms';
  $$('.cp-email', form).forEach((el) => { el.hidden = sms; });
  $$('.cp-sms', form).forEach((el) => { el.hidden = !sms; });
  form.days.closest('.field').hidden = !['inactive', 'new'].includes(form.segment.value);
  $('#cpChars').textContent = sms ? `${form.body.value.length} caracteres (até 160 = 1 SMS; acentos contam mais)` : '';
  clearTimeout(cpTimer);
  cpTimer = setTimeout(async () => {
    try {
      const { count } = await api('/api/admin/campaigns/count', { method: 'POST', body: { channel: form.channel.value, segment: form.segment.value, days: form.days.value } });
      $('#cpCount').innerHTML = `Vai para <b>${count}</b> jogador(es).`;
      form.dataset.count = count;
    } catch (err) { $('#cpCount').textContent = err.message; }
  }, 200);
}

/** Players whose identity documents wait for validation (top of the players tab). */
function kycPendingPanel(list = []) {
  if (!list.length) return '<div class="panel"><h3>Verificações KYC pendentes</h3><p class="muted">Nenhum documento à espera de validação.</p></div>';
  return `<div class="panel kyc-queue"><h3>Verificações KYC pendentes <span class="pill pending">${list.length}</span></h3>
    <div class="table-wrap"><table><thead><tr><th>Jogador</th><th>Email</th><th>Enviado</th><th></th></tr></thead><tbody>
    ${list.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(fmtDateTime(u.kycSentAt))}</td>
      <td><button class="primary-btn btn-sm" data-action="user-detail" data-id="${u.id}">Ver documentos</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

/** One identity document: its picture (or the PDF to open), and Validar / Rejeitar. */
function kycDocCard(x) {
  const file = `/api/admin/kyc/${x.id}/file`;
  const preview = /^image\//.test(x.mimeType || '')
    ? `<a href="${file}" target="_blank" rel="noopener"><img class="kyc-img" src="${file}" alt="${esc(x.kind)}" loading="lazy"></a>`
    : `<a class="kyc-pdf" href="${file}" target="_blank" rel="noopener">📄 Abrir ${esc(x.fileName)}</a>`;
  return `<div class="kyc-doc ${x.status}">
    ${preview}
    <div class="kyc-meta"><b>${esc(x.kind)}</b><small class="muted">${esc(x.fileName)} · ${Math.round(x.size / 1024)} KB · enviado ${esc(fmtDateTime(x.createdAt))}</small>
      <span class="pill ${x.status}">${KYC_LABEL[x.status] || x.status}</span>${x.reviewedAt ? ` <small class="muted">decidido ${esc(fmtDateTime(x.reviewedAt))}</small>` : ''}</div>
    <div class="form-actions"><button class="primary-btn btn-sm" data-action="kyc-doc" data-doc="${x.id}" data-status="approved"${x.status === 'approved' ? ' disabled' : ''}>Validar</button>
      <button class="danger-btn btn-sm" data-action="kyc-doc" data-doc="${x.id}" data-status="rejected"${x.status === 'rejected' ? ' disabled' : ''}>Rejeitar</button></div>
  </div>`;
}

function userDetailView(d) {
  const u = d.user;
  const deposits = d.transactions.filter((t) => t.type === 'deposit');
  const docs = d.documents.length
    ? `<div class="kyc-docs">${d.documents.map(kycDocCard).join('')}</div>
      <div class="form-actions"><button class="primary-btn btn-sm" data-action="kyc-account" data-id="${u.id}" data-status="approved">Aprovar verificação da conta</button>
        <button class="danger-btn btn-sm" data-action="kyc-account" data-id="${u.id}" data-status="rejected">Rejeitar verificação da conta</button></div>`
    : '<p class="muted">O jogador ainda não enviou documentos.</p>';
  const wd = d.withdraw;
  const canWithdraw = wd ? `<p class="${wd.eligible ? 'ok-text' : 'muted'}">Levantamentos: ${wd.eligible ? 'desbloqueados' : esc(wd.message)}</p>` : '';
  return `<div class="form-actions"><button class="ghost-btn btn-sm" data-action="user-back">‹ Utilizadores</button></div>
    <div class="panel"><h3>${esc(u.name)} ${u.banned ? '<span class="pill lost">Banido</span>' : ''}</h3>
      <p>${esc(u.email)}${u.phone ? ` · ${esc(u.phone)}` : ''} · nascido em ${esc(u.birthdate || '—')} · registo ${esc(fmtDateTime(u.createdAt))}</p>
      <div class="user-sums">
        <div><small>Saldo</small><strong>${money(u.balance)}</strong></div>
        ${u.inCasino !== null && u.inCasino !== undefined ? `<div title="Jogo aberto: o saldo está no casino enquanto joga e volta quando sai."><small>No casino agora</small><strong>${typeof u.inCasino === 'number' ? money(u.inCasino) : esc(u.inCasino)}</strong></div>` : ''}
        <div><small>FreeBets</small><strong>${money(u.freebet)}</strong></div>
        <div><small>Depósitos</small><strong>${money(d.totals.deposits)}</strong></div><div><small>Levantamentos</small><strong>${money(d.totals.withdrawals)}</strong></div>
        <div><small>Apostado</small><strong>${money(d.totals.staked)}</strong></div><div><small>Prémios</small><strong>${money(d.totals.payouts)}</strong></div>
        <div title="Soma das transferências para o casino e das que voltaram. A diferença é o que perdeu (ou ganhou) nas slots."><small>Casino: enviado / voltou</small><strong>${money(d.totals.casinoOut)} / ${money(d.totals.casinoIn)}</strong></div>
      </div>
      <div class="user-acts big">
        <button class="ua wallet" data-action="user-balance" data-id="${u.id}" data-name="${esc(u.name)}" data-balance="${u.balance}" title="Ajustar saldo">${ICON.wallet}</button>
        <button class="ua gift" data-action="user-freebet" data-id="${u.id}" data-name="${esc(u.name)}" data-freebet="${u.freebet}" title="FreeBet / Free Spins">${ICON.gift}</button>
        ${u.role === 'admin' ? '' : `<button class="ua ban${u.banned ? ' on' : ''}" data-action="user-ban" data-id="${u.id}" data-name="${esc(u.name)}" data-banned="${u.banned ? 1 : 0}" title="${u.banned ? 'Desbanir' : 'Banir'}">${ICON.ban}</button>`}
      </div>
    </div>
    ${userPromosPanel(d)}
    <div class="panel"><h3>Verificação de identidade (KYC) <span class="pill ${u.kycStatus}">${KYC_LABEL[u.kycStatus] || u.kycStatus}</span></h3>${docs}${canWithdraw}</div>
    <div class="panel"><h3>Apostas <small class="muted">${d.bets.length}</small></h3>${d.bets.length ? d.bets.map((b) => betCard(b)).join('') : '<p class="muted">Sem apostas.</p>'}</div>
    <div class="panel"><h3>Depósitos <small class="muted">${deposits.length}</small></h3>${deposits.length ? `<div class="table-wrap"><table><tbody>${deposits.map((t) => `<tr><td>${esc(fmtDateTime(t.createdAt))}</td><td>${esc(t.description)}</td><td class="num">${money(t.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem depósitos.</p>'}</div>
    <div class="panel"><h3>Levantamentos <small class="muted">${d.withdrawals.length}</small></h3>${d.withdrawals.length ? `<div class="table-wrap"><table><tbody>${d.withdrawals.map((w) => `<tr><td>${esc(fmtDateTime(w.createdAt))}</td><td>${esc(w.iban)}</td><td><span class="pill ${w.status}">${STATUS_LABEL[w.status] || w.status}</span></td><td class="num">${money(w.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem levantamentos.</p>'}</div>
    <div class="panel"><h3>Movimentos da carteira</h3>${d.transactions.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead><tbody>${d.transactions.map((t) => `<tr><td>${esc(fmtDateTime(t.createdAt))}</td><td>${TX_LABEL[t.type] || t.type}</td><td>${esc(t.description)}</td><td class="num">${money(t.amount)}</td><td class="num">${money(t.balanceAfter)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem movimentos.</p>'}</div>`;
}

function betCard(b, { showUser = false, settle = false } = {}) {
  // Manual settlement (Apostas tab): each open leg gets a result to pick.
  const manual = settle && b.status === 'open';
  const legPick = (l) => (manual && l.status === 'open' ? `<select class="leg-pick" data-leg="${l.id}" aria-label="Resultado da seleção">
      <option value="">— Resultado —</option><option value="won">Ganha</option><option value="lost">Perdida</option><option value="void">Anulada</option></select>` : '');
  return `<div class="bet-card" data-bet="${b.id}">
    <div class="bet-card-head"><span>#${b.id} · ${b.type === 'multiple' ? `Múltipla (${b.legs.length})` : b.type === 'builder' ? `Criador de apostas (${b.legs.length})` : 'Simples'} · ${esc(fmtDateTime(b.createdAt))}${showUser ? ` · ${esc(b.email)}` : ''}</span><span class="pill ${b.status}">${STATUS_LABEL[b.status]}</span></div>
    ${b.legs.map((l) => `<div class="bet-leg"><div>${esc(l.match)}<small>${esc(l.competition)} · ${esc(l.marketName && l.market !== '1x2' ? `${l.marketName}: ` : '')}${esc(l.label || CODE_LABEL[l.code])}${l.score ? ` · ${esc(l.score)}` : ''}${l.eventStatus ? ` · evento ${esc(STATUS_LABEL[l.eventStatus] || l.eventStatus)}` : ''}</small></div><div class="num"><b class="gold">${fmtOdds(l.odds)}</b><br><span class="pill ${l.status}">${STATUS_LABEL[l.status]}</span>${legPick(l)}</div></div>`).join('')}
    <div class="bet-card-foot"><span>Aposta <strong>${money(b.stake)}</strong></span><span>Cotação <strong>${fmtOdds(b.totalOdds)}</strong></span>
      <span>${b.status === 'open' ? 'Retorno potencial' : 'Pago'} <strong class="${b.status === 'won' ? 'green' : ''}">${money(b.status === 'open' ? b.potential : b.payout)}</strong></span></div>
    ${b.manual ? `<small class="muted">Liquidado manualmente em ${esc(fmtDateTime(b.manual.at))}${b.manual.note ? ` · ${esc(b.manual.note)}` : ''}</small>` : ''}
    ${manual ? `<div class="form-actions bet-settle">
      <button class="primary-btn btn-sm" data-action="bet-settle" data-id="${b.id}">Liquidar com os resultados escolhidos</button>
      <button class="ghost-btn btn-sm" data-action="bet-settle-all" data-id="${b.id}" data-result="won">Bilhete ganho</button>
      <button class="ghost-btn btn-sm" data-action="bet-settle-all" data-id="${b.id}" data-result="lost">Bilhete perdido</button>
      <button class="danger-btn btn-sm" data-action="bet-settle-all" data-id="${b.id}" data-result="void">Anular (devolver aposta)</button>
    </div>` : ''}
  </div>`;
}

/** Sends a manual settlement: { legId: 'won' | 'lost' | 'void' } for the ticket's open legs. */
async function settleTicket(id, legs, label) {
  if (!Object.keys(legs).length) { toast('Escolha um resultado', 'Defina o resultado de pelo menos uma seleção.', 'error'); return; }
  const note = prompt(`${label}\n\nMotivo (opcional, fica registado):`, '');
  if (note === null) return;
  try {
    const r = await api(`/api/admin/bets/${id}/settle`, { method: 'POST', body: { legs, note } });
    toast(`Bilhete #${id}`, r.status === 'open' ? 'Resultados guardados; ainda há seleções em aberto.' : `${STATUS_LABEL[r.status]}${r.paid ? ` · pago ${money(r.paid)}` : ''}`);
    loadTab();
  } catch (err) { toast('Erro', err.message, 'error'); }
}

// ---------- login ----------

function loginView(error = '') {
  return `<div class="adm-login"><form class="adm-login-card" data-form="login" novalidate>
    <div class="adm-login-head"><div class="adm-shield">${adminIcon('shield', 27)}</div><div class="brand-word">BET<span>62</span></div><p>Painel Administrativo</p><small class="adm-login-note">Acesso restrito à equipa de operações</small></div>
    <div class="form-error${error ? '' : ' hidden'}">${esc(error)}</div>
    <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="username" placeholder="admin@seudominio.com"></div>
    <div class="field"><label>Palavra-passe</label><input name="password" type="password" required autocomplete="current-password" placeholder="••••••••"></div>
    <button class="primary-btn adm-login-btn">Entrar no painel <span>${adminIcon('arrow', 16)}</span></button>
    <a class="adm-back" href="/"><span>${adminIcon('home', 14)}</span>Voltar ao site</a>
  </form></div>`;
}

// ---------- layout ----------

function shell() {
  const tab = TABS.find((t) => t.id === state.tab) || TABS[0];
  const pending = state.stats?.pendingWithdrawals || 0;
  const link = (t) => `<button class="adm-nav${t.id === state.tab ? ' active' : ''}" data-tab="${t.id}"><span class="adm-icon">${adminIcon(t.icon)}</span><span class="grow">${esc(t.label)}</span>${t.id === 'levantamentos' && pending ? `<b class="adm-badge">${pending}</b>` : ''}</button>`;
  const sections = [...new Set(TABS.map((t) => t.section))];
  const sidebar = `<div class="adm-side-head"><span class="adm-brand-mark">B</span><div class="adm-brand-lockup"><span class="brand-word small">BET<span>62</span></span><small>OPERATIONS</small></div><span class="adm-tag">ADMIN</span></div>
    <nav class="adm-side-nav">${sections.map((sec) => `<div class="adm-section">${esc(sec)}</div>${TABS.filter((t) => t.section === sec).map(link).join('')}`).join('')}</nav>
    <div class="adm-side-foot"><div class="adm-user"><span class="adm-user-dot"></span>${esc(state.user?.email || '')}</div><a class="adm-nav" href="/"><span class="adm-icon">${adminIcon('home')}</span><span class="grow">Ver o site</span></a><button class="adm-nav" data-action="logout"><span class="adm-icon">${adminIcon('logout')}</span><span class="grow">Sair</span></button></div>`;
  return `<div class="adm">
    <aside class="adm-side" id="admSide">${sidebar}</aside>
    <div class="adm-overlay" data-action="close-menu"></div>
    <main class="adm-main">
      <header class="adm-top"><button class="adm-burger" data-action="open-menu" aria-label="Menu">${adminIcon('menu', 20)}</button>
        <div class="adm-top-title"><span class="adm-top-kicker">BET62 <i>/</i> ADMINISTRAÇÃO</span><h1>${esc(tab.label)}</h1></div>
        <span class="adm-secure-label">${adminIcon('shield', 14)} Área restrita</span>
        <button class="ghost-btn btn-sm adm-refresh" data-action="refresh">${adminIcon('refresh', 15)}<span>Atualizar</span></button></header>
      <div class="adm-body"><div id="adminMain"><div class="loading">A carregar…</div></div></div>
    </main>
    <nav class="adm-bottom">${MOBILE_TABS.map((id) => TABS.find((t) => t.id === id)).map((t) => `<button class="${t.id === state.tab ? 'active' : ''}" data-tab="${t.id}"><span>${adminIcon(t.icon, 18)}</span>${esc(t.label)}</button>`).join('')}
      <button data-action="open-menu"><span>${adminIcon('menu', 18)}</span>Mais</button></nav>
  </div>`;
}

function render() {
  if (!state.user) { $('#app').innerHTML = loginView(); return; }
  $('#app').innerHTML = shell();
  loadTab();
}

function go(tab) {
  state.tab = TABS.some((t) => t.id === tab) ? tab : 'painel';
  state.userDetail = null;
  if (location.hash !== `#${state.tab}`) history.replaceState(null, '', `#${state.tab}`);
  render();
}

// ---------- tabs ----------

function dashboard(s, settle) {
  const card = (icon, label, value, sub = '', tone = '') => `<div class="adm-card ${tone}"><span class="adm-card-icon">${adminIcon(icon, 19)}</span><small>${esc(label)}</small><strong>${esc(value)}</strong>${sub ? `<em>${esc(sub)}</em>` : ''}</div>`;
  const alert = s.pendingWithdrawals ? `<button class="adm-alert" data-tab="levantamentos"><span class="adm-alert-icon">${adminIcon('warning', 17)}</span><span>${s.pendingWithdrawals} levantamento(s) pendente(s) a aguardar aprovação — total ${esc(money(s.pendingWithdrawalAmount))}</span><span class="adm-alert-arrow">→</span></button>` : '';
  const sm = settle?.summary || {};
  const storage = s.storage && !s.storage.persistent
    ? `<div class="adm-alert"><span class="adm-alert-icon">${adminIcon('warning', 17)}</span><span>A base de dados está no disco temporário do servidor (${esc(s.storage.path)}): saldos, apostas e utilizadores são apagados em cada deploy. No Railway, crie um <strong>Volume</strong> neste serviço (Settings → Volumes, por exemplo em /data) e faça redeploy — o servidor passa a usá-lo sozinho.</span></div>`
    : '';
  return `${storage}${alert}
    <div class="adm-overview"><div><span class="adm-eyebrow">CENTRO DE OPERAÇÕES</span><p>Visão geral da atividade e do desempenho da plataforma.</p></div><span class="adm-overview-mark">${adminIcon('chart', 17)} Monitorização</span></div>
    <div class="adm-cards">
      ${card('users', 'Jogadores', s.users, '', 'blue')}
      ${card('ticket', 'Apostas em aberto', s.openBets, money(s.openStake) + ' apostado', 'gold')}
      ${card('coins', 'Receita bruta', money(s.grossRevenue), 'apostas liquidadas', 'green')}
      ${card('wallet', 'Levantamentos pendentes', s.pendingWithdrawals, money(s.pendingWithdrawalAmount), 'red')}
    </div>
    <div class="adm-cards">
      ${card('warning', 'Responsabilidade máxima', money(sm.maxLiability), 'se todas as apostas ganharem', 'red')}
      ${card('scale', 'Liquidadas hoje', sm.settledToday ?? 0, money(sm.stakesSettledToday) + ' apostado', 'blue')}
      ${card('wallet', 'Pago hoje', money(sm.paidToday), '', 'gold')}
      ${card('trend', 'Margem hoje', money(sm.marginToday), '', 'green')}
    </div>
    <div class="panel adm-shortcut-panel"><div class="adm-panel-heading"><div><span class="adm-eyebrow">ACESSO RÁPIDO</span><h3>Atalhos de operação</h3></div><span class="adm-panel-count">${TABS.length - 1} secções</span></div><div class="adm-shortcuts">
      ${TABS.filter((t) => t.id !== 'painel').map((t) => `<button class="ghost-btn adm-shortcut" data-tab="${t.id}"><span>${adminIcon(t.icon, 16)}</span>${esc(t.label)}<i>${adminIcon('trend', 13)}</i></button>`).join('')}
    </div></div>`;
}

async function loadTab() {
  const main = $('#adminMain');
  if (!main) return;
  try {
    const s = await api('/api/admin/stats');
    state.stats = s;
    const badge = $('.adm-nav[data-tab="levantamentos"] .adm-badge');
    if (badge) badge.textContent = s.pendingWithdrawals;
    const tab = state.tab;
    if (tab === 'painel') main.innerHTML = dashboard(s, await api('/api/admin/settlement').catch(() => null));
    else if (tab === 'novo') main.innerHTML = adminNewEvent();
    else if (tab === 'feed') main.innerHTML = adminFeed(await api('/api/admin/feed'));
    else if (tab === 'casino') main.innerHTML = adminCasino(await api('/api/admin/casino'));
    else if (tab === 'peliculas') { skinEd = null; main.innerHTML = adminSkins(await api('/api/admin/skins')); }
    else if (tab === 'mercados') main.innerHTML = marketCatalog(await api('/api/admin/market-catalog'));
    else if (tab === 'liquidacao') main.innerHTML = adminSettlement(await api('/api/admin/settlement'));
    else if (tab === 'promocoes') main.innerHTML = adminPromos(await api('/api/admin/promotions'));
    else if (tab === 'telegram') main.innerHTML = adminTelegram(await api('/api/admin/telegram'));
    else if (tab === 'campanhas') { main.innerHTML = adminCampaigns(await api('/api/admin/campaigns')); campaignCount(); }
    else if (tab === 'afiliados') {
      const [a, c, l] = await Promise.all([api(`/api/admin/affiliates?q=${encodeURIComponent(state.affQ || '')}`), api('/api/admin/affiliates/commissions'), api('/api/admin/affiliates/audit')]);
      main.innerHTML = adminAffiliates(a, c, l);
    }
    else if (tab === 'levantamentos') {
      const { withdrawals, revolut: rv } = await api('/api/admin/withdrawals');
      state.revolutOn = !!rv?.configured;
      const rvPanel = `<div class="panel rv-panel"><h3>Revolut Business ${rv?.configured ? `<span class="pill won">LIGADA · ${rv.environment === 'production' ? 'produção' : 'sandbox'}</span>` : '<span class="pill void">NÃO CONFIGURADA</span>'}</h3>
        <p class="muted">${rv?.configured
          ? `Levantamentos de ${money(rv.autoMin)} a ${money(rv.autoMax)} são pagos automaticamente para o IBAN do jogador. Os restantes ficam aqui: “Aprovar e pagar” envia pela Revolut. ${rv.webhook ? 'Webhook configurado.' : '⚠ Falta REVOLUT_WEBHOOK_SIGNING_SECRET: o estado “Pago” só chega pelo webhook.'}`
          : 'Defina no Railway → Variables: REVOLUT_ENVIRONMENT, REVOLUT_CLIENT_ID, REVOLUT_JWT_ISSUER, REVOLUT_PRIVATE_KEY, REVOLUT_REFRESH_TOKEN, REVOLUT_PAYOUT_ACCOUNT_ID e REVOLUT_WEBHOOK_SIGNING_SECRET (as mesmas do Bet62Novo). Enquanto não estiver ligada, aprove só depois de fazer a transferência à mão.'}</p></div>`;
      const payout = (w) => (w.payout === 'paid' ? '<span class="pill won">Pago (Revolut)</span>' : w.payout === 'processing' ? '<span class="pill open">A pagar (Revolut)</span>'
        : w.payout === 'failed' ? `<span class="pill lost">Revolut falhou</span><br><small class="muted">${esc(w.payoutError || '')}</small>` : '');
      const acts = (w) => (w.status === 'pending' ? `<div class="form-actions">${state.revolutOn ? `<button class="primary-btn btn-sm" data-action="wd-approve" data-id="${w.id}">Aprovar e pagar</button><button class="ghost-btn btn-sm" data-action="wd-manual" data-id="${w.id}">Pago à mão</button>` : `<button class="primary-btn btn-sm" data-action="wd-approve" data-id="${w.id}">Aprovar</button>`}<button class="danger-btn btn-sm" data-action="wd-reject" data-id="${w.id}">Rejeitar</button></div>`
        : w.status === 'approved' && state.revolutOn && !w.payout ? `<button class="ghost-btn btn-sm" data-action="wd-pay" data-id="${w.id}">Pagar pela Revolut</button>` : esc(fmtDateTime(w.decidedAt)));
      main.innerHTML = rvPanel + (withdrawals.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Jogador</th><th>IBAN</th><th class="num">Valor</th><th>Estado</th><th></th></tr></thead><tbody>
        ${withdrawals.map((w) => `<tr><td>${esc(fmtDateTime(w.createdAt))}</td><td>${esc(w.user)}<br><small class="muted">${esc(w.email)}</small></td><td>${esc(w.iban)}</td><td class="num">${money(w.amount)}</td>
          <td><span class="pill ${w.status}">${STATUS_LABEL[w.status]}</span> ${payout(w)}</td>
          <td>${acts(w)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="panel empty">Sem pedidos de levantamento.</div>');
    } else if (tab === 'apostas') {
      const onlyOpen = state.betsFilter === 'open';
      const [{ bets }, co] = await Promise.all([api(`/api/admin/bets${onlyOpen ? '?status=open' : ''}`), api('/api/admin/cashout')]);
      const filter = `<div class="form-actions bets-filter"><button class="${onlyOpen ? 'ghost-btn' : 'primary-btn'} btn-sm" data-action="bets-filter" data-filter="all">Todas</button>
        <button class="${onlyOpen ? 'primary-btn' : 'ghost-btn'} btn-sm" data-action="bets-filter" data-filter="open">Em aberto (liquidar manualmente)</button></div>`;
      main.innerHTML = cashoutPanel(co) + filter + (bets.length ? bets.map((b) => betCard(b, { showUser: true, settle: true })).join('') : `<div class="panel empty">${onlyOpen ? 'Sem bilhetes em aberto.' : 'Sem apostas.'}</div>`);
    } else if (tab === 'utilizadores') {
      if (state.userDetail) {
        main.innerHTML = userDetailView(await api(`/api/admin/users/${state.userDetail}`));
      } else {
        const { users, kycPending } = await api('/api/admin/users');
        main.innerHTML = kycPendingPanel(kycPending) + usersTable(users) + novoPanel();
      }
    } else {
      const { events } = await api('/api/admin/events');
      main.innerHTML = events.length ? events.map(adminEventCard).join('') : '<div class="panel empty">Sem eventos. Crie um em "Novo evento".</div>';
    }
  } catch (err) {
    if (err.status === 401 || err.status === 403) { state.user = null; $('#app').innerHTML = loginView(err.message); return; }
    toast('Erro', err.message, 'error');
  }
}

// ---------- tab renderers ----------

let lastCatalog = null;
let catalogSport = ''; // '' = every sport

function marketCatalog({ catalog, running }) {
  lastCatalog = catalog;
  const intro = `<div class="panel"><h3>Catálogo de mercados do fornecedor</h3>
    <p class="muted">Consulta jogos reais de cada desporto (pré-jogo e ao vivo) e lista os mercados que a API devolve de facto:
    nome, código, linhas, seleções e em quantos jogos da amostra aparece. Na WinHouse todos os mercados vão para o site;
    "Liquidação" diz quais o sistema liquida sozinho pelo resultado e quais ficam para decidir em Liquidação. Cada jogo consultado gasta 1 pedido.</p>
    <div class="form-actions"><label class="field adm-inline">Desporto <select id="catSport">
        <option value="">Todos os desportos</option>${[...new Set([...Object.keys(SPORT_META), ...(catalog?.sports || []).map((sp) => sp.sport)])].map((k) => `<option value="${esc(k)}"${catalogSport === k ? ' selected' : ''}>${esc(`${SPORT_META[k]?.icon || ''} ${SPORT_META[k]?.name || k}`.trim())}</option>`).join('')}
      </select></label>
      <label class="field adm-inline">Jogos por desporto <input id="catSample" type="number" min="3" max="30" value="12"></label>
      <button class="primary-btn" data-action="catalog-run" ${running ? 'disabled' : ''}>${running ? 'A consultar…' : catalogSport ? `Consultar ${esc(SPORT_META[catalogSport]?.name || catalogSport)} agora` : 'Consultar a API agora'}</button>
      ${catalog ? '<button class="ghost-btn" data-action="catalog-copy">Copiar resultado (JSON)</button>' : ''}</div>
    ${catalog ? `<p class="muted">Última consulta: ${esc(fmtDateTime(catalog.at))} · ${catalog.calls} pedidos.</p>` : ''}</div>`;
  if (!catalog) return `${intro}<div class="panel empty">Ainda não foi feita nenhuma consulta.</div>`;
  const sports = catalog.sports.filter((sp) => !sp.disabled && (!catalogSport || sp.sport === catalogSport));
  if (!sports.length) return `${intro}<div class="panel empty">${catalogSport ? 'Ainda sem resultados para este desporto: carregue em "Consultar".' : 'Nenhuma fonte de odds ligada com jogos para consultar.'}</div>`;
  return intro + sports.map((sp) => {
    const name = `${SPORT_META[sp.sport]?.icon || ''} ${SPORT_META[sp.sport]?.name || sp.sport}`;
    if (sp.disabled) return `<div class="panel"><h3>${esc(name)}</h3><p class="muted">Desligado (sem token ou sem Sports Addon).</p></div>`;
    const rows = sp.markets.map((m) => `<tr><td><b>${esc(m.kind)}</b>${m.family !== m.kind ? `<br><small class="muted">${esc(m.family)}</small>` : ''}</td>
      <td>${esc(m.period)}</td><td>${esc(m.lines.join(', ') || '—')}</td><td><small>${esc(m.selections.join(', '))}</small></td>
      ${sp.source === 'winhouse' ? '' : `<td class="num">${m.bookmakers || '—'}</td>`}<td class="num">${m.events}/${sp.sampled}</td><td class="num">${m.pre} / ${m.live}</td>
      <td>${sp.source === 'winhouse' ? (m.wired ? '<span class="pill won">Automática</span>' : '<span class="pill">Manual (admin)</span>')
        : m.wired ? '<span class="pill won">Sim</span>' : '<span class="pill">Não</span>'}</td></tr>`).join('');
    return `<div class="panel"><h3>${esc(name)} <small class="muted">· ${sp.source === 'winhouse' ? 'WinHouse · ' : ''}${sp.sampled} jogos (${sp.sampledLive} ao vivo)</small></h3>
      ${sp.leagues.length ? `<p class="muted"><small>${esc(sp.leagues.join(' · '))}</small></p>` : ''}
      ${sp.errors.length ? `<div class="form-error">${esc(sp.errors.join(' | '))}</div>` : ''}
      ${sp.markets.length ? `<div class="table-wrap"><table><thead><tr><th>Mercado</th><th>${sp.source === 'winhouse' ? 'Categoria' : 'Período'}</th><th>Linhas</th><th>Seleções</th>${sp.source === 'winhouse' ? '' : '<th class="num">Casas</th>'}<th class="num">Jogos</th><th class="num">Pré / Vivo</th><th>${sp.source === 'winhouse' ? 'Liquidação' : 'Na Bet62'}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="muted">A API não devolveu mercados para estes jogos.</p>'}</div>`;
  }).join('');
}


function adminEventCard(e) {
  const odd = (code) => e.selections.find((s) => s.code === code);
  const closed = e.status === 'finished' || e.status === 'cancelled';
  const suspended = e.selections.length && e.selections.every((s) => !s.active);
  const oddInput = (code) => `<div class="field"><span>Odd ${code}</span><input name="odd${code}" value="${odd(code)?.active ? fmtOdds(odd(code).odds) : ''}" inputmode="decimal" ${closed ? 'disabled' : ''} placeholder="—"></div>`;
  return `<form class="admin-event" data-form="admin-event" data-id="${e.id}" data-featured="${e.featured ? 1 : 0}">
    <div class="admin-event-head"><div><strong>${esc(e.home)} vs ${esc(e.away)}</strong><div class="muted">${esc(SPORT_META[e.sport]?.name || e.sport)} · ${esc(e.competition)} · ${esc(fmtDateTime(e.startTime))}</div></div>
      <div>${e.source === 'winhouse' && e.externalId ? `<span class="pill" title="gameId na WinHouse">WinHouse #${esc(e.externalId)}</span> ` : ''}<span class="pill ${e.status}">${STATUS_LABEL[e.status]}</span>${suspended && !closed ? ' <span class="pill lost">Suspenso</span>' : ''}${e.featured ? ' <span class="pill void">Destaque</span>' : ''}${e.source && e.source !== 'manual' ? ' <span class="pill">Importado</span>' : ''}</div></div>
    ${e.source && e.source !== 'manual' ? `<div class="admin-actions">${e.source === 'winhouse' ? `<button type="button" class="ghost-btn btn-sm" data-action="winhouse-raw" data-id="${e.id}">Ver dados WinHouse</button>`
      : e.source !== 'bzzoiro' ? `<button type="button" class="ghost-btn btn-sm" data-action="provider-odds" data-id="${e.id}">Ver odds do fornecedor</button>` : ''}
      <button type="button" class="ghost-btn btn-sm" data-action="propline-odds" data-id="${e.id}">Ver odds PropLine</button></div><pre class="raw-odds hidden" id="rawOdds${e.id}"></pre>` : ''}
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
    ${ws.lastError && !ws.fatal ? `<p class="muted">Último aviso: ${esc(ws.lastError)}</p>` : ''}
    <p class="muted">Casa de apostas em jogo (odds_book): <strong>${esc(ws.bookmaker || 'nenhuma — só consenso')}</strong>${ws.bookDropped ? ` · recusada pelo fornecedor: ${esc(ws.bookDropped)}` : ''}</p>
    <p class="muted">Mensagens por tipo: ${esc(Object.entries(ws.frameTypes || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—')}</p>
    ${ws.oddsLog?.length ? `<div class="table-wrap"><table><thead><tr><th>Hora</th><th>Jogo</th><th>Placar</th><th>Fonte</th><th>1 / X / 2</th><th>Decisão</th></tr></thead><tbody>
      ${ws.oddsLog.map((o) => `<tr><td>${esc(fmtDateTime(o.at))}</td><td>${esc(o.match)}</td><td>${esc(o.score)} ${esc(o.clock || '')}</td><td>${esc(o.kind === 'odds_book' ? 'casa' : 'consenso')}</td><td>${esc(o.odds)}</td>
        <td><span class="pill ${o.decision === 'aberto' ? 'won' : 'lost'}">${esc(o.decision)}</span></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Ainda não chegaram odds em jogo.</p>'}<br>`;
}

function adminCasino(c) {
  const test = '<br><button class="primary-btn" data-action="casino-test">Testar ligação</button><div id="casinoTest"></div>';
  if (c.bigbang) {
    return `<div class="panel">
      <div class="section-head"><h2>Casino — BigBang</h2><span class="pill ${c.error ? 'lost' : 'won'}">${c.error ? 'Erro' : c.sandbox ? 'Sandbox (teste)' : 'Real'}</span></div>
      ${c.error ? `<div class="form-error">${esc(c.error)}</div>` : ''}
      <div class="stat-grid"><div class="stat"><small>Jogos</small><strong>${c.games}</strong></div><div class="stat"><small>Fornecedores</small><strong>${c.providers}</strong></div>
        <div class="stat"><small>Apostado (dinheiro real)</small><strong>${money(c.bets)}</strong></div><div class="stat"><small>Ganhos pagos</small><strong>${money(c.wins)}</strong></div>
        <div class="stat"><small>GGR</small><strong>${money(c.bets - c.wins)}</strong></div><div class="stat"><small>Ganhos de Free Spins pagos</small><strong>${money(c.freeSpinWins)}</strong></div></div>
      <h3>Quem fornece os jogos</h3>
      <div class="form-actions"><label class="adm-switch"><input type="checkbox" data-action="casino-split"${c.split ? ' checked' : ''}${c.palace?.configured ? '' : ' disabled'}>
        Slots pela Palace · jogos ao vivo pela BigBang</label>
        ${c.palace?.configured ? '<button class="ghost-btn btn-sm" data-action="palace-test">Testar Palace</button>' : ''}</div>
      <h4>Película "Comprar Rodadas Grátis"</h4>
      <p class="muted">Tapa o painel de compra de rodadas (e o de aposta dupla) com a arte original do jogo, como na Betclic. Por agora: Gates of Olympus, no computador.
        Experimente primeiro só para administradores (abra o jogo, o menu, as rodadas grátis) antes de ligar para todos.</p>
      <div class="form-actions"><label class="field adm-inline">Película <select data-action="casino-skins">
        ${[['off', 'Desligada'], ['admin', 'Só administradores (teste)'], ['all', 'Ligada para todos']].map(([v, t]) => `<option value="${v}"${(c.skins || 'off') === v ? ' selected' : ''}>${t}</option>`).join('')}
      </select></label></div>
      <p class="muted">${c.palace?.configured
    ? (c.split ? 'Ativo: os slots vêm da Palace (o saldo passa para a Palace enquanto o jogo está aberto e volta ao sair) e a BigBang fica só com as mesas ao vivo.' : 'Desligado: todos os jogos vêm da BigBang.')
    : `A Palace não está configurada: defina <strong>CASINO_API_URL</strong> ${c.palace?.urlSet ? '✔' : '✘'} e <strong>CASINO_API_TOKEN</strong> ${c.palace?.tokenSet ? '✔' : '✘'} no Railway.`}</p>
      <div id="palaceTest"></div>
      ${c.palace?.configured ? `<h4>Endereço de um jogo</h4>
      <p class="muted">Abre um jogo na Palace com a sua conta de administrador e mostra o endereço por onde ele abre (os códigos secretos ficam tapados). Serve para ver se o endereço traz a "jurisdição" que esconde "Comprar Rodadas Grátis" e o turbo.
        Escreva uma jurisdição (ex.: UK) para a pedir à Pragmatic e use "Abrir jogo" para ver se os botões desaparecem.</p>
      <div class="form-actions"><label class="field adm-inline">Jogo <input id="liName" value="Gates of Olympus" maxlength="80"></label>
        <label class="field adm-inline">Jurisdição <input id="liJur" placeholder="ex.: UK" maxlength="12" size="6"></label>
        <button class="ghost-btn btn-sm" data-action="launch-inspect">Ver endereço de um jogo</button>
        <button class="ghost-btn btn-sm" data-action="launch-open">Abrir jogo</button>
        <button class="ghost-btn btn-sm" data-action="launch-copy">Copiar resultado</button></div>
      <pre class="raw-odds hidden" id="liOut"></pre>` : ''}
      <div class="form-actions"><label class="adm-switch"><input type="checkbox" data-action="casino-premium"${c.premium ? ' checked' : ''}> Preferir as versões Premium (jogos originais do fornecedor)</label></div>
      <p class="muted">Quando o mesmo jogo existe nas duas versões: <b>Standard</b> é o motor próprio da BigBang (cópia, funciona em qualquer plano); <b>Premium</b> é o jogo original do fornecedor (precisa de saldo pré-pago na conta BigBang e paga uma % de GGR mais alta). Os Premium não têm modo demonstração.</p>
      <h3>Carteira integrada — URLs a configurar na chave (Painel BigBang)</h3>
      <div class="table-wrap"><table><tbody>
        <tr><td><strong>user_data</strong> (GET)</td><td><code>${esc(c.callbacks.userData)}</code></td></tr>
        <tr><td><strong>balance_change</strong> (POST)</td><td><code>${esc(c.callbacks.balanceChange)}</code></td></tr>
      </tbody></table></div>
      <p class="muted">O saldo nunca sai da Bet62: o BigBang pede o saldo e envia cada aposta/ganho assinados com a chave (HMAC), aplicados uma única vez por transação.
        ${c.sandbox ? 'Chave de teste (ek_test_): os jogos correm com saldo virtual e nenhum dinheiro real é movido.' : ''}
        Para mudar de chave (teste ↔ real) altere <strong>BIGBANG_API_KEY</strong> no Railway.</p>
      ${c.serverDelay ? `<h3>Rapidez do servidor (cada rodada passa por aqui 2 vezes)</h3>
        <div class="stat-grid"><div class="stat"><small>Atraso típico</small><strong>${c.serverDelay.p50} ms</strong></div>
          <div class="stat"><small>Atraso nos piores 1%</small><strong class="${c.serverDelay.p99 > 200 ? 'red' : ''}">${c.serverDelay.p99} ms</strong></div>
          <div class="stat"><small>Pior momento</small><strong class="${c.serverDelay.max > 1000 ? 'red' : ''}">${c.serverDelay.max} ms</strong></div></div>
        <p class="muted">Último minuto. Abaixo de ~100 ms nos piores 1% o servidor não atrasa os jogos; acima de 200 ms, os jogos podem encravar por espera do servidor (não do fornecedor).</p>` : ''}
      <h3>Últimas chamadas do BigBang à carteira</h3>
      ${c.calls?.length ? `<div class="table-wrap"><table><thead><tr><th>Hora</th><th>Chamada</th><th>Jogador</th><th>Estado</th><th>Detalhe</th></tr></thead><tbody>
        ${c.calls.map((x) => `<tr><td>${esc(fmtDateTime(x.at))}</td><td>${esc(x.kind)}</td><td><code>${esc(x.username)}</code></td><td><span class="pill ${x.status === 200 ? 'won' : 'lost'}">${x.status}</span></td><td>${esc(x.detail)}</td></tr>`).join('')}
      </tbody></table></div>`
        : '<div class="notice">Ainda não chegou nenhuma chamada desde o último arranque do servidor. Se um jogo diz "Insufficient Balance", o BigBang não está a chamar estes URLs: confirme no Painel BigBang que a chave está em <strong>carteira integrada (seamless)</strong> com os dois URLs acima.</div>'}
      ${test}</div>
    <form class="panel" data-form="casino-hidden"><h3>Jogos escondidos</h3>
      <p class="muted">Jogos que não aparecem no casino (lobby, pesquisa, fornecedores e "do mesmo estilo"). Um por linha: o nome do jogo como aparece no site, ou o ID (está no URL: #/casino/jogo/ID).</p>
      <div class="field"><textarea name="hidden" rows="5">${esc((c.hidden || []).join('\n'))}</textarea></div>
      <div class="form-actions"><button class="primary-btn">Guardar</button></div></form>`;
  }
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
  const lv = t.last?.live;
  const last = (f ? `última importação ${esc(fmtDateTime(f.at))} (${f.matches ?? f.games ?? 0} jogos, ${f.priced ?? 0} com odds)` : 'ainda não executado')
    + (lv && lv.liveOddsChecked !== undefined ? ` · ao vivo: ${lv.live ?? 0} jogos, ${lv.liveMarketsOpen ?? 0} com mercado aberto` : '');
  const badge = t.addonMissing ? '<span class="pill lost">Sem Sports Addon</span>' : t.lastError ? '<span class="pill lost">Erro</span>' : '<span class="pill won">Ligado</span>';
  const ws = t.liveSocket?.enabled
    ? ` · ao vivo por WebSocket: ${t.liveSocket.fatal ? `parado (${esc(t.liveSocket.fatal)})` : `${t.liveSocket.following} encontro(s) seguidos`}` : '';
  return `<h3>${esc(title)} ${badge}</h3>
    <p class="muted">${esc(what)} ${last}${ws}.</p>
    <p>Eventos: <strong>${esc(counts)}</strong></p>
    ${t.addonMissing ? '<div class="form-error">O token não tem o Sports Addon, necessário para este desporto.</div>' : t.lastError ? `<div class="form-error">Último erro (${esc(fmtDateTime(t.lastErrorAt))}): ${esc(t.lastError)}</div>` : ''}`;
}

function sportsAddonPanels(f) {
  const panels = [addonPanel('Ténis ATP/WTA', f.tennis, 'Odds de vencedor (pré-jogo e ao vivo), pontos ao vivo, H2H, previsões e ranking.')
    + (f.tennis?.liveSocket?.enabled ? liveSocketPanel(f.tennis.liveSocket).replace('WebSocket ao vivo', 'WebSocket ao vivo — ténis') : '')];
  const what = {
    basquetebol: 'Vencedor com prolongamento (pré-jogo e ao vivo), estatísticas por equipa e box score, previsões e classificação.',
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
         ${f.requestBudget ? `<p class="muted">Pedidos ao Bzzoiro no último minuto: <strong>${f.requestBudget.requestsLastMinute}</strong>${f.requestBudget.perMinute ? ` de ${f.requestBudget.perMinute}/min (BZZOIRO_MAX_RPM)` : ''}${f.requestBudget.pausedUntil ? ` · <span class="pill lost">em pausa até ${esc(fmtDateTime(f.requestBudget.pausedUntil))} (429)</span>` : ''}</p>` : ''}
         ${f.lastError ? `<div class="form-error">Último erro (${esc(fmtDateTime(f.lastErrorAt))}): ${esc(f.lastError)}</div>` : ''}
         <div class="table-wrap"><table><thead><tr><th>Sincronização</th><th>Última execução</th><th>Resultado</th></tr></thead><tbody>
           ${last('fixtures', 'Jogos e odds')}${last('live', 'Ao vivo')}${last('results', 'Resultados')}
         </tbody></table></div><br>
         ${liveSocketPanel(f.liveSocket)}
         ${sportsAddonPanels(f)}
         ${proplinePanel(f.propline)}
         <button class="primary-btn" data-action="feed-sync">Sincronizar agora</button>`
      : `<p class="muted">Bzzoiro desligado (sem <strong>BZZOIRO_API_TOKEN</strong>).</p>`}
  </div>
  <div class="panel">${maintenancePanel(f.maintenance, f.winhouse?.feed?.health?.state)}</div>
  ${f.winhouse?.feed?.health ? `<div class="panel">${winhouseHealthPanel(f.winhouse.feed.health)}</div>` : ''}
  <div class="panel">${winhousePanel(f.winhouse)}</div>
  <div class="panel"><h3>Emblemas das equipas</h3>
    <p class="muted">Logos oficiais do API-Football (chave <strong>API_FOOTBALL_KEY</strong>), guardados aqui de vez: as ligas principais vêm inteiras num pedido cada, e as outras equipas são procuradas pelo nome. Cores das camisolas do TheSportsDB.</p>
    <div class="form-actions"><button class="ghost-btn btn-sm" data-action="tl-check">Verificar logos</button>
      <button class="ghost-btn btn-sm" data-action="tl-run">Procurar logos agora</button></div><div id="tlCheck"></div></div>
  <div class="panel"><h3>Estatísticas GOAL API</h3>
    <p class="muted">H2H, classificação e últimos 5 jogos no separador Estatísticas dos jogos de futebol das ligas grandes e médias (só estatísticas, sem odds). Chave <strong>GOAL_API_KEY</strong> nas Variables do Railway; no máximo <strong>GOAL_API_DAILY</strong> pedidos por dia (900 por omissão; o plano grátis dá 1000). Os jogos ligam-se pelo nome das equipas e pela hora.</p>
    <div class="form-actions"><button class="ghost-btn btn-sm" data-action="ga-check">Verificar GOAL API</button>
      <button class="ghost-btn btn-sm" data-action="ga-refresh">Pedir de novo a lista de jogos</button></div><div id="gaCheck"></div></div>
  <div class="panel"><h3>Transmissões RapidAPI (teste) <span class="pill ${f.rapidStream ? 'won' : ''}">${f.rapidStream ? 'Ligado' : 'Desligado'}</span></h3>
    <p class="muted">${f.rapidStream ? 'Segunda fonte de vídeo do futebol ao vivo, em teste ao lado da TV da WinHouse (que não é alterada). Mostra que jogos a API tem agora, que servidores dá e quais dos nossos jogos ao vivo cobre. Só servidores HLS diretos em HTTPS tocam no browser.'
      : 'Defina nas Variables do Railway <strong>RAPIDAPI_KEY</strong> (a chave do RapidAPI), <strong>RAPIDAPI_STREAM_LIST_PATH</strong> (a rota da lista de jogos) e <strong>RAPIDAPI_STREAM_PATH</strong> (a rota de um jogo, com {id}) e faça redeploy. O host por omissão é football-live-stream-api.p.rapidapi.com (RAPIDAPI_STREAM_HOST para outro).'}</p>
    ${f.rapidKey ? `<div class="form-actions">${f.rapidStream ? `<button class="ghost-btn btn-sm" data-action="rapid-test">Testar transmissões</button>
      <button class="ghost-btn btn-sm" data-action="rapid-test" data-fresh="1">Testar (ler agora, gasta pedidos)</button>` : '<span class="muted">Chave definida; falta a rota da lista. Use "Chamar rota" para a encontrar.</span>'}
      <button class="ghost-btn btn-sm" data-action="rapid-copy">Copiar resultado</button></div>
      <div class="form-actions"><label class="field adm-inline">Rota da API <input id="rapidPath" value="/" placeholder="/link/{id do jogo}"></label>
        <button class="ghost-btn btn-sm" data-action="rapid-raw">Chamar rota</button></div>
      <p class="muted">Chama essa rota da API configurada (RAPIDAPI_STREAM_HOST) a partir do servidor e mostra a resposta tal como vem. Serve para conhecer uma API nova.</p>
      <pre class="raw-odds hidden" id="rapidOut"></pre>` : ''}</div>`;
}

function winhouseFeedInfo(fd) {
  if (!fd) return '';
  const ev = Object.entries(fd.events || {}).map(([k, v]) => `${STATUS_LABEL[k] || k}: ${v}`).join(' · ') || '—';
  const lv = fd.last?.live;
  const pm = fd.last?.prematch;
  const dt = fd.last?.details;
  const ld = fd.last?.liveDetails;
  const pu = fd.push;
  const ps = pu?.socket;
  const pushInfo = !pu ? '' : !ps ? 'desligadas (WINHOUSE_ODDS_PUSH=0)'
    : `${ps.connected ? '<span class="pill won">ligado</span>' : `<span class="pill lost">desligado${ps.closeCode ? ` (código ${ps.closeCode})` : ''}</span>`}
      ${ps.frames} pacotes, ${ps.coefs} mudanças recebidas · ${pu.matched} dos nossos jogos, ${pu.changed} aplicadas (${pu.suspended} suspensas) · ${pu.tracked} odds de ${pu.games} jogos seguidas${ps.lastFrameAt ? ` · último ${esc(fmtDateTime(ps.lastFrameAt))}` : ''}${ps.lastError ? ` · aviso: ${esc(ps.lastError)}` : ''}`;
  return `<p>Eventos: <strong>${esc(ev)}</strong>${fd.review ? ` · <span class="pill lost">${fd.review} para decidir em Liquidação</span>` : ''}</p>
    <p class="muted">Ao vivo: ${lv ? `${lv.live} jogos, ${lv.withOdds} com odds, ${lv.finished} terminados${lv.listedOver ? `, ${lv.listedOver} já acabados que a WinHouse ainda lista (fechados por nós)` : ''}, ${lv.review} para rever (${esc(fmtDateTime(lv.at))})` : 'ainda não lido'} ·
      Pré-jogo: ${pm ? `${pm.games} jogos, ${pm.created} novos, ${pm.priced} com odds${pm.listsFailed ? `, ${pm.listsFailed} lista(s) com erro` : ''} (${esc(fmtDateTime(pm.at))})` : 'ainda não lido'} ·
      Páginas dos jogos (todos os mercados): ${dt ? `${dt.read} lidas agora${dt.failed ? `, ${dt.failed} com erro` : ''}, ${dt.cached} de ${dt.window} jogos nas próximas horas (${esc(fmtDateTime(dt.at))})` : 'ainda não lidas'} ·
      Páginas ao vivo (todos os mercados em jogo): ${ld ? (ld.pausedUntil ? `<span class="pill lost">rota não encontrada (404) — pausa até ${esc(fmtDateTime(ld.pausedUntil))}</span>` : `${ld.read} lidas agora${ld.failed ? `, ${ld.failed} com erro` : ''} de ${ld.live} jogos com odds${ld.route ? ` via ${esc(ld.route)}` : ''} (${esc(fmtDateTime(ld.at))})`) : 'ainda não lidas'} ·
      ${pushInfo ? `Odds em tempo real: ${pushInfo} ·` : ''}
      Transmissões: ${fd.streams === false ? 'defina WINHOUSE_TENANT (a chave ifr_… do iframe) nas Variables' : fd.streams ? `${fd.streams.ids} jogos com vídeo, ${fd.streams.live} dos nossos ao vivo (${esc(fmtDateTime(fd.streams.at))})` : 'ainda não lidas'} ·
      Jogos futuros: ${fd.last?.future?.off || !fd.futureDays ? 'desligado' : fd.last?.future?.at ? `${fd.last.future.games} jogos até ${fd.futureDays} dias${fd.last.future.failed ? `, ${fd.last.future.failed} desporto(s) com erro` : ''}${futureUntil(fd.last.future)} (${esc(fmtDateTime(fd.last.future.at))}, de ${fd.futureMinutes} em ${fd.futureMinutes} min)` : `${fd.futureDays} dias — ainda não lidos`} ·
      ${fd.restored ? `Mercados repostos no arranque (reserva até a WinHouse responder): ${fd.restored.prematch} jogos pré-jogo, ${fd.restored.live} ao vivo ·` : ''}
      Fuso da WinHouse: ${fd.tzOffsetMinutes === null ? 'a estimar' : `UTC${fd.tzOffsetMinutes >= 0 ? '+' : ''}${fd.tzOffsetMinutes / 60} h (${esc(fd.tzOffsetSource || '')})`}</p>
    ${fd.lastError ? `<p class="muted">Último aviso (${esc(fmtDateTime(fd.lastErrorAt))}): ${esc(fd.lastError)}</p>` : ''}`;
}

/** The furthest game the future lists brought, per sport ("futebol até 30/10"). */
function futureUntil(f) {
  const parts = Object.entries(f.bySport || {}).filter(([, v]) => v.until).map(([k, v]) => `${k} até ${esc(new Date(v.until).toLocaleDateString('pt-PT'))}`);
  return parts.length ? ` — ${parts.join(', ')}` : '';
}

// Maintenance screen on the site: on/off, whole site or sports only, optional message.
function maintenancePanel(m, healthState) {
  if (!m) return '';
  const hint = !m.on && healthState === 'em_baixo' ? '<p class="pill lost">A WinHouse está em baixo — pode ativar a manutenção do desporto.</p>' : '';
  return `<h3>Ecrã de manutenção ${m.on ? `<span class="pill lost">Ativo desde ${esc(fmtDateTime(m.since))}</span>` : '<span class="pill">Desligado</span>'}</h3>
    ${hint}
    <p class="muted">Mostra aos jogadores um ecrã "Estamos em manutenção — Brevemente disponível". Enquanto está ativo, as apostas e o cash out ficam em pausa (e o casino também, se for o site todo). Os administradores continuam a ver o site normal. Aparece e desaparece no site em menos de 1 minuto.</p>
    <form id="maintForm" class="form-grid">
      <label class="field">Onde
        <select name="scope"><option value="sports"${m.scope !== 'all' ? ' selected' : ''}>Só desporto (o casino continua aberto)</option><option value="all"${m.scope === 'all' ? ' selected' : ''}>Site todo</option></select></label>
      <label class="field">Mensagem extra (opcional)
        <textarea name="message" rows="2" maxlength="300" placeholder="Ex.: Estamos a resolver um problema com os jogos ao vivo.">${esc(m.message || '')}</textarea></label>
    </form>
    <div class="form-actions">${m.on
      ? '<button class="ghost-btn btn-sm" data-action="maint-save" data-on="1">Guardar mensagem</button> <button class="primary-btn btn-sm" data-action="maint-save" data-on="0">Desligar manutenção</button>'
      : '<button class="primary-btn btn-sm" data-action="maint-save" data-on="1" data-confirm="1">Ativar manutenção</button>'}</div><br>`;
}

// Is WinHouse up: state now, availability, the last 24 h in 15-min slots and the outages of the week.
const WH_STATE = {
  online: ['won', '🟢 Online'], instavel: ['void', '🟡 Instável'], em_baixo: ['lost', '🔴 Em baixo'], sem_leituras: ['', '⚪ Sem leituras'],
};
const minutesAgo = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60_000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h ${m % 60} min`; };
const durationText = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
function winhouseHealthPanel(h) {
  if (!h) return '';
  const [cls, label] = WH_STATE[h.state] || WH_STATE.sem_leituras;
  const since = h.state === 'em_baixo' && h.since ? ` desde ${esc(fmtDateTime(h.since))} (${minutesAgo(h.since)})`
    : h.state === 'online' && h.since ? ` · última queda terminou ${minutesAgo(h.since)}` : '';
  const pct = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}%`);
  const cells = h.timeline.map((t) => `<i class="whh-${t.state}" title="${esc(fmtDateTime(t.at))}"></i>`).join('');
  const outages = h.outages.length
    ? `<div class="table-wrap"><table><thead><tr><th>Início</th><th>Fim</th><th>Duração</th><th>Erro</th></tr></thead><tbody>
      ${h.outages.map((o) => `<tr><td>${esc(fmtDateTime(o.startedAt))}</td><td>${o.endedAt ? esc(fmtDateTime(o.endedAt)) : '<span class="pill lost">ainda em baixo</span>'}</td>
        <td>${esc(durationText(o.minutes))}</td><td class="muted">${esc(o.error || '')}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Nenhuma queda nos últimos 7 dias.</p>';
  return `<h3>Estado da WinHouse <span class="pill ${cls}">${label}</span></h3>
    <p>${label}${since}</p>
    <p class="muted">Última resposta: ${h.lastOkAt ? `${esc(fmtDateTime(h.lastOkAt))} (${minutesAgo(h.lastOkAt)})` : '—'} ·
      tempo médio de resposta (1 h): ${h.avgMs !== null ? `${h.avgMs} ms` : '—'} ·
      disponível 24 h: <strong>${pct(h.uptime24h)}</strong> · 7 dias: <strong>${pct(h.uptime7d)}</strong>
      ${h.lastError ? `<br>Último erro (${esc(fmtDateTime(h.lastFailAt))}): ${esc(h.lastError)}` : ''}</p>
    <div class="whh-bar">${cells}</div>
    <div class="whh-ends"><span>há 24 h</span><span>agora</span></div>
    <div class="whh-legend"><span><i class="whh-ok"></i>a funcionar</span><span><i class="whh-partial"></i>com falhas</span><span><i class="whh-down"></i>em baixo</span><span><i class="whh-none"></i>sem leituras</span></div>
    <h4>Quedas (7 dias)</h4>${outages}
    <p class="muted">A leitura dos jogos ao vivo corre a cada 15 s; 3 falhas seguidas contam como queda, que termina na primeira resposta boa.</p><br>`;
}

function winhousePanel(w) {
  return `<h3>WinHouse ${w?.feed?.enabled ? '<span class="pill won">A importar</span>' : w?.enabled ? '<span class="pill won">Configurado</span>' : '<span class="pill">Desligado</span>'}</h3>
    ${winhouseFeedInfo(w?.feed)}
    <p class="muted">${w?.enabled ? 'Testar WinHouse: chama as 6 rotas e mostra o que respondem. Ver mercados do jogo / ao vivo: abre a página de um jogo (gameId, ou o 1.º da lista pré-jogo / ao vivo) e lista todos os mercados que oferece. Ver tracker: mostra o que o tracker do jogo devolve (gameId, ou o 1.º jogo de futebol ao vivo) — copie e envie para os ligarmos. Ver vídeo (HLS): o que a WinHouse responde ao pedido do vídeo (gameId, ou o 1.º jogo ao vivo com transmissão) e o endereço .m3u8 montado.'
      : 'Defina <strong>WINHOUSE_BASE_URL</strong> nas variáveis do servidor (Railway → Variables) e faça redeploy.'}</p>
    ${w?.feed?.enabled ? `<div class="form-actions"><label class="field adm-inline">Jogos futuros (dias, 0–90) <input id="whFutureDays" type="number" min="0" max="90" step="1" value="${Number(w.feed.futureDays) || 0}"></label>
      <button class="ghost-btn btn-sm" data-action="winhouse-future">Guardar</button>
      <button class="ghost-btn btn-sm" data-action="winhouse-future" data-now="1">Guardar e buscar agora</button></div>
      <p class="muted">Lê a lista completa de cada desporto na WinHouse (como o próprio livro) e importa os jogos até esse número de dias; o site mostra-os no Desporto e nas ligas. 0 = só as listas curtas (próximas 24 h, ligas principais).</p>` : ''}
    ${w?.enabled ? `<div class="form-actions"><label class="field adm-inline">gameId (opcional) <input id="whGame" inputmode="numeric" maxlength="15"></label>
      <button class="ghost-btn btn-sm" data-action="winhouse-health">Testar WinHouse</button>
      <button class="ghost-btn btn-sm" data-action="winhouse-markets">Ver mercados do jogo</button>
      <button class="ghost-btn btn-sm" data-action="winhouse-markets" data-live="1">Ver mercados ao vivo</button>
      <button class="ghost-btn btn-sm" data-action="winhouse-tracker">Ver tracker</button>
      <button class="ghost-btn btn-sm" data-action="winhouse-video">Ver vídeo (HLS)</button>
      <button class="ghost-btn btn-sm" data-action="winhouse-discover">Descobrir rotas</button>
      <button class="ghost-btn btn-sm" data-action="winhouse-copy">Copiar resultado</button></div>
      <pre class="raw-odds hidden" id="whOut"></pre>` : ''}
    ${w?.enabled ? `<h4>Revisão VAR na WinHouse</h4>${w.varSeen?.length
    ? `<p>✅ A WinHouse já enviou VAR (${w.varSeen.length} exemplo(s)). Copie e envie para o ligarmos ao minicampo:</p><pre class="raw-odds">${esc(JSON.stringify(w.varSeen, null, 2))}</pre>`
    : '<p class="muted">Ainda nenhum tracker da WinHouse mencionou VAR. O servidor está atento a todos os jogos de futebol ao vivo e guarda aqui o primeiro que aparecer. "Descobrir rotas" também procura VAR na documentação e nos scripts da WinHouse (campo varHits).</p>'}` : ''}<br>`;
}

function proplinePanel(p) {
  if (!p?.enabled) {
    return `<h3>PropLine — 2.ª fonte de odds <span class="pill">Desligado</span></h3>
      <p class="muted">Defina <strong>PROPLINE_API_KEY</strong> nas variáveis do servidor (Railway → Variables) e faça redeploy.
      Só traz odds para os mercados que o Bzzoiro não tem; jogos, placares, estatísticas e liquidação continuam no Bzzoiro.</p><br>`;
  }
  const badge = p.stopped ? `<span class="pill lost">Parado — ${esc(p.stopped)}</span>`
    : p.pausedUntil ? `<span class="pill lost">Em pausa até ${esc(fmtDateTime(p.pausedUntil))}</span>` : '<span class="pill won">Ligado</span>';
  const q = p.quota ? `${p.quota.remaining} de ${p.quota.limit} pedidos restantes hoje (fornecedor)` : `${p.usedToday} de ${p.dailyBudget} pedidos usados hoje`;
  return `<h3>PropLine — 2.ª fonte de odds ${badge}</h3>
    <p class="muted">Só preenche mercados que o Bzzoiro não tem. Pré-jogo de ${Math.round(p.prematchEverySeconds / 60)} em ${Math.round(p.prematchEverySeconds / 60)} min;
      ao vivo ${p.liveEverySeconds ? `a cada ${p.liveEverySeconds} s, só com casas que cotam em jogo e depois do último golo` : 'desligado'}.</p>
    <p>${esc(q)} · jogos associados: <strong>${p.linked}</strong> · odds ativas da PropLine: <strong>${p.selections}</strong>
      ${p.live ? ` · ao vivo: ${p.live.open}/${p.live.checked} com preço (${esc(fmtDateTime(p.live.at))})` : ''}</p>
    ${p.lastError ? `<p class="muted">Último aviso (${esc(fmtDateTime(p.lastErrorAt))}): ${esc(p.lastError)}</p>` : ''}
    <div class="table-wrap"><table><thead><tr><th>Competição</th><th>Última leitura</th><th>Jogos</th><th>Associados</th><th>Com odds</th></tr></thead><tbody>
      ${p.sports.map((x) => `<tr><td>${esc(x.key)}</td><td>${x.at ? esc(fmtDateTime(x.at)) : '—'}</td><td>${x.games ?? '—'}</td><td>${x.matched ?? '—'}</td>
        <td>${x.error ? `<span class="pill lost">${esc(x.error)}</span>` : x.priced ?? '—'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="form-actions"><button class="ghost-btn btn-sm" data-action="propline-sync">Ler PropLine agora</button></div><br>`;
}

function adminSettlement({ summary: s, queue, history }) {
  const SOURCE = { feed: 'Dados ao vivo', admin: 'Administrador', engine: 'Automático' };
  const stats = [
    ['Apostas em aberto', `${s.openBets} · ${money(s.openStake)}`], ['Responsabilidade máxima', money(s.maxLiability)],
    ['Liquidadas hoje', `${s.settledToday} · ${money(s.stakesSettledToday)}`], ['Pago hoje', money(s.paidToday)],
    ['Margem hoje', money(s.marginToday)],
  ].map(([l, v]) => `<div class="stat"><small>${l}</small><strong>${esc(v)}</strong></div>`).join('');
  const specialHtml = (e) => `<div class="admin-event">
      <div class="admin-event-head"><div><strong>${esc(e.home)} vs ${esc(e.away)}</strong><div class="muted">${esc(e.competition)} · ${esc(fmtDateTime(e.startTime))}</div></div>
        <div><span class="pill ${e.status}">${STATUS_LABEL[e.status] || e.status}</span></div></div>
      <p class="muted">${esc(e.reason)}. Os outros mercados (cantos, combinados, tempos de golo…) não se liquidam sozinhos: decida cada seleção.</p>
      <div class="table-wrap"><table><thead><tr><th>Mercado</th><th>Seleção</th><th class="num">Apostas</th><th class="num">Apostado</th><th></th></tr></thead><tbody>
      ${e.specials.map((x) => `<tr><td>${esc(x.group)}</td><td>${esc(x.label)}</td><td class="num">${x.bets}</td><td class="num">${money(x.stake)}</td>
        <td class="admin-actions">${[['won', 'Ganha', 'primary-btn'], ['lost', 'Perdida', 'ghost-btn'], ['void', 'Anulada', 'ghost-btn']].map(([r, l, c]) =>
          `<button class="${c} btn-sm" data-action="special-settle" data-id="${e.id}" data-code="${esc(x.code)}" data-result="${r}" data-label="${esc(`${x.group}: ${x.label}`)}">${l}</button>`).join(' ')}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  const queueHtml = queue.length ? queue.map((e) => e.specials?.length ? specialHtml(e) : `<form class="admin-event" data-form="settle-queue" data-id="${e.id}">
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
      <p class="muted">Todos os mercados (1X2, dupla hipótese, empate anula, mais/menos golos e ambas marcam) são liquidados pelo resultado do tempo regulamentar assim que o jogo termina. Jogos cancelados são anulados (odd 1.00); jogos adiados sem nova data são anulados após ${s.postponedVoidHours} h. Um bilhete nunca fica preso: o que continuar em aberto ${s.noResultVoidHours ?? 72} h depois do início do jogo (sem resultado do fornecedor ou mercado por decidir) é anulado e a aposta devolvida. ${esc(last)}</p>
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


// ---------- forms ----------

const handlers = {
  async 'cashout-config'(form) {
    const d = formData(form);
    const body = { enabled: form.enabled.checked, prematch: form.prematch.checked, live: form.live.checked };
    for (const k of ['factor', 'minAgeSeconds', 'liveDelaySeconds', 'goalLockSeconds', 'minValue', 'maxValue']) body[k] = d[k] === '' ? null : Number(d[k]);
    await api('/api/admin/cashout', { method: 'PUT', body });
    toast('Guardado', 'Regras do cash out atualizadas.');
    loadTab();
  },
  async 'aff-config'(form) {
    const d = formData(form);
    const config = { enabled: !!form.enabled.checked, autoPayout: !!form.autoPayout.checked, countDemoDeposits: !!form.countDemoDeposits.checked };
    for (const [k] of AFF_FIELDS) config[k] = Number(d[k]);
    await api('/api/admin/affiliates/config', { method: 'PUT', body: { config, reason: d.reason } });
    toast('Feito', 'Configuração dos afiliados guardada (registada na auditoria).');
    loadTab();
  },
  async 'aff-search'(form) { state.affQ = formData(form).q || ''; loadTab(); },
  async 'user-balance'(form) {
    const d = formData(form);
    await api(`/api/admin/users/${form.dataset.id}/balance`, { method: 'POST', body: { op: d.op, amount: d.amount, note: d.note } });
    closeAdminModal();
    toast('Feito', 'Saldo atualizado.');
    loadTab();
  },
  async 'user-freebet'(form) {
    const d = formData(form);
    await api(`/api/admin/users/${form.dataset.id}/freebet`, { method: 'POST', body: { amount: d.amount, days: Number(d.days) || 7, note: d.note } });
    closeAdminModal();
    toast('Feito', 'FreeBet atribuída.');
    loadTab();
  },
  async 'user-spins'(form) {
    const d = formData(form);
    if (!amGames.length) throw new Error('Escolha pelo menos um jogo para as Free Spins.');
    const r = await api(`/api/admin/users/${form.dataset.id}/free-spins`, { method: 'POST', body: { spins: Number(d.spins), spinValue: d.spinValue, days: Number(d.days) || 7, note: d.note, games: amGames.map((g) => g.id) } });
    closeAdminModal();
    toast('Feito', `${r.freeSpins.spins} Free Spins atribuídas.`);
    loadTab();
  },
  async 'promo-config'(form) {
    const body = { general: { requireKyc: false, methods: [] } };
    for (const el of form.elements) {
      if (!el.name || !el.name.includes('.')) continue;
      const [camp, key] = el.name.split('.');
      body[camp] ||= {};
      if (key === 'methods') { if (el.checked) body.general.methods.push(el.value); continue; }
      if (el.type === 'checkbox') body[camp][key] = el.checked;
      else if (el.type === 'datetime-local') body[camp][key] = el.value ? new Date(el.value).toISOString() : null;
      else if (key === 'spinValue') body[camp][key] = Number(el.value);
      else if (el.tagName === 'SELECT' || key === 'tiers' || key === 'games') body[camp][key] = el.value;
      else body[camp][key] = el.value === '' ? null : Number(el.value);
    }
    await api('/api/admin/promotions/config', { method: 'PUT', body });
    toast('Guardado', 'Configuração das promoções atualizada.');
    loadTab();
  },
  async login(form) {
    const d = formData(form);
    const box = $('.form-error', form);
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { email: d.email, password: d.password } });
      if (user.role !== 'admin') {
        await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
        throw new Error('Esta conta não é de administrador.');
      }
      // The session lives in a cookie: if the browser did not keep it, say so instead of looping.
      const me = await api('/api/me').catch(() => ({ user: null }));
      if (!me.user) throw new Error('Palavra-passe correta, mas o navegador não guardou a sessão. Ative os cookies para este site (ou saia do modo privado) e tente de novo.');
      state.user = user;
      go(location.hash.slice(1) || 'painel');
    } catch (err) {
      box.textContent = err.message;
      box.classList.remove('hidden');
    }
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
    loadTab();
  },
  async 'casino-hidden'(form) {
    const r = await api('/api/admin/casino/hidden', { method: 'POST', body: { hidden: form.hidden.value } });
    toast('Jogos escondidos guardados', `${r.hidden.length} jogo(s)`);
    loadTab();
  },
  async 'tg-tickets'(form) {
    const d = formData(form);
    await api('/api/admin/telegram/tickets/config', { method: 'POST', body: { on: form.on.checked, times: d.times, legs: d.legs, minOdds: d.minOdds, maxOdds: d.maxOdds, stake: d.stake, hours: d.hours } });
    toast('Bilhetes sugeridos guardados');
    loadTab();
  },
  async campaign(form) {
    const n = Number(form.dataset.count || 0);
    if (!n) {
      toast('Ninguém para receber', 'Nenhum jogador deste público aceitou promoções por este canal. Os jogadores aceitam no aviso do site, no registo ou em Perfil → Preferências.', 'error');
      return;
    }
    if (!confirm(`Enviar esta campanha a ${n} jogador(es)? Não pode ser anulada.`)) return;
    const r = await api('/api/admin/campaigns', { method: 'POST', body: campaignBody(form) });
    toast('Campanha a ser enviada', `${r.total} destinatário(s). Os números atualizam na lista.`);
    loadTab();
  },
  async 'tg-post'(form) {
    const d = formData(form);
    await api('/api/admin/telegram/posts', { method: 'POST', body: { type: d.type, title: d.title, body: d.body, ctaText: d.ctaText, ctaUrl: d.ctaUrl } });
    toast('Publicado no Telegram');
    loadTab();
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
    go('eventos');
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
    loadTab();
  },
};

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = handlers[form.dataset.form];
  if (!fn) return;
  const btn = e.submitter;
  if (btn) btn.disabled = true;
  try { await fn(form, btn); } catch (err) { toast('Erro', err.message, 'error'); }
  if (btn) btn.disabled = false;
});

document.addEventListener('click', async (e) => {
  const tabEl = e.target.closest('[data-tab]');
  if (tabEl) { $('.adm')?.classList.remove('menu-open'); go(tabEl.dataset.tab); return; }
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'open-menu') { $('.adm')?.classList.add('menu-open'); return; }
  if (action === 'close-menu') { $('.adm')?.classList.remove('menu-open'); return; }
  if (action === 'refresh') { loadTab(); return; }
  if (action === 'user-detail') { state.userDetail = Number(actionEl.dataset.id); loadTab(); return; }
  if (action === 'user-back') { state.userDetail = null; loadTab(); return; }
  if (action.startsWith('skin-')) { skinAction(action, actionEl); return; }
  if (action === 'user-balance') { balanceModal(actionEl.dataset); return; }
  if (action === 'user-freebet') { giftModal(actionEl.dataset); return; }
  if (action === 'am-close') { closeAdminModal(); return; }
  if (action === 'tl-check' || action === 'tl-run') {
    actionEl.disabled = true;
    try {
      if (action === 'tl-run') {
        const r = await api('/api/admin/team-logos/run', { method: 'POST', body: {} });
        toast('Procura feita', `${r.asked} equipa(s) procurada(s), ${r.found} logo(s) novo(s).`);
      }
      const { steps } = await api('/api/admin/team-logos/check', { method: 'POST', body: {} });
      $('#tlCheck').innerHTML = `<div class="table-wrap"><table><tbody>${steps.map((x) => `<tr><td>${x.ok ? '✅' : '❌'} ${esc(x.name)}</td><td>${esc(x.detail || '')}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
    return;
  }
  if (action === 'maint-save') {
    const on = actionEl.dataset.on === '1';
    const form = $('#maintForm');
    if (actionEl.dataset.confirm && !confirm(`Ativar o ecrã de manutenção (${form.scope.value === 'all' ? 'site todo' : 'só desporto'})? As apostas ficam em pausa.`)) return;
    actionEl.disabled = true;
    try {
      await api('/api/admin/maintenance', { method: 'PUT', body: { on, scope: form.scope.value, message: form.message.value } });
      toast('Manutenção', on ? 'Ecrã de manutenção ativo.' : 'Manutenção desligada: o site voltou ao normal.');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); actionEl.disabled = false; }
    return;
  }
  if (action === 'ga-check' || action === 'ga-refresh') {
    actionEl.disabled = true;
    try {
      if (action === 'ga-refresh') await api('/api/admin/goal-api/refresh', { method: 'POST', body: {} });
      const { steps } = await api('/api/admin/goal-api/check', { method: 'POST', body: {} });
      $('#gaCheck').innerHTML = `<div class="table-wrap"><table><tbody>${steps.map((x) => `<tr><td>${x.ok ? '✅' : '❌'} ${esc(x.name)}</td><td>${esc(x.detail || '')}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
    return;
  }
  if (action === 'cp-check') {
    actionEl.disabled = true;
    try {
      const { steps } = await api('/api/admin/campaigns/check', { method: 'POST', body: {} });
      $('#cpCheck').innerHTML = `<div class="table-wrap"><table><tbody>${steps.map((x) => `<tr><td>${x.ok ? '✅' : '❌'} ${esc(x.name)}</td><td>${esc(x.detail || '')}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
    return;
  }
  if (action === 'cp-test') {
    actionEl.disabled = true;
    try {
      const form = actionEl.closest('form');
      await api('/api/admin/campaigns/test', { method: 'POST', body: campaignBody(form) });
      toast('Teste enviado', form.channel.value === 'sms' ? 'Veja o SMS no telemóvel.' : `Veja a caixa de ${state.user.email}.`);
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
    return;
  }
  if (action === 'am-op') {
    const form = actionEl.closest('form');
    form.op.value = actionEl.dataset.op;
    form.querySelectorAll('.am-op').forEach((b) => b.classList.toggle('on', b === actionEl));
    form.amount.placeholder = actionEl.dataset.op === 'set' ? 'Novo saldo em €' : 'Valor em €';
    return;
  }
  if (action === 'am-tab') {
    const box = actionEl.closest('.adm-modal');
    box.querySelectorAll('.am-tab').forEach((b) => b.classList.toggle('on', b === actionEl));
    box.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== actionEl.dataset.tab; });
    return;
  }

  if (action === 'user-ban') {
    const banned = actionEl.dataset.banned !== '1';
    if (!confirm(banned ? `Banir ${actionEl.dataset.name}? A conta deixa de entrar no site.` : `Desbanir ${actionEl.dataset.name}?`)) return;
    try {
      await api(`/api/admin/users/${actionEl.dataset.id}/ban`, { method: 'POST', body: { banned } });
      toast('Feito', banned ? 'Conta banida.' : 'Conta desbanida.');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (action.startsWith('aff-')) {
    const id = actionEl.dataset.id;
    try {
      if (action === 'aff-recover') {
        const r = await api('/api/admin/affiliates/recover', { method: 'POST', body: {} });
        toast('Feito', `${r.created} comissão(ões) recuperada(s).`);
      } else if (action === 'aff-status') {
        const status = actionEl.dataset.status;
        const reason = prompt(`Motivo (${({ active: 'reativar', suspended: 'suspender', blocked: 'bloquear' })[status]} o afiliado; fica na auditoria):`);
        if (!reason?.trim()) return;
        await api(`/api/admin/affiliates/${id}/status`, { method: 'POST', body: { status, reason } });
        toast('Feito', 'Estado do afiliado atualizado.');
      } else if (action === 'aff-review') {
        const decision = actionEl.dataset.decision;
        const reason = decision === 'approve' ? (prompt('Nota da aprovação (opcional):') ?? null) : prompt('Motivo (obrigatório):');
        if (reason === null || (decision !== 'approve' && !reason.trim())) return;
        await api(`/api/admin/affiliates/commissions/${id}/review`, { method: 'POST', body: { decision, reason } });
        toast('Feito', 'Comissão atualizada.');
      } else if (action === 'aff-pay') {
        if (!confirm('Pagar esta comissão na carteira do afiliado? Fica um movimento no extrato.')) return;
        await api(`/api/admin/affiliates/commissions/${id}/payout`, { method: 'POST', body: {} });
        toast('Feito', 'Comissão paga.');
      } else if (action === 'aff-reverse') {
        const reason = prompt('Motivo da reversão (ex.: chargeback do depósito de origem):');
        if (!reason?.trim()) return;
        await api(`/api/admin/affiliates/commissions/${id}/reverse`, { method: 'POST', body: { reason } });
        toast('Feito', 'Comissão revertida.');
      }
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (action === 'am-game-add') {
    const id = Number(actionEl.dataset.id);
    if (!amGames.some((g) => g.id === id)) amGames.push({ id, name: actionEl.dataset.name });
    amRenderGames();
    $('#amGameResults').innerHTML = '';
    $('#amGameSearch').value = '';
    return;
  }
  if (action === 'am-game-remove') {
    amGames = amGames.filter((g) => g.id !== Number(actionEl.dataset.id));
    amRenderGames();
    return;
  }
  if (action === 'fs-game-add') {
    const id = actionEl.dataset.id;
    const tokens = fsTokens();
    if (!tokens.some(([x]) => x === id)) {
      fsWrite([...tokens, [id]]);
      const chips = $('#fsChips');
      if (!chips.querySelector('.fs-chip')) chips.innerHTML = '';
      chips.insertAdjacentHTML('beforeend', fsChip(id, actionEl.dataset.name));
    }
    $('#fsGameResults').innerHTML = '';
    $('#fsGameSearch').value = '';
    return;
  }
  if (action === 'fs-game-remove') {
    const id = actionEl.dataset.id;
    fsWrite(fsTokens().filter(([x]) => x !== id));
    actionEl.closest('.fs-chip')?.remove();
    return;
  }
  if (action === 'bonus-cancel') {
    const reason = prompt('Motivo do cancelamento (fica registado; ex.: fraude confirmada, conta duplicada, violação dos termos):');
    if (reason === null) return;
    try {
      await api(`/api/admin/bonuses/${actionEl.dataset.id}/cancel`, { method: 'POST', body: { reason: reason.trim() } });
      toast('Feito', 'Bónus cancelado (só o saldo de bónus foi removido).');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (action === 'freebet-cancel') {
    if (!confirm('Cancelar esta free bet?')) return;
    try {
      await api(`/api/admin/freebets/${actionEl.dataset.id}/cancel`, { method: 'POST', body: {} });
      toast('Feito', 'Free bet cancelada.');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (action === 'promo-block') {
    const blocked = actionEl.dataset.blocked === '1';
    const reason = blocked ? prompt('Motivo (ex.: abuso promocional, conta duplicada):') : '';
    if (reason === null) return;
    try {
      await api(`/api/admin/users/${actionEl.dataset.id}/promo-block`, { method: 'POST', body: { blocked, reason } });
      toast('Feito', blocked ? 'Promoções bloqueadas e as ativas canceladas.' : 'Promoções desbloqueadas.');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (action === 'kyc-account') {
    const ok = actionEl.dataset.status === 'approved';
    if (!confirm(ok ? 'Aprovar a verificação de identidade desta conta? Os levantamentos ficam desbloqueados (se tiver vencido uma aposta).' : 'Rejeitar a verificação desta conta? O jogador terá de enviar novos documentos.')) return;
    try {
      await api(`/api/admin/users/${actionEl.dataset.id}/kyc`, { method: 'POST', body: { status: actionEl.dataset.status } });
      toast('Feito', ok ? 'Conta verificada.' : 'Verificação rejeitada.');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (action === 'kyc-doc') {
    try {
      await api(`/api/admin/kyc/${actionEl.dataset.doc}`, { method: 'POST', body: { status: actionEl.dataset.status } });
      toast('Feito', actionEl.dataset.status === 'approved' ? 'Documento validado.' : 'Documento rejeitado.');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (action === 'logout') {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    state.user = null;
    render();
    return;
  }
  if (action === 'catalog-run') {
    actionEl.disabled = true;
    actionEl.textContent = 'A consultar… (pode demorar 1–2 min)';
    try {
      const sample = Number($('#catSample')?.value) || 12;
      const { catalog } = await api('/api/admin/market-catalog/run', { method: 'POST', body: { sample, sport: catalogSport || null } });
      $('#adminMain').innerHTML = marketCatalog({ catalog, running: false });
    } catch (err) { toast('Erro', err.message, 'error'); actionEl.disabled = false; }
    return;
  }
  if (action === 'catalog-copy') {
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastCatalog, null, 1));
      toast('Copiado', 'Cole o resultado na conversa.');
    } catch { toast('Erro', 'Não foi possível copiar automaticamente.', 'error'); }
    return;
  }
  if (action === 'casino-test') {
    actionEl.disabled = true;
    actionEl.textContent = 'A testar…';
    try {
      const { steps } = await api('/api/admin/casino/test', { method: 'POST', body: {} });
      $('#casinoTest').innerHTML = `<br><div class="table-wrap"><table><tbody>${steps.map((s) =>
        `<tr><td>${s.ok ? '✅' : '❌'}</td><td><strong>${esc(s.name)}</strong></td><td>${esc(s.detail)}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
    actionEl.textContent = 'Testar ligação';
  } else if (action === 'settlement-run') {
    actionEl.disabled = true;
    try {
      const { result } = await api('/api/admin/settlement/run', { method: 'POST', body: {} });
      toast('Liquidação executada', `${result.settled} evento(s) liquidado(s), ${result.voided} anulado(s).`);
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'provider-odds') {
    const box = $(`#rawOdds${actionEl.dataset.id}`);
    try {
      const r = await api(`/api/admin/events/${actionEl.dataset.id}/provider-odds`);
      box.textContent = `Estado: ${r.status} · mercado ao vivo aberto desde: ${r.liveOddsAt || '—'}\n\n${r.raw}`;
      box.classList.remove('hidden');
    } catch (err) { toast('Erro', err.message, 'error'); }
  } else if (action === 'winhouse-raw') {
    const box = $(`#rawOdds${actionEl.dataset.id}`);
    actionEl.disabled = true;
    try {
      const r = await api(`/api/admin/events/${actionEl.dataset.id}/winhouse-raw`);
      box.textContent = r.raw;
      box.classList.remove('hidden');
      try { await navigator.clipboard.writeText(r.raw); toast('Dados WinHouse copiados', 'Cole-os na conversa.'); } catch { /* the text stays on screen to copy */ }
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
  } else if (action === 'winhouse-future') {
    const days = Number($('#whFutureDays')?.value);
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/winhouse/future', { method: 'POST', body: { days, now: actionEl.dataset.now === '1' } });
      const f = r.future;
      toast(actionEl.dataset.now === '1' && f?.at ? `Jogos futuros: ${f.games} jogos até ${r.futureDays} dias` : `Guardado: ${r.futureDays} dias`);
      render();
    } catch (err) { toast('Erro', err.message, 'error'); } finally { actionEl.disabled = false; }
  } else if (action === 'winhouse-health') {
    const box = $('#whOut');
    actionEl.disabled = true;
    actionEl.textContent = 'A testar…';
    try {
      const r = await api('/api/admin/winhouse/health', { method: 'POST', body: { gameId: $('#whGame')?.value.trim() || null } });
      box.textContent = JSON.stringify(r, null, 2);
      box.classList.remove('hidden');
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
    actionEl.textContent = 'Testar WinHouse';
  } else if (action === 'winhouse-markets') {
    const box = $('#whOut');
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/winhouse/markets', { method: 'POST', body: { gameId: $('#whGame')?.value.trim() || null, live: actionEl.dataset.live === '1' } });
      box.textContent = JSON.stringify(r, null, 2);
      box.classList.remove('hidden');
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
  } else if (action === 'winhouse-discover') {
    const box = $('#whOut');
    actionEl.disabled = true;
    actionEl.textContent = 'A procurar…';
    try {
      const r = await api('/api/admin/winhouse/discover', { method: 'POST', body: { gameId: $('#whGame')?.value.trim() || null } });
      box.textContent = JSON.stringify(r, null, 2);
      box.classList.remove('hidden');
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
    actionEl.textContent = 'Descobrir rotas';
  } else if (action === 'winhouse-video') {
    const box = $('#whOut');
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/winhouse/video', { method: 'POST', body: { gameId: $('#whGame')?.value.trim() || null } });
      box.textContent = JSON.stringify(r, null, 2);
      box.classList.remove('hidden');
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
  } else if (action === 'winhouse-tracker') {
    const box = $('#whOut');
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/winhouse/tracker', { method: 'POST', body: { gameId: $('#whGame')?.value.trim() || null } });
      box.textContent = JSON.stringify(r, null, 2);
      box.classList.remove('hidden');
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
  } else if (action === 'special-settle') {
    const word = { won: 'GANHA', lost: 'PERDIDA', void: 'ANULADA' }[actionEl.dataset.result];
    if (!confirm(`Marcar "${actionEl.dataset.label}" como ${word} e liquidar as apostas nessa seleção?`)) return;
    actionEl.disabled = true;
    try {
      const r = await api(`/api/admin/events/${actionEl.dataset.id}/special`, { method: 'POST', body: { code: actionEl.dataset.code, result: actionEl.dataset.result } });
      toast('Seleção liquidada', `${r.settledBets} aposta(s) processada(s).`);
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); actionEl.disabled = false; }
  } else if (action === 'rapid-test') {
    const box = $('#rapidOut');
    box.classList.remove('hidden');
    box.textContent = 'A consultar…';
    try { box.textContent = JSON.stringify(await api(`/api/admin/rapidstream${actionEl.dataset.fresh ? '?fresh=1' : ''}`), null, 2); } catch (err) { box.textContent = err.message; }
  } else if (action === 'rapid-raw') {
    const box = $('#rapidOut');
    box.classList.remove('hidden');
    box.textContent = 'A chamar…';
    try { box.textContent = JSON.stringify(await api(`/api/admin/rapidstream/raw?path=${encodeURIComponent($('#rapidPath').value || '/')}`), null, 2); } catch (err) { box.textContent = err.message; }
  } else if (action === 'rapid-copy') {
    try { await navigator.clipboard.writeText($('#rapidOut')?.textContent || ''); toast('Copiado'); } catch { toast('Erro', 'Não foi possível copiar automaticamente.', 'error'); }
  } else if (action === 'winhouse-copy') {
    try { await navigator.clipboard.writeText($('#whOut')?.textContent || ''); toast('Copiado'); } catch { toast('Erro', 'Não foi possível copiar automaticamente.', 'error'); }
  } else if (action === 'propline-odds') {
    const box = $(`#rawOdds${actionEl.dataset.id}`);
    try {
      const r = await api(`/api/admin/events/${actionEl.dataset.id}/propline-odds`);
      box.textContent = r.raw;
      box.classList.remove('hidden');
    } catch (err) { toast('Erro', err.message, 'error'); }
  } else if (action === 'propline-sync') {
    actionEl.disabled = true;
    try {
      await api('/api/admin/propline/sync', { method: 'POST', body: {} });
      toast('PropLine lido');
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'feed-sync') {
    actionEl.disabled = true;
    actionEl.textContent = 'A sincronizar…';
    try {
      await api('/api/admin/feed/sync', { method: 'POST', body: {} });
      toast('Sincronização concluída');
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'casino-split') {
    const on = actionEl.checked;
    if (on && !confirm('Passar os slots para a Palace? A BigBang fica só com os jogos ao vivo.')) { actionEl.checked = false; return; }
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/casino/mode', { method: 'POST', body: { split: on } });
      toast(on ? 'Slots pela Palace' : 'Tudo pela BigBang', `${r.games} jogos no casino${r.error ? ` · ${r.error}` : ''}`);
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'casino-premium') {
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/casino/premium', { method: 'POST', body: { on: actionEl.checked } });
      toast(r.premium ? 'Versões Premium (originais)' : 'Versões Standard', `${r.premiumGames} jogos Premium de ${r.games}`);
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'launch-inspect') {
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/casino/launch-inspect', { method: 'POST', body: { name: $('#liName').value, jurisdiction: $('#liJur').value } });
      const out = $('#liOut');
      out.textContent = JSON.stringify(r, null, 2);
      out.classList.remove('hidden');
      toast(r.jurisdiction.length ? `Jurisdição no endereço: ${r.jurisdiction.join(', ')}` : 'Sem jurisdição no endereço', r.game.name);
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
  } else if (action === 'launch-open') {
    if (!$('#liJur').value.trim()) return toast('Jurisdição', 'Escreva a jurisdição a testar (ex.: UK).', 'error');
    const tab = window.open('about:blank', '_blank');
    try {
      const r = await api('/api/admin/casino/launch-inspect', { method: 'POST', body: { name: $('#liName').value, jurisdiction: $('#liJur').value, open: true } });
      if (!r.openUrl) throw new Error(r.error || 'A Pragmatic não devolveu o endereço do jogo.');
      if (tab) tab.location = r.openUrl; else window.location.assign(r.openUrl);
    } catch (err) { tab?.close(); toast('Erro', err.message, 'error'); }
  } else if (action === 'launch-copy') {
    const t = $('#liOut')?.textContent || '';
    if (t) { try { await navigator.clipboard.writeText(t); toast('Copiado', 'Cole aqui na conversa.'); } catch { toast('Erro', 'Selecione o texto e copie à mão.', 'error'); } }
  } else if (action === 'palace-test') {
    actionEl.disabled = true;
    try {
      const { steps } = await api('/api/admin/casino/palace-test', { method: 'POST', body: {} });
      $('#palaceTest').innerHTML = `<div class="table-wrap"><table><tbody>${steps.map((x) => `<tr><td>${x.ok ? '✅' : '❌'} ${esc(x.name)}</td><td>${esc(x.detail || '')}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (err) { toast('Erro', err.message, 'error'); }
    actionEl.disabled = false;
  } else if (action === 'tg-auto') {
    try {
      await api('/api/admin/telegram/auto', { method: 'POST', body: { on: actionEl.checked } });
      toast(actionEl.checked ? 'Publicação automática ligada' : 'Publicação automática desligada');
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'tg-ticket') {
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/telegram/tickets/post', { method: 'POST', body: {} });
      if (r.action === 'posted') toast(r.status === 'sent' ? 'Bilhete publicado' : 'Falhou', r.error || '', r.status === 'sent' ? undefined : 'error');
      else toast('Nada publicado', TG_TICKET_REASON[r.reason] || TG_REASON[r.reason] || r.reason);
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'tg-promote') {
    actionEl.disabled = true;
    try {
      const r = await api('/api/admin/telegram/promote', { method: 'POST', body: {} });
      if (r.action === 'posted') toast(r.status === 'sent' ? 'Jogo publicado' : 'Falhou', r.error || '', r.status === 'sent' ? undefined : 'error');
      else toast('Nada publicado', TG_REASON[r.reason] || r.reason);
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'novo-import') {
    const dry = actionEl.dataset.dry === '1';
    if (!dry && !confirm('Importar agora os jogadores do Bet62Novo? Ponha o Bet62Novo em manutenção antes (sem novos depósitos nem apostas).')) return;
    actionEl.disabled = true;
    actionEl.textContent = dry ? 'A simular…' : 'A importar…';
    try {
      novoReport = (await api('/api/admin/import-novo', { method: 'POST', body: { dryRun: dry } })).report;
      toast(dry ? 'Simulação concluída' : 'Importação concluída', `${novoReport.imported} jogador(es)`);
    } catch (err) { toast('Erro', err.message, 'error'); }
    loadTab();
  } else if (action === 'bets-filter') {
    state.betsFilter = actionEl.dataset.filter;
    loadTab();
  } else if (action === 'bet-settle') {
    const card = actionEl.closest('.bet-card');
    const legs = Object.fromEntries([...card.querySelectorAll('.leg-pick')].filter((s) => s.value).map((s) => [s.dataset.leg, s.value]));
    await settleTicket(actionEl.dataset.id, legs, `Liquidar o bilhete #${actionEl.dataset.id} com os resultados escolhidos? O pagamento é feito de imediato.`);
  } else if (action === 'bet-settle-all') {
    const card = actionEl.closest('.bet-card');
    const r = actionEl.dataset.result;
    const legs = Object.fromEntries([...card.querySelectorAll('.leg-pick')].map((s) => [s.dataset.leg, r]));
    const what = { won: 'GANHO (todas as seleções em aberto ganhas, o prémio é pago)', lost: 'PERDIDO', void: 'ANULADO (a aposta é devolvida)' }[r];
    await settleTicket(actionEl.dataset.id, legs, `Marcar o bilhete #${actionEl.dataset.id} como ${what}?`);
  } else if (['wd-approve', 'wd-reject', 'wd-manual', 'wd-pay'].includes(action)) {
    const verb = { 'wd-approve': 'approve', 'wd-manual': 'approve', 'wd-reject': 'reject', 'wd-pay': 'pay' }[action];
    const ask = {
      'wd-approve': state.revolutOn ? 'Aprovar e enviar o pagamento pela Revolut para o IBAN do jogador?' : 'Aprovar este levantamento (confirmando que a transferência foi feita)?',
      'wd-manual': 'Aprovar sem a Revolut (confirmando que a transferência foi feita à mão)?',
      'wd-reject': 'Rejeitar e devolver o valor ao jogador?',
      'wd-pay': 'Enviar agora este levantamento pela Revolut?',
    }[action];
    if (!confirm(ask)) return;
    try {
      const r = await api(`/api/admin/withdrawals/${actionEl.dataset.id}/${verb}`, { method: 'POST', body: action === 'wd-manual' ? { manual: true } : {} });
      toast(verb === 'reject' ? 'Levantamento rejeitado' : r.payout === 'paid' ? 'Pago pela Revolut' : r.payout ? 'Enviado para a Revolut' : 'Levantamento aprovado');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); loadTab(); }
  }
});

// Free-spins games: searched by name in the casino catalogue.
let fsSearchTimer = null;
document.addEventListener('change', async (e) => {
  if (skinEd && e.target.closest?.('.skin-ed')) { skinChange(e.target); return; }
  if (e.target.dataset?.action === 'casino-skins') {
    try {
      const r = await api('/api/admin/casino/skins', { method: 'POST', body: { mode: e.target.value } });
      toast('Película', { off: 'Desligada', admin: 'Só para administradores', all: 'Ligada para todos' }[r.mode]);
    } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  // Market catalogue: show (and consult) one sport only.
  if (e.target.id === 'catSport') {
    catalogSport = e.target.value;
    $('#adminMain').innerHTML = marketCatalog({ catalog: lastCatalog, running: false });
    return;
  }
  const cp = e.target.dataset?.cp;
  if (!cp) return;
  const form = e.target.form;
  if (cp === 'tpl' && CP_TEMPLATES[e.target.value]) {
    const [subject, body, cta] = CP_TEMPLATES[e.target.value];
    form.subject.value = subject; form.body.value = body; form.ctaText.value = cta;
  }
  campaignCount();
});

document.addEventListener('input', (e) => {
  if (skinEd && e.target.closest?.('.skin-ed')) { skinInput(e.target); return; }
  if (e.target.form?.id === 'cpForm' && e.target.name === 'body') { campaignCount(); return; }
  const modal = e.target.id === 'amGameSearch';
  if (e.target.id !== 'fsGameSearch' && !modal) return;
  clearTimeout(fsSearchTimer);
  const q = e.target.value.trim();
  fsSearchTimer = setTimeout(async () => {
    const box = $(modal ? '#amGameResults' : '#fsGameResults');
    if (!box) return;
    if (q.length < 2) { box.innerHTML = ''; return; }
    try {
      const r = await api(`/api/casino/games?limit=8&q=${encodeURIComponent(q)}`);
      box.innerHTML = r.games.length ? r.games.map((g) => `<button type="button" class="fs-result" data-action="${modal ? 'am-game-add' : 'fs-game-add'}" data-id="${g.id}" data-name="${esc(g.name)}">${esc(g.name)} <small class="muted">${esc(g.provider)}${g.type === 'live' ? ' · ao vivo' : ''}</small></button>`).join('')
        : '<small class="muted">Nenhum jogo encontrado.</small>';
    } catch (err) { box.innerHTML = `<small class="muted">${esc(err.message)}</small>`; }
  }, 250);
});

window.addEventListener('hashchange', () => { if (state.user && location.hash.slice(1) !== state.tab) go(location.hash.slice(1)); });

async function init() {
  const [me, config] = await Promise.all([api('/api/me').catch(() => ({ user: null })), api('/api/config').catch(() => null)]);
  state.config = config;
  state.user = me.user?.role === 'admin' ? me.user : null;
  state.tab = TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'painel';
  render();
}
init();

// ---------- películas: covers over parts of casino games ----------
// A cover is made from two screenshots of the same game on the same device: ours (the reference,
// with the parts to hide) and a clean one (e.g. at Betclic). The clean one is laid over ours and
// lined up (drag, size; "diferença" makes the match obvious: aligned = black), then the zone to hide
// is marked. The cover is that zone of the clean picture, at its own resolution.

const SIDE_LABEL = { land: 'Computador (deitado)', port: 'Telemóvel (em pé)' };
let skinEd = null;

function adminSkins(d) {
  const mode = d.mode || 'off';
  const cards = d.skins.map((s) => `<div class="skin-card">
      <div class="skin-thumb"><img src="${esc(s.img)}" alt=""></div>
      <div class="grow"><strong>${esc(s.name)}</strong><small class="muted">${esc(SIDE_LABEL[s.side])} · ${esc(s.code)}</small>
        <small class="muted">Proporção ${s.ratio.toFixed(3)} · zona ${s.box.map((v) => `${v.toFixed(1)}%`).join(' ')}</small></div>
      <label class="adm-switch"><input type="checkbox" data-action="skin-enabled" data-id="${s.id}"${s.enabled ? ' checked' : ''}> Ativa</label>
      <button class="ghost-btn btn-sm" data-action="skin-edit" data-id="${s.id}">Editar</button>
      <button class="danger-btn btn-sm" data-action="skin-delete" data-id="${s.id}" data-name="${esc(s.name)}">Apagar</button>
    </div>`).join('');
  return `<div class="panel"><h3>Películas</h3>
      <p class="muted">Tapam partes de um jogo (por exemplo "Comprar Rodadas Grátis") com a arte original do próprio jogo.
        O jogo abre sempre no formato da captura usada, para a película cair no sítio certo.</p>
      <div class="form-actions"><label class="field adm-inline">Mostrar películas <select data-action="casino-skins">
        ${[['off', 'Desligadas'], ['admin', 'Só administradores (teste)'], ['all', 'Ligadas para todos']].map(([v, t]) => `<option value="${v}"${mode === v ? ' selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <button class="primary-btn btn-sm" data-action="skin-new">+ Nova película</button></div>
      <div class="skin-list">${cards || '<p class="muted">Ainda não há películas.</p>'}</div></div>`;
}

function skinEditorHtml() {
  const e = skinEd;
  return `<div class="form-actions"><button class="ghost-btn btn-sm" data-action="skin-back">‹ Películas</button></div>
    <div class="panel skin-ed"><h3>${e.id ? 'Editar película' : 'Nova película'}</h3>
      <div class="skin-ed-grid">
        <div class="field"><span>1. Jogo</span>
          <div class="fs-search"><input id="skGame" placeholder="Procurar jogo (ex.: Gates of Olympus)…" autocomplete="off" value="${esc(e.name || '')}">
          <div class="fs-results" id="skGameResults"></div></div>
          <small class="muted" id="skGameCode">${e.code ? `Código: ${esc(e.code)}` : 'Escolha o jogo na lista.'}</small></div>
        <label class="field"><span>2. Onde</span><select id="skSide">
          ${Object.entries(SIDE_LABEL).map(([v, t]) => `<option value="${v}"${e.side === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>3. Captura do jogo no nosso site</span><input type="file" id="skRef" accept="image/*">
          <small class="muted">O jogo parado, a ocupar a captura toda.</small></label>
        <label class="field"><span>4. Captura limpa (ex.: Betclic)</span><input type="file" id="skClean" accept="image/*">
          <small class="muted">O mesmo jogo, no mesmo aparelho e na mesma posição, sem o que quer tapar.</small></label>
      </div>
      <div class="skin-tools">
        <div class="seg"><button type="button" class="${e.tool === 'move' ? 'on' : ''}" data-action="skin-tool" data-tool="move">✋ Alinhar captura limpa</button>
          <button type="button" class="${e.tool === 'zone' ? 'on' : ''}" data-action="skin-tool" data-tool="zone">▭ Marcar zona a tapar</button></div>
        <label class="field adm-inline">Transparência <input type="range" id="skOp" min="0" max="100" value="${Math.round(e.op * 100)}"></label>
        <label class="field adm-inline">Tamanho <input type="range" id="skScale" min="-200" max="200" value="0"> <input type="number" id="skScaleN" step="0.0005" value="${e.s.toFixed(4)}" class="sk-num"></label>
        <label class="adm-switch"><input type="checkbox" id="skDiff"${e.diff ? ' checked' : ''}> Diferença (alinhado = preto)</label>
        <label class="adm-switch"><input type="checkbox" id="skPreview"${e.preview ? ' checked' : ''}> Ver resultado</label>
      </div>
      <p class="muted">Arraste a captura limpa até coincidir com a nossa (setas do teclado: 1 px; Shift: 10 px). Depois escolha "Marcar zona" e arraste sobre o que quer tapar.</p>
      <div class="skin-canvas-wrap"><canvas id="skCanvas" tabindex="0"></canvas>
        <div class="skin-canvas-empty" id="skEmpty">${e.ref ? '' : 'Carregue a captura do jogo no nosso site (passo 3).'}</div></div>
      <div class="form-actions"><label class="adm-switch"><input type="checkbox" id="skEnabled"${e.enabled ? ' checked' : ''}> Ativa</label>
        <button class="primary-btn" data-action="skin-save">Guardar película</button></div>
    </div>`;
}

const loadImg = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Não foi possível abrir a imagem.')); i.src = src; });
const readFile = (file) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fail(new Error('Não foi possível ler o ficheiro.')); r.readAsDataURL(file); });
/** A picture as JPEG (for keeping the screenshots small enough to store). */
function asJpeg(img, quality = 0.9) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/jpeg', quality);
}

async function openSkinEditor(skin = null) {
  skinEd = {
    id: skin?.id || null, code: skin?.code || '', name: skin?.name || '', side: skin?.side || 'land', enabled: skin ? skin.enabled : true,
    ref: null, clean: null, refNew: false, cleanNew: false, x: 0, y: 0, s: 1, zone: null, tool: 'move', op: 0.6, diff: false, preview: false,
    box: skin?.box || null, ratio: skin?.ratio || null, cover: null,
  };
  try {
    if (skin?.ref) skinEd.ref = await loadImg(skin.ref);
    if (skin?.clean) skinEd.clean = await loadImg(skin.clean);
    if (skin?.align) Object.assign(skinEd, { x: skin.align.x, y: skin.align.y, s: skin.align.s });
    if (skin && !skin.ref) skinEd.cover = await loadImg(skin.img);
  } catch (err) { toast('Erro', err.message, 'error'); }
  if (skinEd.ref && skinEd.box) {
    const W = skinEd.ref.naturalWidth, H = skinEd.ref.naturalHeight, [l, t, w, h] = skinEd.box;
    skinEd.zone = { x: l * W / 100, y: t * H / 100, w: w * W / 100, h: h * H / 100 };
  }
  if (skinEd.clean || skinEd.zone) skinEd.tool = skinEd.zone ? 'zone' : 'move';
  $('#adminMain').innerHTML = skinEditorHtml();
  wireSkinCanvas();
  drawSkin();
}

function drawSkin() {
  const e = skinEd, c = $('#skCanvas');
  if (!e || !c) return;
  const ctx = c.getContext('2d');
  $('#skEmpty').textContent = e.ref ? '' : (e.cover ? 'Película feita antes do editor: para mudar a imagem ou a zona, carregue as duas capturas.' : 'Carregue a captura do jogo no nosso site (passo 3).');
  if (!e.ref) {
    if (e.cover) { c.width = e.cover.naturalWidth; c.height = e.cover.naturalHeight; ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(e.cover, 0, 0); } else { c.width = 0; c.height = 0; }
    return;
  }
  const W = e.ref.naturalWidth, H = e.ref.naturalHeight;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(e.ref, 0, 0);
  if (e.clean) {
    const cw = e.clean.naturalWidth * e.s, ch = e.clean.naturalHeight * e.s;
    if (e.preview && e.zone) {
      ctx.save(); ctx.beginPath(); ctx.rect(e.zone.x, e.zone.y, e.zone.w, e.zone.h); ctx.clip();
      ctx.drawImage(e.clean, e.x, e.y, cw, ch); ctx.restore();
    } else if (!e.preview) {
      ctx.globalAlpha = e.diff ? 1 : e.op;
      if (e.diff) ctx.globalCompositeOperation = 'difference';
      ctx.drawImage(e.clean, e.x, e.y, cw, ch);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (e.zone && !e.preview) {
    const lw = Math.max(2, W / 400);
    ctx.lineWidth = lw; ctx.setLineDash([lw * 4, lw * 3]); ctx.strokeStyle = '#ffc400';
    ctx.strokeRect(e.zone.x, e.zone.y, e.zone.w, e.zone.h); ctx.setLineDash([]);
  }
}

function wireSkinCanvas() {
  const c = $('#skCanvas');
  let drag = null;
  const at = (ev) => { const r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height }; };
  c.addEventListener('pointerdown', (ev) => {
    if (!skinEd?.ref) return;
    c.setPointerCapture(ev.pointerId); c.focus();
    const p = at(ev);
    drag = { p, x: skinEd.x, y: skinEd.y };
  });
  c.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const p = at(ev), e = skinEd;
    if (e.tool === 'move' && e.clean) { e.x = drag.x + p.x - drag.p.x; e.y = drag.y + p.y - drag.p.y; }
    else if (e.tool === 'zone') {
      const x0 = Math.max(0, Math.min(drag.p.x, p.x)), y0 = Math.max(0, Math.min(drag.p.y, p.y));
      const x1 = Math.min(c.width, Math.max(drag.p.x, p.x)), y1 = Math.min(c.height, Math.max(drag.p.y, p.y));
      e.zone = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    drawSkin();
  });
  const end = () => { drag = null; if (skinEd?.zone && (skinEd.zone.w < 4 || skinEd.zone.h < 4)) skinEd.zone = null; drawSkin(); };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  c.addEventListener('keydown', (ev) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (!d || !skinEd?.clean) return;
    ev.preventDefault();
    const k = ev.shiftKey ? 10 : 1;
    skinEd.x += d[0] * k; skinEd.y += d[1] * k; drawSkin();
  });
}

/** Changes the size of the clean picture keeping the middle of the screen where it is. */
function setSkinScale(s) {
  const e = skinEd;
  if (!e?.ref || !(s > 0)) return;
  const cx = e.ref.naturalWidth / 2, cy = e.ref.naturalHeight / 2;
  e.x = cx - (cx - e.x) * (s / e.s); e.y = cy - (cy - e.y) * (s / e.s); e.s = s;
  const n = $('#skScaleN'); if (n && document.activeElement !== n) n.value = s.toFixed(4);
  drawSkin();
}

/** The cover: the marked zone of the clean picture at the clean picture's own resolution, soft edges. */
function skinCover() {
  const e = skinEd, z = e.zone;
  const sw = z.w / e.s, sh = z.h / e.s;
  const k = Math.min(1, 1600 / Math.max(sw, sh));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const ctx = c.getContext('2d');
  ctx.drawImage(e.clean, (z.x - e.x) / e.s, (z.y - e.y) / e.s, sw, sh, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height), f = Math.max(2, Math.round(4 * c.width / z.w));
  for (let y = 0; y < c.height; y += 1) {
    for (let x = 0; x < c.width; x += 1) {
      const a = Math.min(1, (x + 0.5) / f, (c.width - x - 0.5) / f, (y + 0.5) / f, (c.height - y - 0.5) / f);
      if (a < 1) img.data[(y * c.width + x) * 4 + 3] *= a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

async function saveSkin() {
  const e = skinEd;
  if (!e.code) throw new Error('Escolha o jogo (passo 1).');
  const body = { id: e.id, code: e.code, name: e.name, side: $('#skSide').value, enabled: $('#skEnabled').checked };
  if (e.ref) {
    if (!e.zone) throw new Error('Marque a zona a tapar.');
    const W = e.ref.naturalWidth, H = e.ref.naturalHeight;
    body.ratio = W / H;
    body.box = [e.zone.x / W * 100, e.zone.y / H * 100, e.zone.w / W * 100, e.zone.h / H * 100];
    if (!e.clean) throw new Error('Carregue a captura limpa (passo 4).');
    body.image = skinCover();
    body.align = { x: e.x, y: e.y, s: e.s };
    if (e.refNew) body.refImage = asJpeg(e.ref);
    if (e.cleanNew) body.cleanImage = asJpeg(e.clean, 0.95);
  } else {
    if (!e.id) throw new Error('Carregue a captura do jogo no nosso site (passo 3).');
    body.ratio = e.ratio; body.box = e.box;
  }
  const r = await api('/api/admin/skins', { method: 'POST', body });
  return r.skin;
}

async function skinAction(action, el) {
  if (action === 'skin-new') { openSkinEditor(); return; }
  if (action === 'skin-back') { loadTab(); return; }
  if (action === 'skin-edit') {
    try { const d = await api('/api/admin/skins'); openSkinEditor(d.skins.find((s) => s.id === Number(el.dataset.id))); } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (action === 'skin-enabled') {
    try { await api(`/api/admin/skins/${el.dataset.id}/enabled`, { method: 'POST', body: { on: el.checked } }); toast(el.checked ? 'Película ativa' : 'Película desligada'); } catch (err) { el.checked = !el.checked; toast('Erro', err.message, 'error'); }
    return;
  }
  if (action === 'skin-delete') {
    if (!confirm(`Apagar a película de ${el.dataset.name}?`)) return;
    try { await api(`/api/admin/skins/${el.dataset.id}/delete`, { method: 'POST', body: {} }); toast('Película apagada'); loadTab(); } catch (err) { toast('Erro', err.message, 'error'); }
    return;
  }
  if (!skinEd) return;
  if (action === 'skin-tool') {
    skinEd.tool = el.dataset.tool;
    document.querySelectorAll('.skin-ed .seg button').forEach((b) => b.classList.toggle('on', b === el));
    return;
  }
  if (action === 'skin-pick') {
    skinEd.code = el.dataset.code; skinEd.name = el.dataset.name;
    $('#skGame').value = el.dataset.name; $('#skGameResults').innerHTML = ''; $('#skGameCode').textContent = `Código: ${el.dataset.code}`;
    return;
  }
  if (action === 'skin-save') {
    el.disabled = true;
    try { await saveSkin(); toast('Película guardada'); loadTab(); } catch (err) { toast('Erro', err.message, 'error'); el.disabled = false; }
  }
}

let skGameTimer = null;
function skinInput(t) {
  const e = skinEd;
  if (t.id === 'skOp') { e.op = Number(t.value) / 100; drawSkin(); }
  else if (t.id === 'skScale') { e.sBase ??= e.s; setSkinScale(e.sBase * 2 ** (Number(t.value) / 200)); }
  else if (t.id === 'skScaleN') { const v = Number(t.value); if (v > 0) setSkinScale(v); }
  else if (t.id === 'skGame') {
    clearTimeout(skGameTimer);
    const q = t.value.trim();
    skGameTimer = setTimeout(async () => {
      const box = $('#skGameResults');
      if (!box) return;
      if (q.length < 2) { box.innerHTML = ''; return; }
      try {
        const r = await api(`/api/casino/games?limit=8&q=${encodeURIComponent(q)}`);
        const list = r.games.filter((g) => g.code);
        box.innerHTML = list.length ? list.map((g) => `<button type="button" class="fs-result" data-action="skin-pick" data-code="${esc(g.code)}" data-name="${esc(g.name)}">${esc(g.name)} <small class="muted">${esc(g.provider)} · ${esc(g.code)}</small></button>`).join('')
          : '<small class="muted">Nenhum jogo encontrado.</small>';
      } catch (err) { box.innerHTML = `<small class="muted">${esc(err.message)}</small>`; }
    }, 250);
  }
}

async function skinChange(t) {
  const e = skinEd;
  if (t.id === 'skScale') { e.sBase = null; t.value = 0; return; }
  if (t.id === 'skDiff') { e.diff = t.checked; drawSkin(); return; }
  if (t.id === 'skPreview') { e.preview = t.checked; drawSkin(); return; }
  if (t.id === 'skSide') { e.side = t.value; return; }
  if ((t.id === 'skRef' || t.id === 'skClean') && t.files?.[0]) {
    try {
      const img = await loadImg(await readFile(t.files[0]));
      if (t.id === 'skRef') {
        e.ref = img; e.refNew = true; e.zone = null; e.cover = null;
        e.side = img.naturalWidth > img.naturalHeight ? 'land' : 'port';
        $('#skSide').value = e.side;
      } else { e.clean = img; e.cleanNew = true; }
      // A new clean picture starts fitted to the width of ours, centred.
      if (e.ref && e.clean && (t.id === 'skClean' || !e.s)) {
        e.s = e.ref.naturalWidth / e.clean.naturalWidth; e.x = 0; e.y = (e.ref.naturalHeight - e.clean.naturalHeight * e.s) / 2;
        $('#skScaleN').value = e.s.toFixed(4);
      }
      drawSkin();
    } catch (err) { toast('Erro', err.message, 'error'); }
  }
}
