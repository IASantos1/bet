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

const TABS = [
  { id: 'painel', label: 'Painel', icon: '📊', section: 'Operações' },
  { id: 'eventos', label: 'Eventos', icon: '🗓️', section: 'Operações' },
  { id: 'liquidacao', label: 'Liquidação', icon: '⚖️', section: 'Operações' },
  { id: 'apostas', label: 'Apostas', icon: '🎟️', section: 'Operações' },
  { id: 'levantamentos', label: 'Levantamentos', icon: '💸', section: 'Operações' },
  { id: 'utilizadores', label: 'Utilizadores', icon: '👥', section: 'Operações' },
  { id: 'promocoes', label: 'Promoções', icon: '🎁', section: 'Operações' },
  { id: 'novo', label: 'Novo evento', icon: '➕', section: 'Avançado' },
  { id: 'feed', label: 'Dados ao vivo', icon: '📡', section: 'Avançado' },
  { id: 'casino', label: 'Casino', icon: '🎰', section: 'Avançado' },
  { id: 'mercados', label: 'Catálogo de mercados', icon: '🧾', section: 'Avançado' },
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
        <button class="ua wallet" data-action="user-balance" data-id="${u.id}" data-name="${esc(u.name)}" title="Saldo da carteira">${ICON.wallet}</button>
        <button class="ua gift" data-action="user-freebet" data-id="${u.id}" data-name="${esc(u.name)}" title="FreeBets">${ICON.gift}</button>
        ${u.role === 'admin' ? '' : `<button class="ua ban${u.banned ? ' on' : ''}" data-action="user-ban" data-id="${u.id}" data-name="${esc(u.name)}" data-banned="${u.banned ? 1 : 0}" title="${u.banned ? 'Desbanir' : 'Banir'}">${ICON.ban}</button>`}
        <button class="ua notes" data-action="user-detail" data-id="${u.id}" title="Ver detalhe">${ICON.notes}</button>
      </div></td></tr>`).join('')}
  </tbody></table></div>`;
}

const TX_LABEL = {
  deposit: 'Depósito', withdrawal: 'Levantamento', withdrawal_refund: 'Levantamento devolvido', bet: 'Aposta', payout: 'Prémio', refund: 'Reembolso',
  casino_out: 'Casino (saída)', casino_in: 'Casino (entrada)', admin_credit: 'Crédito do admin', admin_debit: 'Débito do admin',
  bonus_convert: 'Bónus convertido', chargeback: 'Chargeback', cashout: 'Cash out', casino_bet: 'Casino (aposta)', casino_win: 'Casino (ganho)', free_spin_win: 'Ganhos Free Spins',
};

// ---------- promotions ----------

const PROMO_STATUS = { active: 'Ativo', completed: 'Cumprido', expired: 'Expirado', cancelled: 'Cancelado', used: 'Usada', granted: 'Atribuído', refused: 'Recusado' };
const CAMPAIGN = { casinoFs: 'Free Spins casino (CASINO_FREE_SPINS)', welcome: 'Boas-vindas', reload: 'Reload semanal', cashback: 'Cashback semanal', firstBet: 'Primeira aposta protegida', general: 'Geral', all: 'Todas' };
// Fields of each campaign in the admin form: [key, label, type].
const PROMO_FIELDS = {
  welcome: [['percent', 'Bónus (%)'], ['minDeposit', 'Depósito mínimo (€)'], ['maxBonus', 'Bónus máximo (€)'], ['rolloverMult', 'Rollover (×)'], ['rolloverBase', 'Base do rollover', 'base'],
    ['minOdds', 'Odd mínima'], ['validityDays', 'Validade (dias)'], ['maxCountStake', 'Aposta máx. contabilizável (€)', 'opt'], ['maxCountPct', '… ou % do bónus (o menor)', 'opt']],
  reload: [['percent', 'Bónus (%)'], ['minDeposit', 'Depósito mínimo (€)'], ['maxBonus', 'Bónus máximo (€)'], ['rolloverMult', 'Rollover (×)'], ['rolloverBase', 'Base do rollover', 'base'],
    ['minOdds', 'Odd mínima'], ['validityDays', 'Validade (dias)'], ['maxCountStake', 'Aposta máx. contabilizável (€)', 'opt'], ['maxCountPct', '… ou % do bónus (o menor)', 'opt']],
  casinoFs: [['tiers', 'Escalões (depósito € : rodadas)', 'tiers'], ['spinValue', 'Valor por rodada (€)'], ['validityDays', 'Validade (dias)'], ['maxDeposit', 'Depósito máximo promocional (€)'],
    ['maxClaims', 'Máximo de utilizações por jogador', 'opt'], ['games', 'Jogos elegíveis (IDs BigBang, separados por vírgula)', 'games']],
  firstBet: [['minStake', 'Aposta mínima (€)'], ['minOdds', 'Odd mínima'], ['maxRefund', 'Reembolso máximo em free bet (€)'], ['validityDays', 'Validade da free bet (dias)']],
  cashback: [['percent', 'Cashback (%)'], ['minLoss', 'Perda líquida mínima (€)'], ['max', 'Cashback máximo (€/semana)'], ['rolloverMult', 'Rollover (×)'], ['minOdds', 'Odd mínima'], ['validityDays', 'Validade (dias)']],
};
const localDT = (iso) => (iso ? toLocalInput(iso) : '');

