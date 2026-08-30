import type http from 'http';
import { randomBytes } from 'crypto';

export async function readJsonBody<T = any>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {} as T;
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function sendJson(res: http.ServerResponse, status: number, body: any): void {
  const json = JSON.stringify(body ?? {});
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(json);
}

export function sendText(res: http.ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

export function notFound(res: http.ServerResponse): void {
  sendJson(res, 404, { error: 'Not found' });
}

export function methodNotAllowed(res: http.ServerResponse): void {
  sendJson(res, 405, { error: 'Method not allowed' });
}

export function badRequest(res: http.ServerResponse, message: string): void {
  sendJson(res, 400, { error: message });
}

export function unauthorized(res: http.ServerResponse): void {
  sendJson(res, 401, { error: 'Unauthorized' });
}

export function forbid(res: http.ServerResponse): void {
  sendJson(res, 403, { error: 'Forbidden' });
}

/**
 * Resolves the idempotency key for a money-moving request: an explicit `Idempotency-Key`
 * header wins, then a body field, then `fallback` (a caller-supplied deterministic seed such as
 * a provider transaction id). If none of those are present a fresh random key is generated —
 * that request is still safe (atomic, non-negative-guarded) but a client-side retry of it will
 * not be deduplicated, since nothing ties the two HTTP calls together.
 */
export function resolveIdempotencyKey(req: http.IncomingMessage, body: any, fallback?: string | null): string {
  const header = String(req.headers['idempotency-key'] || '').trim();
  if (header) return header;
  const fromBody = body && typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
  if (fromBody) return fromBody;
  if (fallback) return fallback;
  return `auto:${randomBytes(16).toString('hex')}`;
}

