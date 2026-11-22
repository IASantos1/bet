import { nowIso, tx } from './db.js';
import { affiliateConfig, audit } from './affiliates.js';
import { postTransaction } from './wallet.js';

const RATE_BPS = 2000;
const money = (c) => (Number(c || 0) / 100).toFixed(2);
const periodBounds = (period) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) throw new Error('Período inválido. Use AAAA-MM.');
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString(), end: new Date(Date.UTC(y, m, 1)).toISOString() };
};
function priorCarry(db, affiliateId, period, mode) {
  const row = db.prepare(`SELECT closing_carry_cents FROM affiliate_revshare_periods
    WHERE affiliate_user_id = ? AND period < ? AND mode = ? AND status IN ('simulated','approved','paid')
    ORDER BY period DESC LIMIT 1`).get(affiliateId, period, mode);
  return row?.closing_carry_cents || 0;
}

function affiliatePeriod(db, affiliate, period, mode) {
  const { start, end } = periodBounds(period);
  const refs = db.prepare("SELECT referred_user_id FROM referral_attributions WHERE affiliate_user_id = ? AND status <> 'rejected'").all(affiliate.user_id).map((r) => r.referred_user_id);
  if (!refs.length) return { referredPlayers: 0, sportsStake: 0, sportsPayout: 0, casinoStake: 0, casinoPayout: 0, costs: 0, ggr: 0, ngr: 0, openingCarry: priorCarry(db, affiliate.user_id, period, mode), closingCarry: priorCarry(db, affiliate.user_id, period, mode), commission: 0 };

  const marks = refs.map(() => '?').join(',');
  const sports = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN COALESCE(real_stake_cents, 0) > 0 THEN real_stake_cents
        WHEN real_stake_cents IS NULL AND COALESCE(bonus_stake_cents,0)=0 AND COALESCE(freebet_stake_cents,0)=0 THEN stake_cents ELSE 0 END),0) AS stakes,
      COALESCE(SUM(CASE WHEN real_payout_cents IS NOT NULL THEN real_payout_cents
        WHEN real_stake_cents IS NULL AND COALESCE(bonus_stake_cents,0)=0 AND COALESCE(freebet_stake_cents,0)=0 THEN payout_cents ELSE 0 END),0) AS payouts
    FROM bets WHERE user_id IN (${marks}) AND status IN ('won','lost','cashout') AND settled_at >= ? AND settled_at < ?`).get(...refs, start, end);
  const casino = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END),0) AS stakes,
      COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END),0) AS payouts
    FROM casino_moves WHERE user_id IN (${marks}) AND spins_id IS NULL AND created_at >= ? AND created_at < ?`).get(...refs, start, end);
  const cost = db.prepare('SELECT COALESCE(SUM(cost_cents),0) AS cents FROM affiliate_revshare_costs WHERE affiliate_user_id = ? AND period = ?').get(affiliate.user_id, period).cents;
  const sportsStake = sports.stakes || 0;
  const sportsPayout = sports.payouts || 0;
  const casinoStake = casino.stakes || 0;
  const casinoPayout = casino.payouts || 0;
  const ggr = sportsStake - sportsPayout + casinoStake - casinoPayout;
  const ngr = ggr - cost;
  const openingCarry = priorCarry(db, affiliate.user_id, period, mode);
  const netAfterCarry = ngr + openingCarry;
  const closingCarry = Math.min(0, netAfterCarry);
  const commission = Math.floor(Math.max(0, netAfterCarry) * RATE_BPS / 10000);
  return { referredPlayers: refs.length, sportsStake, sportsPayout, casinoStake, casinoPayout, costs: cost, ggr, ngr, openingCarry, closingCarry, commission };
}

