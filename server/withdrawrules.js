// Who may withdraw, and how fast (as in Bet62Novo, server/routes/withdrawals.ts):
//   1. one withdrawal at a time — a pending one must be decided first;
//   2. the identity verified (KYC approved by the administrator);
//   3. a bet won after the last deposit — money deposited is played before it leaves (whatever the
//      amount: €10, €20, €150…), so a deposit can never be withdrawn as it came in.
// Up to `instantMaxCents` (€200) a withdrawal is approved at once; above it the team decides in 24–72 h.

const KYC_MESSAGE = {
  pending: 'Os seus documentos estão em análise. Aguarde a aprovação para efetuar levantamentos.',
  rejected: 'A verificação de identidade foi rejeitada. Envie novamente os documentos (Perfil → Verificação) para desbloquear levantamentos.',
  not_submitted: 'Para levantar é necessário verificar a sua identidade: envie os documentos em Perfil → Verificação.',
};

/** Whether this player may ask for a withdrawal now: { eligible, code, message }. */
export function withdrawEligibility(db, user) {
  const open = db.prepare("SELECT id FROM withdrawals WHERE user_id = ? AND status = 'pending' LIMIT 1").get(user.id);
  if (open) {
    return { eligible: false, code: 'WITHDRAWAL_ALREADY_OPEN', message: 'Já tem um levantamento em análise. Aguarde a decisão antes de pedir outro.' };
  }
  const kyc = user.kyc_status || 'not_submitted';
  if (kyc !== 'approved') return { eligible: false, code: 'KYC_REQUIRED', message: KYC_MESSAGE[kyc] || KYC_MESSAGE.not_submitted };
  const lastDeposit = db.prepare("SELECT MAX(created_at) AS at FROM transactions WHERE user_id = ? AND type = 'deposit'").get(user.id).at;
  const won = db.prepare(`SELECT 1 FROM bets WHERE user_id = ? AND status = 'won' AND created_at >= ? LIMIT 1`).get(user.id, lastDeposit || '');
  // Brought from the previous platform having won a bet after their last deposit there, and no
  // deposit here since: the rule is already met.
  const metBefore = !lastDeposit && !!user.novo_can_withdraw;
  if (!won && !metBefore) {
    return {
      eligible: false, code: 'BET_REQUIRED',
      message: lastDeposit
        ? 'Para efetuar um levantamento é necessário vencer uma aposta feita depois do seu último depósito.'
        : 'Para efetuar um levantamento é necessário vencer uma aposta.',
    };
  }
  return { eligible: true, code: null, message: null };
}

/** A withdrawal of this amount: approved at once (up to the instant limit) or for the team (24–72 h). */
export const instantWithdrawal = (amountCents, instantMaxCents) => amountCents <= instantMaxCents;