function adminPromos(d) {
  const c = d.config;
  const field = (camp, [k, label, type]) => {
    const v = c[camp][k];
    if (type === 'tiers') return `<label class="field">${esc(label)}<input name="${camp}.${k}" value="${esc(v.map(([d, n]) => `${d}:${n}`).join(', '))}" required></label>`;
    if (type === 'games') return `<label class="field wide">${esc(label)}<input name="${camp}.${k}" value="${esc(v.join(', '))}" placeholder="ex.: 4821, 4822"><small class="muted">${v.length ? `${v.length} jogo(s)` : 'Sem jogos: a campanha não fica disponível.'} Os IDs aparecem no URL da página do jogo (#/casino/jogo/ID).</small></label>`;
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
      ${['welcome', 'firstBet', 'reload', 'cashback', 'casinoFs'].map(campaign).join('')}
      <div class="form-actions"><button class="primary-btn">Guardar configuração</button></div>
    </form>
    <div class="panel"><h3>Bónus</h3>${bonuses}</div>
    <div class="panel"><h3>Free bets</h3>${freebets}</div>
    <div class="panel"><h3>Free Spins casino</h3>${d.spins?.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Jogador</th><th>Rodadas</th><th class="num">Valor</th><th class="num">Saldo FS</th><th class="num">Ganhos pagos</th><th>Expira</th><th>Estado</th></tr></thead><tbody>
      ${d.spins.map((x) => `<tr><td>${x.id}</td><td>${esc(x.user)}</td><td>${x.spins} × ${money(x.spinValue)}</td><td class="num">${money(x.value)}</td><td class="num">${money(x.balance)}</td><td class="num">${money(x.paid)}</td>
        <td>${esc(fmtDateTime(x.expiresAt))}</td><td><span class="pill ${x.status === 'active' ? 'open' : 'void'}">${({ active: 'Ativa', closed: 'Terminada', expired: 'Expirada', cancelled: 'Cancelada' })[x.status]}</span>${x.reason ? `<br><small class="muted">${esc(x.reason)}</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Sem Free Spins atribuídas.</p>'}</div>
    <div class="panel"><h3>Decisões (atribuídas / recusadas)</h3>${log}</div>`;
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

function userDetailView(d) {
  const u = d.user;
  const deposits = d.transactions.filter((t) => t.type === 'deposit');
  const docs = d.documents.length
    ? `<div class="table-wrap"><table><thead><tr><th>Documento</th><th>Ficheiro</th><th>Enviado</th><th>Estado</th><th></th></tr></thead><tbody>
      ${d.documents.map((x) => `<tr><td>${esc(x.kind)}</td><td><a href="/api/admin/kyc/${x.id}/file" target="_blank" rel="noopener">${esc(x.fileName)}</a> <small class="muted">${Math.round(x.size / 1024)} KB</small></td>
        <td>${esc(fmtDateTime(x.createdAt))}</td><td><span class="pill ${x.status}">${KYC_LABEL[x.status] || x.status}</span></td>
        <td><div class="form-actions"><button class="primary-btn btn-sm" data-action="kyc-doc" data-doc="${x.id}" data-status="approved">Validar</button><button class="danger-btn btn-sm" data-action="kyc-doc" data-doc="${x.id}" data-status="rejected">Rejeitar</button></div></td></tr>`).join('')}
      </tbody></table></div>`
    : '<p class="muted">O jogador ainda não enviou documentos.</p>';
  return `<div class="form-actions"><button class="ghost-btn btn-sm" data-action="user-back">‹ Utilizadores</button></div>
    <div class="panel"><h3>${esc(u.name)} ${u.banned ? '<span class="pill lost">Banido</span>' : ''}</h3>
      <p>${esc(u.email)}${u.phone ? ` · ${esc(u.phone)}` : ''} · nascido em ${esc(u.birthdate || '—')} · registo ${esc(fmtDateTime(u.createdAt))}</p>
      <div class="user-sums">
        <div><small>Saldo</small><strong>${money(u.balance)}</strong></div><div><small>FreeBets</small><strong>${money(u.freebet)}</strong></div>
        <div><small>Depósitos</small><strong>${money(d.totals.deposits)}</strong></div><div><small>Levantamentos</small><strong>${money(d.totals.withdrawals)}</strong></div>
        <div><small>Apostado</small><strong>${money(d.totals.staked)}</strong></div><div><small>Prémios</small><strong>${money(d.totals.payouts)}</strong></div>
      </div>
      <div class="user-acts big">
        <button class="ua wallet" data-action="user-balance" data-id="${u.id}" data-name="${esc(u.name)}" title="Saldo da carteira">${ICON.wallet}</button>
        <button class="ua gift" data-action="user-freebet" data-id="${u.id}" data-name="${esc(u.name)}" title="FreeBets">${ICON.gift}</button>
        ${u.role === 'admin' ? '' : `<button class="ua ban${u.banned ? ' on' : ''}" data-action="user-ban" data-id="${u.id}" data-name="${esc(u.name)}" data-banned="${u.banned ? 1 : 0}" title="${u.banned ? 'Desbanir' : 'Banir'}">${ICON.ban}</button>`}
      </div>
    </div>
    ${userPromosPanel(d)}
    <div class="panel"><h3>Verificação de identidade (KYC) <span class="pill ${u.kycStatus}">${KYC_LABEL[u.kycStatus] || u.kycStatus}</span></h3>${docs}</div>
    <div class="panel"><h3>Apostas <small class="muted">${d.bets.length}</small></h3>${d.bets.length ? d.bets.map((b) => betCard(b)).join('') : '<p class="muted">Sem apostas.</p>'}</div>
    <div class="panel"><h3>Depósitos <small class="muted">${deposits.length}</small></h3>${deposits.length ? `<div class="table-wrap"><table><tbody>${deposits.map((t) => `<tr><td>${esc(fmtDateTime(t.createdAt))}</td><td>${esc(t.description)}</td><td class="num">${money(t.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem depósitos.</p>'}</div>
    <div class="panel"><h3>Levantamentos <small class="muted">${d.withdrawals.length}</small></h3>${d.withdrawals.length ? `<div class="table-wrap"><table><tbody>${d.withdrawals.map((w) => `<tr><td>${esc(fmtDateTime(w.createdAt))}</td><td>${esc(w.iban)}</td><td><span class="pill ${w.status}">${STATUS_LABEL[w.status] || w.status}</span></td><td class="num">${money(w.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem levantamentos.</p>'}</div>
    <div class="panel"><h3>Movimentos da carteira</h3>${d.transactions.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead><tbody>${d.transactions.map((t) => `<tr><td>${esc(fmtDateTime(t.createdAt))}</td><td>${TX_LABEL[t.type] || t.type}</td><td>${esc(t.description)}</td><td class="num">${money(t.amount)}</td><td class="num">${money(t.balanceAfter)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem movimentos.</p>'}</div>`;
}

function betCard(b, { showUser = false } = {}) {
  return `<div class="bet-card">
    <div class="bet-card-head"><span>#${b.id} · ${b.type === 'multiple' ? `Múltipla (${b.legs.length})` : b.type === 'builder' ? `Criador de apostas (${b.legs.length})` : 'Simples'} · ${esc(fmtDateTime(b.createdAt))}${showUser ? ` · ${esc(b.email)}` : ''}</span><span class="pill ${b.status}">${STATUS_LABEL[b.status]}</span></div>
    ${b.legs.map((l) => `<div class="bet-leg"><div>${esc(l.match)}<small>${esc(l.competition)} · ${esc(l.marketName && l.market !== '1x2' ? `${l.marketName}: ` : '')}${esc(l.label || CODE_LABEL[l.code])}${l.score ? ` · ${esc(l.score)}` : ''}</small></div><div class="num"><b class="gold">${fmtOdds(l.odds)}</b><br><span class="pill ${l.status}">${STATUS_LABEL[l.status]}</span></div></div>`).join('')}
    <div class="bet-card-foot"><span>Aposta <strong>${money(b.stake)}</strong></span><span>Cotação <strong>${fmtOdds(b.totalOdds)}</strong></span>
      <span>${b.status === 'open' ? 'Retorno potencial' : 'Pago'} <strong class="${b.status === 'won' ? 'green' : ''}">${money(b.status === 'open' ? b.potential : b.payout)}</strong></span></div>
  </div>`;
}

// ---------- login ----------

function loginView(error = '') {
  return `<div class="adm-login"><form class="adm-login-card" data-form="login" novalidate>
    <div class="adm-login-head"><div class="adm-shield">🛡️</div><div class="brand-word">BET<span>62</span></div><p>Painel Administrativo</p></div>
    <div class="form-error${error ? '' : ' hidden'}">${esc(error)}</div>
    <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="username" placeholder="admin@seudominio.com"></div>
    <div class="field"><label>Palavra-passe</label><input name="password" type="password" required autocomplete="current-password" placeholder="••••••••"></div>
    <button class="primary-btn adm-login-btn">ENTRAR NO PAINEL</button>
    <a class="adm-back" href="/">← Voltar ao site</a>
  </form></div>`;
}

// ---------- layout ----------

function shell() {
  const tab = TABS.find((t) => t.id === state.tab) || TABS[0];
  const pending = state.stats?.pendingWithdrawals || 0;
  const link = (t) => `<button class="adm-nav${t.id === state.tab ? ' active' : ''}" data-tab="${t.id}"><span>${t.icon}</span><span class="grow">${esc(t.label)}</span>${t.id === 'levantamentos' && pending ? `<b class="adm-badge">${pending}</b>` : ''}</button>`;
  const sections = [...new Set(TABS.map((t) => t.section))];
  const sidebar = `<div class="adm-side-head"><span class="brand-word small">BET<span>62</span></span><span class="adm-tag">Admin</span></div>
    <nav class="adm-side-nav">${sections.map((sec) => `<div class="adm-section">${esc(sec)}</div>${TABS.filter((t) => t.section === sec).map(link).join('')}`).join('')}</nav>
    <div class="adm-side-foot"><div class="adm-user">${esc(state.user?.email || '')}</div><a class="adm-nav" href="/"><span>🏠</span><span class="grow">Ver o site</span></a><button class="adm-nav" data-action="logout"><span>⏻</span><span class="grow">Sair</span></button></div>`;
  return `<div class="adm">
    <aside class="adm-side" id="admSide">${sidebar}</aside>
    <div class="adm-overlay" data-action="close-menu"></div>
    <main class="adm-main">
      <header class="adm-top"><button class="adm-burger" data-action="open-menu" aria-label="Menu">☰</button><h1>${esc(tab.label)}</h1>
        <button class="ghost-btn btn-sm" data-action="refresh">⟳ Atualizar</button></header>
      <div class="adm-body"><div id="adminMain"><div class="loading">A carregar…</div></div></div>
    </main>
    <nav class="adm-bottom">${MOBILE_TABS.map((id) => TABS.find((t) => t.id === id)).map((t) => `<button class="${t.id === state.tab ? 'active' : ''}" data-tab="${t.id}"><span>${t.icon}</span>${esc(t.label)}</button>`).join('')}
      <button data-action="open-menu"><span>☰</span>Mais</button></nav>
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
  const card = (icon, label, value, sub = '', tone = '') => `<div class="adm-card ${tone}"><span class="adm-card-icon">${icon}</span><small>${esc(label)}</small><strong>${esc(value)}</strong>${sub ? `<em>${esc(sub)}</em>` : ''}</div>`;
  const alert = s.pendingWithdrawals ? `<button class="adm-alert" data-tab="levantamentos">⚠️ ${s.pendingWithdrawals} levantamento(s) pendente(s) a aguardar aprovação — total ${esc(money(s.pendingWithdrawalAmount))} ›</button>` : '';
  const sm = settle?.summary || {};
  const storage = s.storage && !s.storage.persistent
    ? `<div class="adm-alert">⚠️ A base de dados está no disco temporário do servidor (${esc(s.storage.path)}): saldos, apostas e utilizadores são apagados em cada deploy. No Railway, crie um <strong>Volume</strong> neste serviço (Settings → Volumes, por exemplo em /data) e faça redeploy — o servidor passa a usá-lo sozinho.</div>`
    : '';
  return `${storage}${alert}
    <div class="adm-cards">
      ${card('👥', 'Jogadores', s.users, '', 'blue')}
      ${card('🎟️', 'Apostas em aberto', s.openBets, money(s.openStake) + ' apostado', 'gold')}
      ${card('💶', 'Receita bruta', money(s.grossRevenue), 'apostas liquidadas', 'green')}
      ${card('💸', 'Levantamentos pendentes', s.pendingWithdrawals, money(s.pendingWithdrawalAmount), 'red')}
    </div>
    <div class="adm-cards">
      ${card('⚠️', 'Responsabilidade máxima', money(sm.maxLiability), 'se todas as apostas ganharem', 'red')}
      ${card('✅', 'Liquidadas hoje', sm.settledToday ?? 0, money(sm.stakesSettledToday) + ' apostado', 'blue')}
      ${card('💰', 'Pago hoje', money(sm.paidToday), '', 'gold')}
      ${card('📈', 'Margem hoje', money(sm.marginToday), '', 'green')}
    </div>
    <div class="panel"><h3>Atalhos</h3><div class="adm-shortcuts">
      ${TABS.filter((t) => t.id !== 'painel').map((t) => `<button class="ghost-btn" data-tab="${t.id}">${t.icon} ${esc(t.label)}</button>`).join('')}
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
    else if (tab === 'mercados') main.innerHTML = marketCatalog(await api('/api/admin/market-catalog'));
    else if (tab === 'liquidacao') main.innerHTML = adminSettlement(await api('/api/admin/settlement'));
    else if (tab === 'promocoes') main.innerHTML = adminPromos(await api('/api/admin/promotions'));
    else if (tab === 'levantamentos') {
      const { withdrawals } = await api('/api/admin/withdrawals');
      main.innerHTML = withdrawals.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Jogador</th><th>IBAN</th><th class="num">Valor</th><th>Estado</th><th></th></tr></thead><tbody>
        ${withdrawals.map((w) => `<tr><td>${esc(fmtDateTime(w.createdAt))}</td><td>${esc(w.user)}<br><small class="muted">${esc(w.email)}</small></td><td>${esc(w.iban)}</td><td class="num">${money(w.amount)}</td>
          <td><span class="pill ${w.status}">${STATUS_LABEL[w.status]}</span></td>
          <td>${w.status === 'pending' ? `<div class="form-actions"><button class="primary-btn btn-sm" data-action="wd-approve" data-id="${w.id}">Aprovar</button><button class="danger-btn btn-sm" data-action="wd-reject" data-id="${w.id}">Rejeitar</button></div>` : esc(fmtDateTime(w.decidedAt))}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="panel empty">Sem pedidos de levantamento.</div>';
    } else if (tab === 'apostas') {
      const [{ bets }, co] = await Promise.all([api('/api/admin/bets'), api('/api/admin/cashout')]);
      main.innerHTML = cashoutPanel(co) + (bets.length ? bets.map((b) => betCard(b, { showUser: true })).join('') : '<div class="panel empty">Sem apostas.</div>');
    } else if (tab === 'utilizadores') {
      if (state.userDetail) {
        main.innerHTML = userDetailView(await api(`/api/admin/users/${state.userDetail}`));
      } else {
        const { users } = await api('/api/admin/users');
        main.innerHTML = usersTable(users);
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

function marketCatalog({ catalog, running }) {
  lastCatalog = catalog;
  const intro = `<div class="panel"><h3>Catálogo de mercados do fornecedor</h3>
    <p class="muted">Consulta jogos reais de cada desporto (pré-jogo e ao vivo) e lista os mercados que a API devolve de facto:
    nome, código, linhas, seleções e em quantos jogos da amostra aparece. Na WinHouse todos os mercados vão para o site;
    "Liquidação" diz quais o sistema liquida sozinho pelo resultado e quais ficam para decidir em Liquidação. Cada jogo consultado gasta 1 pedido.</p>
    <div class="form-actions"><label class="field adm-inline">Jogos por desporto <input id="catSample" type="number" min="3" max="30" value="12"></label>
      <button class="primary-btn" data-action="catalog-run" ${running ? 'disabled' : ''}>${running ? 'A consultar…' : 'Consultar a API agora'}</button>
      ${catalog ? '<button class="ghost-btn" data-action="catalog-copy">Copiar resultado (JSON)</button>' : ''}</div>
    ${catalog ? `<p class="muted">Última consulta: ${esc(fmtDateTime(catalog.at))} · ${catalog.calls} pedidos.</p>` : ''}</div>`;
  if (!catalog) return `${intro}<div class="panel empty">Ainda não foi feita nenhuma consulta.</div>`;
  const sports = catalog.sports.filter((sp) => !sp.disabled);
  if (!sports.length) return `${intro}<div class="panel empty">Nenhuma fonte de odds ligada com jogos para consultar.</div>`;
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
      <div><span class="pill ${e.status}">${STATUS_LABEL[e.status]}</span>${suspended && !closed ? ' <span class="pill lost">Suspenso</span>' : ''}${e.featured ? ' <span class="pill void">Destaque</span>' : ''}${e.source && e.source !== 'manual' ? ' <span class="pill">Importado</span>' : ''}</div></div>
    ${e.source && e.source !== 'manual' ? `<div class="admin-actions">${e.source !== 'bzzoiro' ? `<button type="button" class="ghost-btn btn-sm" data-action="provider-odds" data-id="${e.id}">Ver odds do fornecedor</button>` : ''}
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
      <h3>Carteira integrada — URLs a configurar na chave (Painel BigBang)</h3>
      <div class="table-wrap"><table><tbody>
        <tr><td><strong>user_data</strong> (GET)</td><td><code>${esc(c.callbacks.userData)}</code></td></tr>
        <tr><td><strong>balance_change</strong> (POST)</td><td><code>${esc(c.callbacks.balanceChange)}</code></td></tr>
      </tbody></table></div>
      <p class="muted">O saldo nunca sai da Bet62: o BigBang pede o saldo e envia cada aposta/ganho assinados com a chave (HMAC), aplicados uma única vez por transação.
        ${c.sandbox ? 'Chave de teste (ek_test_): os jogos correm com saldo virtual e nenhum dinheiro real é movido.' : ''}
        Para mudar de chave (teste ↔ real) altere <strong>BIGBANG_API_KEY</strong> no Railway.</p>
      ${test}</div>`;
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
  <div class="panel">${winhousePanel(f.winhouse)}</div>`;
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
    <p class="muted">Ao vivo: ${lv ? `${lv.live} jogos, ${lv.withOdds} com odds, ${lv.finished} terminados, ${lv.review} para rever (${esc(fmtDateTime(lv.at))})` : 'ainda não lido'} ·
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
      <pre class="raw-odds hidden" id="whOut"></pre>` : ''}<br>`;
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
  async 'promo-config'(form) {
    const body = { general: { requireKyc: false, methods: [] } };
    for (const el of form.elements) {
      if (!el.name || !el.name.includes('.')) continue;
      const [camp, key] = el.name.split('.');
      body[camp] ||= {};
      if (key === 'methods') { if (el.checked) body.general.methods.push(el.value); continue; }
      if (el.type === 'checkbox') body[camp][key] = el.checked;
      else if (el.type === 'datetime-local') body[camp][key] = el.value ? new Date(el.value).toISOString() : null;
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
  if (action === 'user-balance' || action === 'user-freebet') {
    const what = action === 'user-balance' ? 'saldo da carteira' : 'saldo de FreeBets';
    const v = prompt(action === 'user-balance'
      ? `${actionEl.dataset.name}: valor a juntar ao ${what} em € (ex.: 50). Para retirar, use o sinal menos (ex.: -20).`
      : `${actionEl.dataset.name}: valor da free bet em € (ex.: 10). Fica válida 7 dias.`);
    if (v === null || !v.trim()) return;
    try {
      await api(`/api/admin/users/${actionEl.dataset.id}/${action === 'user-balance' ? 'balance' : 'freebet'}`, { method: 'POST', body: { amount: v.trim() } });
      toast('Feito', `${what[0].toUpperCase()}${what.slice(1)} atualizado.`);
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
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
      const { catalog } = await api('/api/admin/market-catalog/run', { method: 'POST', body: { sample } });
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
  } else if (action === 'wd-approve' || action === 'wd-reject') {
    const verb = action === 'wd-approve' ? 'approve' : 'reject';
    if (!confirm(verb === 'approve' ? 'Aprovar este levantamento (confirmando que a transferência foi feita)?' : 'Rejeitar e devolver o valor ao jogador?')) return;
    try {
      await api(`/api/admin/withdrawals/${actionEl.dataset.id}/${verb}`, { method: 'POST', body: {} });
      toast(verb === 'approve' ? 'Levantamento aprovado' : 'Levantamento rejeitado');
      loadTab();
    } catch (err) { toast('Erro', err.message, 'error'); }
  }
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
