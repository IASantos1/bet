import type pg from 'pg';
import { randomId } from './crypto';

/**
 * Audit Log (BET62 spec §41): every administrative action gets a row here. Nothing here is ever
 * UPDATEd or DELETEd by the application — there is no endpoint that touches this table except
 * the insert below, so an operator has no way to erase what they did through the normal API.
 */
export async function writeAuditLog(
  pool: pg.Pool,
  params: {
    operatorId: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (id, operator_id, action, resource_type, resource_id, reason, metadata, ip, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())`,
    [
      randomId(16),
      params.operatorId,
      params.action,
      params.resourceType,
      params.resourceId ?? null,
      params.reason ?? null,
      JSON.stringify(params.metadata ?? {}),
      params.ip ?? null,
    ],
  );
}

/** Best-effort client IP from a Node request, stripping the IPv4-mapped IPv6 prefix. */
export function requestIp(req: { socket?: { remoteAddress?: string | null }; headers?: Record<string, unknown> }): string {
  const xff = req.headers?.['x-forwarded-for'];
  const fromHeader = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff.split(',')[0] : '';
  const raw = String(fromHeader || req.socket?.remoteAddress || '').trim();
  return raw.replace(/^::ffff:/, '');
}