export function previewRevshare(db, { period, mode = 'test' } = {}) {
  periodBounds(period);
  if (!['test', 'live'].includes(mode)) throw new Error('Modo de apuramento inválido.');
  const affiliates = db.prepare(`SELECT p.user_id, p.referral_code, p.admin_status, u.name, u.email, u.banned_at
    FROM affiliate_profiles p JOIN users u ON u.id = p.user_id ORDER BY p.user_id`).all();
  const rows = affiliates.map((a) => {
    const calc = affiliatePeriod(db, a, period, mode);
    const blocked = !!a.banned_at || ['suspended', 'blocked'].includes(a.admin_status);
    return { affiliateUserId: a.user_id, name: a.name, email: a.email, code: a.referral_code, blocked,
      ...calc, commission: blocked ? 0 : calc.commission,
      amounts: { sportsStake: money(calc.sportsStake), sportsPayout: money(calc.sportsPayout), casinoStake: money(calc.casinoStake),
        casinoPayout: money(calc.casinoPayout), costs: money(calc.costs), ggr: money(calc.ggr), ngr: money(calc.ngr),
        openingCarry: money(calc.openingCarry), closingCarry: money(calc.closingCarry), commission: money(blocked ? 0 : calc.commission) } };
  });
  const totals = rows.reduce((t, r) => {
    for (const k of ['sportsStake','sportsPayout','casinoStake','casinoPayout','costs','ggr','ngr','commission']) t[k] += r[k];
    return t;
  }, { sportsStake:0, sportsPayout:0, casinoStake:0, casinoPayout:0, costs:0, ggr:0, ngr:0, commission:0 });
  return { period, mode, rateBps: RATE_BPS, costsSource: 'manual', costsWarning: 'Só são deduzidos custos registados em Ajustes de NGR. Custos de fornecedores ainda não integrados não são estimados.', totals: Object.fromEntries(Object.entries(totals).map(([k,v]) => [k, money(v)])), rows };
}

export function simulateRevshare(db, { period, actor }) {
  const cfg = affiliateConfig(db);
  if (cfg.revshareMode !== 'test') throw new Error('Ative o Modo de teste no painel antes de simular.');
  const report = previewRevshare(db, { period, mode: 'test' });
  tx(db, () => {
    for (const r of report.rows) {
      db.prepare(`INSERT INTO affiliate_revshare_periods
        (affiliate_user_id, period, mode, sports_stake_cents, sports_payout_cents, casino_stake_cents, casino_payout_cents,
         cost_cents, ggr_cents, ngr_cents, opening_carry_cents, closing_carry_cents, commission_cents, status, snapshot, created_at, updated_at)
        VALUES (?, ?, 'test', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'simulated', ?, ?, ?)
        ON CONFLICT(affiliate_user_id, period, mode) DO UPDATE SET
          sports_stake_cents=excluded.sports_stake_cents, sports_payout_cents=excluded.sports_payout_cents,
          casino_stake_cents=excluded.casino_stake_cents, casino_payout_cents=excluded.casino_payout_cents,
          cost_cents=excluded.cost_cents, ggr_cents=excluded.ggr_cents, ngr_cents=excluded.ngr_cents,
          opening_carry_cents=excluded.opening_carry_cents, closing_carry_cents=excluded.closing_carry_cents,
          commission_cents=excluded.commission_cents, snapshot=excluded.snapshot, updated_at=excluded.updated_at
        WHERE affiliate_revshare_periods.status = 'simulated'`).run(
          r.affiliateUserId, period, r.sportsStake, r.sportsPayout, r.casinoStake, r.casinoPayout, r.costs,
          r.ggr, r.ngr, r.openingCarry, r.closingCarry, r.commission, JSON.stringify(r), nowIso(), nowIso());
    }
    audit(db, { actor, action: 'revshare.simulate', entityType: 'period', entityId: period, result: 'simulated',
      meta: { rateBps: RATE_BPS, affiliates: report.rows.length, commissionCents: report.rows.reduce((n,r) => n+r.commission,0) } });
  });
  return previewRevshare(db, { period, mode: 'test' });
}


