import type http from 'http';
import type pg from 'pg';
import { randomId } from '../lib/crypto';
import { readJsonBody, sendJson, badRequest, unauthorized } from '../lib/http';
import { requireUser } from '../lib/auth';
import { requestIp } from '../lib/audit';

type UploadDocumentsBody = {
  documents?: Array<{
    type?: string;
    filename?: string;
    mime_type?: string;
    size?: number;
    content_base64?: string;
  }>;
};

type SelfExcludeBody = {
  self_exclude?: boolean;
  until?: string | null;
};

function toBooleanInt(v: any): number {
  if (v === true) return 1;
  if (v === false) return 0;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return 1;
  if (s === '0' || s === 'false' || s === 'no') return 0;
  return 0;
}

export async function handleUsersRoutes(
  pool: pg.Pool,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/users/profile') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const r = await pool.query(`SELECT to_jsonb(p) AS profile FROM profiles p WHERE p.user_id = $1 LIMIT 1`, [u.id]);
    const profile = (r.rows?.[0]?.profile && typeof r.rows[0].profile === 'object') ? r.rows[0].profile : {};

    const selfExclude = toBooleanInt((profile as any).self_exclude);
    const selfExcludeUntilRaw = (profile as any).self_exclude_until;
    const selfExcludeUntil = selfExcludeUntilRaw ? String(selfExcludeUntilRaw) : null;

    sendJson(res, 200, {
      ...(profile as any),
      self_exclude: selfExclude,
      self_exclude_until: selfExcludeUntil,
    });
    return true;
  }

  if (req.method === 'GET' && path === '/api/users/is-operator') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const r = await pool.query(`SELECT to_jsonb(p) AS profile FROM profiles p WHERE p.user_id = $1 LIMIT 1`, [u.id]);
    const profile = (r.rows?.[0]?.profile && typeof r.rows[0].profile === 'object') ? r.rows[0].profile : {};
    const operator = Boolean((profile as any).is_operator);
    sendJson(res, 200, { operator });
    return true;
  }

  // GET /api/users/bonus — the caller's active bonus (if any) and wagering progress (spec §34).
  if (req.method === 'GET' && path === '/api/users/bonus') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const r = await pool.query(
      `SELECT ub.id, ub.amount, ub.wagering_required, ub.wagering_progress, ub.status, ub.granted_at, ub.expires_at,
              c.name AS campaign_name, c.type AS campaign_type, c.minimum_odds
       FROM user_bonuses ub
       JOIN bonus_campaigns c ON c.id = ub.campaign_id
       WHERE ub.user_id = $1 AND ub.status = 'ACTIVE'
       LIMIT 1`,
      [u.id],
    );
    const row = r.rows?.[0];
    if (!row) return sendJson(res, 200, { active: null }), true;

    sendJson(res, 200, {
      active: {
        id: String(row.id),
        campaignName: String(row.campaign_name || ''),
        campaignType: String(row.campaign_type || ''),
        amount: Number(row.amount),
        wageringRequired: Number(row.wagering_required),
        wageringProgress: Number(row.wagering_progress),
        minimumOdds: Number(row.minimum_odds),
        grantedAt: row.granted_at,
        expiresAt: row.expires_at,
      },
    });
    return true;
  }

  if ((req.method === 'POST' || req.method === 'GET') && path === '/api/users/heartbeat') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const now = Date.now();
    await pool.query(
      `INSERT INTO user_presence (user_id, last_seen, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_seen = EXCLUDED.last_seen, updated_at = NOW()`,
      [u.id, now],
    );
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'POST' && path === '/api/users/self-exclude') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const body = await readJsonBody<SelfExcludeBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const enabled = Boolean(body.self_exclude);
    const untilStr = body.until ? String(body.until) : null;
    const until = untilStr ? new Date(untilStr) : null;
    const untilIso = until && Number.isFinite(until.getTime()) ? until.toISOString() : null;

    await pool.query(
      `UPDATE profiles
       SET self_exclude = $2, self_exclude_until = $3, updated_at = NOW()
       WHERE user_id = $1`,
      [u.id, enabled, enabled ? untilIso : null],
    );
    await pool.query(
      `INSERT INTO user_self_exclude_history (id, user_id, action, until, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomId(16), u.id, enabled ? 'enable' : 'disable', enabled ? untilIso : null],
    );

    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'GET' && path === '/api/users/self-exclude/history') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const r = await pool.query(
      `SELECT action, until, created_at
       FROM user_self_exclude_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [u.id],
    );
    const out = (r.rows || []).map((x: any) => ({
      action: String(x.action || ''),
      until: x.until ? new Date(x.until).toISOString() : undefined,
      created_at: x.created_at ? new Date(x.created_at).toISOString() : new Date().toISOString(),
    }));
    sendJson(res, 200, out);
    return true;
  }

  if (req.method === 'GET' && path === '/api/users/documents') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const r = await pool.query(
      `SELECT id, doc_type, filename, mime_type, size_bytes, status, created_at
       FROM user_documents
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [u.id],
    );
    const out = (r.rows || []).map((x: any) => ({
      id: String(x.id),
      type: String(x.doc_type || ''),
      filename: String(x.filename || ''),
      mime_type: String(x.mime_type || ''),
      size: Number(x.size_bytes || 0),
      status: String(x.status || 'SUBMITTED'),
      created_at: x.created_at ? new Date(x.created_at).toISOString() : new Date().toISOString(),
    }));
    sendJson(res, 200, out);
    return true;
  }

  if (req.method === 'POST' && path === '/api/users/documents') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<UploadDocumentsBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const docs = Array.isArray(body.documents) ? body.documents : [];
    if (docs.length === 0) return badRequest(res, 'No documents'), true;

    const ip = requestIp(req);
    let inserted = 0;
    for (const d of docs) {
      const type = String(d?.type || '').trim();
      const filename = String(d?.filename || '').trim();
      const mimeType = String(d?.mime_type || '').trim();
      const size = Number(d?.size || 0);
      const content = String(d?.content_base64 || '').trim();
      if (!type || !filename || !mimeType || !content) continue;

      await pool.query(
        `INSERT INTO user_documents (id, user_id, doc_type, filename, mime_type, size_bytes, content_base64, status, ip_address, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUBMITTED', $8, NOW(), NOW())`,
        [randomId(16), u.id, type, filename, mimeType, Number.isFinite(size) ? size : 0, content, ip || null],
      );
      inserted += 1;
    }

    // A fresh or resubmitted document round moves the KYC state machine back into review
    // (spec §35): NOT_STARTED/REJECTED -> PENDING. An already-verified user re-uploading (e.g. an
    // expired document) also drops back to PENDING rather than silently staying VERIFIED.
    if (inserted > 0) {
      await pool.query(
        `UPDATE profiles SET kyc_status = 'PENDING', updated_at = NOW()
         WHERE user_id = $1 AND kyc_status IN ('NOT_STARTED', 'REJECTED', 'VERIFIED', 'EXPIRED')`,
        [u.id],
      );
    }

    sendJson(res, 200, { ok: true });
    return true;
  }

  // GET /api/users/iban — the saved withdrawal payout details, if any, so the withdrawal form
  // only ever has to ask once. Never returns the full IBAN, only a masked preview.
  if (req.method === 'GET' && path === '/api/users/iban') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const r = await pool.query(
      `SELECT iban, iban_holder_name, nif, document_type, document_number FROM profiles WHERE user_id = $1 LIMIT 1`,
      [u.id],
    );
    const row = r.rows?.[0];
    const iban = String(row?.iban || '').trim();
    if (!iban) {
      sendJson(res, 200, { has_iban: false });
      return true;
    }
    sendJson(res, 200, {
      has_iban: true,
      iban_masked: iban.length > 8 ? `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}` : iban,
      holder_name: String(row?.iban_holder_name || ''),
      nif: String(row?.nif || ''),
      document_type: String(row?.document_type || ''),
      document_number: String(row?.document_number || ''),
    });
    return true;
  }

  // POST /api/users/iban — saves the withdrawal payout details for this account (IBAN, holder
  // name, NIF, and the identity document backing it — Cartão de Cidadão or passport, per Portuguese
  // AML/KYC requirements for who gets paid out). Overwrites any previously saved details.
  if (req.method === 'POST' && path === '/api/users/iban') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<{
      iban?: string;
      holder_name?: string;
      nif?: string;
      document_type?: string;
      document_number?: string;
    }>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const iban = String(body.iban || '').replace(/\s+/g, '').toUpperCase().trim();
    const holderName = String(body.holder_name || '').trim();
    const nif = String(body.nif || '').trim();
    const documentType = String(body.document_type || '').trim().toLowerCase();
    const documentNumber = String(body.document_number || '').trim();

    if (!iban || iban.length < 15) return badRequest(res, 'IBAN inválido'), true;
    if (!holderName) return badRequest(res, 'Nome do titular obrigatório'), true;
    if (!nif || !/^\d{9}$/.test(nif)) return badRequest(res, 'NIF inválido (9 dígitos)'), true;
    if (documentType !== 'cc' && documentType !== 'passport') return badRequest(res, 'Tipo de documento inválido'), true;
    if (!documentNumber) return badRequest(res, 'Número de documento obrigatório'), true;

    await pool.query(
      `UPDATE profiles
       SET iban = $2, iban_holder_name = $3, nif = $4, document_type = $5, document_number = $6, updated_at = NOW()
       WHERE user_id = $1`,
      [u.id, iban, holderName, nif, documentType, documentNumber],
    );

    sendJson(res, 200, {
      ok: true,
      iban_masked: `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`,
      holder_name: holderName,
    });
    return true;
  }

  return false;
}