export function closeRevsharePeriod(db, { period, actor }) {
  const cfg = affiliateConfig(db);
  if (cfg.revshareMode !== 'live') throw new Error('O Revenue Share tem de estar em Produção para fechar um período real.');
  const { end } = periodBounds(period);
  if (end > nowIso()) throw new Error('Só é possível fechar meses completos.');
  const pending = db.prepare("SELECT 1 FROM affiliate_revshare_periods WHERE mode='live' AND period < ? AND status='pending_approval' LIMIT 1").get(period);
  if (pending) throw new Error('Existe um período anterior à espera de aprovação.');
  const report = previewRevshare(db, { period, mode: 'live' });
  tx(db, () => {
    for (const r of report.rows) {
      db.prepare(`INSERT INTO affiliate_revshare_periods
        (affiliate_user_id, period, mode, sports_stake_cents, sports_payout_cents, casino_stake_cents, casino_payout_cents,
         cost_cents, ggr_cents, ngr_cents, opening_carry_cents, closing_carry_cents, commission_cents, status, snapshot, created_at, updated_at)
        VALUES (?, ?, 'live', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?)
        ON CONFLICT(affiliate_user_id, period, mode) DO NOTHING`).run(
          r.affiliateUserId, period, r.sportsStake, r.sportsPayout, r.casinoStake, r.casinoPayout, r.costs,
          r.ggr, r.ngr, r.openingCarry, r.closingCarry, r.commission, JSON.stringify(r), nowIso(), nowIso());
    }
    audit(db, { actor, action: 'revshare.period.close', entityType: 'period', entityId: period, result: 'pending_approval',
      meta: { rateBps: RATE_BPS, affiliates: report.rows.length, commissionCents: report.rows.reduce((n,r) => n+r.commission,0) } });
  });
  return revshareHistory(db, { limit: 500 }).filter((r) => r.period === period && r.mode === 'live');
}

export function approveRevsharePeriod(db, id, { actor, reason }) {
  if (affiliateConfig(db).revshareMode !== 'live') throw new Error('Aprovação disponível apenas em Produção.');
  const why = String(reason || '').trim();
  if (why.length < 5) throw new Error('Indique a justificação da aprovação (mínimo 5 caracteres).');
  return tx(db, () => {
    const row = db.prepare("SELECT * FROM affiliate_revshare_periods WHERE id = ? AND mode = 'live'").get(Number(id));
    if (!row) throw new Error('Período de Revenue Share não encontrado.');
    if (row.status !== 'pending_approval') throw new Error('Este período já foi decidido.');
    db.prepare("UPDATE affiliate_revshare_periods SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=? AND status='pending_approval'")
      .run(actor, nowIso(), nowIso(), row.id);
    audit(db, { actor, action: 'revshare.period.approve', entityType: 'period', entityId: row.id, result: 'approved', meta: { period: row.period, reason: why } });
    return db.prepare('SELECT * FROM affiliate_revshare_periods WHERE id = ?').get(row.id);
  });
}

export function payRevsharePeriod(db, id, { actor }) {
  if (affiliateConfig(db).revshareMode !== 'live') throw new Error('Pagamentos disponíveis apenas em Produção.');
  return tx(db, () => {
    const row = db.prepare("SELECT * FROM affiliate_revshare_periods WHERE id = ? AND mode = 'live'").get(Number(id));
    if (!row) throw new Error('Período de Revenue Share não encontrado.');
    if (row.status === 'paid') return row;
    if (row.status !== 'approved') throw new Error('Só períodos aprovados podem ser pagos.');
    const profile = db.prepare('SELECT admin_status FROM affiliate_profiles WHERE user_id = ?').get(row.affiliate_user_id);
    const user = db.prepare('SELECT banned_at FROM users WHERE id = ?').get(row.affiliate_user_id);
    if (!user || user.banned_at || ['blocked','suspended'].includes(profile?.admin_status)) throw new Error('O afiliado está suspenso ou bloqueado.');
    let payoutTxId = null;
    if (row.commission_cents > 0) {
      postTransaction(db, row.affiliate_user_id, row.commission_cents, 'affiliate_commission',
        `Revenue Share ${row.period} · 20% do NGR`, `affiliate-revshare:${row.id}`);
      payoutTxId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
    }
    db.prepare("UPDATE affiliate_revshare_periods SET status='paid', paid_by=?, paid_at=?, payout_tx_id=?, updated_at=? WHERE id=? AND status='approved'")
      .run(actor, nowIso(), payoutTxId, nowIso(), row.id);
    audit(db, { actor, action: 'revshare.period.pay', entityType: 'period', entityId: row.id, result: 'paid',
      meta: { affiliateUserId: row.affiliate_user_id, amountCents: row.commission_cents, payoutTxId } });
    return db.prepare('SELECT * FROM affiliate_revshare_periods WHERE id = ?').get(row.id);
  });
}

export function revshareHistory(db, { limit = 24 } = {}) {
  return db.prepare(`SELECT p.*, u.name, u.email, u.id AS affiliate_user_id FROM affiliate_revshare_periods p
    JOIN users u ON u.id = p.affiliate_user_id ORDER BY p.period DESC, u.name LIMIT ?`).all(Math.min(500, Math.max(1, Number(limit)||24)))
    .map((r) => ({ id:r.id, affiliateUserId:r.affiliate_user_id, name:r.name, email:r.email, period:r.period, mode:r.mode, status:r.status,
      sportsStake:money(r.sports_stake_cents), sportsPayout:money(r.sports_payout_cents), casinoStake:money(r.casino_stake_cents),
      casinoPayout:money(r.casino_payout_cents), costs:money(r.cost_cents), ggr:money(r.ggr_cents), ngr:money(r.ngr_cents),
      openingCarry:money(r.opening_carry_cents), closingCarry:money(r.closing_carry_cents), commission:money(r.commission_cents) }));
}


export function reconcileRevshare(db) {
  const paid = db.prepare(`SELECT COALESCE(SUM(commission_cents),0) AS cents, COUNT(*) AS n
    FROM affiliate_revshare_periods WHERE mode='live' AND status='paid' AND commission_cents > 0`).get();
  const ledger = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS cents, COUNT(*) AS n
    FROM transactions WHERE type='affiliate_commission' AND ref LIKE 'affiliate-revshare:%'`).get();
  return { paid: money(paid.cents), ledger: money(ledger.cents), paidCount: paid.n, ledgerCount: ledger.n,
    ok: paid.cents === ledger.cents && paid.n === ledger.n };
}

export function saveRevshareCost(db, { affiliateUserId, period, costCents, reason, actor }) {
  periodBounds(period);
  if (!Number.isSafeInteger(costCents) || costCents < 0 || costCents > 100000000000) throw new Error('Custo inválido.');
  if (String(reason || '').trim().length < 5) throw new Error('Indique a justificação do custo (mínimo 5 caracteres).');
  if (!db.prepare('SELECT 1 FROM affiliate_profiles WHERE user_id = ?').get(affiliateUserId)) throw new Error('Afiliado não encontrado.');
  tx(db, () => {
    db.prepare(`INSERT INTO affiliate_revshare_costs (affiliate_user_id, period, cost_cents, reason, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(affiliate_user_id, period) DO UPDATE SET cost_cents=excluded.cost_cents, reason=excluded.reason, created_by=excluded.created_by, created_at=excluded.created_at`)
      .run(affiliateUserId, period, costCents, String(reason).trim().slice(0,300), actor, nowIso());
    audit(db, { actor, action: 'revshare.cost.update', entityType: 'affiliate', entityId: affiliateUserId,
      meta: { period, costCents, reason: String(reason).trim().slice(0,300) } });
  });
}
