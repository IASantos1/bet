// Bet62 frontend — vanilla JS single-page app talking to the JSON API in /server.

import { CLIPS, GOAL_HOLD, clipFormat, scorer, situationClip, restartSeen, marketsReopened, createClipGate, createCornerWatch } from './trkclips.js';
import { qualityTier, zoneTier, DANGER } from './trk3dmath.js';
import { colourSportIcon } from './sporticons.js';
import { celebrate } from './winfx.js';

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
  futamericano: { name: 'Futebol Americano', icon: '🏈' },
  basebol: { name: 'Basebol', icon: '⚾' },
  raguebi: { name: 'Râguebi', icon: '🏉' },
  criquete: { name: 'Críquete', icon: '🏏' },
  boxe: { name: 'Boxe', icon: '🥊' },
  mma: { name: 'MMA', icon: '🥋' },
};
/** Sport icons (filter tiles): Phosphor Icons (bold, MIT) as "P:" paths on a 256 grid, "F:" the same
 * with a line under it (futsal), "S:" filled shapes and plain strings line drawings on a 24 grid. */
const SPORT_SVG = {
  popular: 'S:<rect x="3.5" y="3.5" width="4.4" height="4.4" rx=".8"/><rect x="9.8" y="3.5" width="4.4" height="4.4" rx=".8"/><rect x="16.1" y="3.5" width="4.4" height="4.4" rx=".8"/><rect x="3.5" y="9.8" width="4.4" height="4.4" rx=".8"/><rect x="9.8" y="9.8" width="4.4" height="4.4" rx=".8"/><rect x="16.1" y="9.8" width="4.4" height="4.4" rx=".8"/><rect x="3.5" y="16.1" width="4.4" height="4.4" rx=".8"/><rect x="9.8" y="16.1" width="4.4" height="4.4" rx=".8"/><rect x="16.1" y="16.1" width="4.4" height="4.4" rx=".8"/>',
  futebol: 'P:M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm71.88,151.42h-24L166.1,158l11.3-32.94L193.15,120l18.6,14.26A83.42,83.42,0,0,1,199.88,171.42ZM44.25,134.21,62.85,120l15.75,5.11L89.9,158l-9.75,13.42h-24A83.42,83.42,0,0,1,44.25,134.21ZM111.85,148l-9.54-27.77L128,102.56l25.69,17.67L144.15,148Zm80.66-73.73-6.78,22.85-15.81,5.14L140,81.69V65.46l21.22-14.59A84.27,84.27,0,0,1,192.51,74.27ZM94.78,50.87,116,65.46V81.69L86.08,102.26,70.27,97.12,63.49,74.27A84.27,84.27,0,0,1,94.78,50.87Zm13.58,158.79-8.62-24.37L109.39,172h37.22l9.65,13.29-8.62,24.37a83.59,83.59,0,0,1-39.28,0Z',
  futsal: 'F:M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm71.88,151.42h-24L166.1,158l11.3-32.94L193.15,120l18.6,14.26A83.42,83.42,0,0,1,199.88,171.42ZM44.25,134.21,62.85,120l15.75,5.11L89.9,158l-9.75,13.42h-24A83.42,83.42,0,0,1,44.25,134.21ZM111.85,148l-9.54-27.77L128,102.56l25.69,17.67L144.15,148Zm80.66-73.73-6.78,22.85-15.81,5.14L140,81.69V65.46l21.22-14.59A84.27,84.27,0,0,1,192.51,74.27ZM94.78,50.87,116,65.46V81.69L86.08,102.26,70.27,97.12,63.49,74.27A84.27,84.27,0,0,1,94.78,50.87Zm13.58,158.79-8.62-24.37L109.39,172h37.22l9.65,13.29-8.62,24.37a83.59,83.59,0,0,1-39.28,0Z',
  andebol: 'P:M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm71.88,151.42h-24L166.1,158l11.3-32.94L193.15,120l18.6,14.26A83.42,83.42,0,0,1,199.88,171.42ZM44.25,134.21,62.85,120l15.75,5.11L89.9,158l-9.75,13.42h-24A83.42,83.42,0,0,1,44.25,134.21ZM111.85,148l-9.54-27.77L128,102.56l25.69,17.67L144.15,148Zm80.66-73.73-6.78,22.85-15.81,5.14L140,81.69V65.46l21.22-14.59A84.27,84.27,0,0,1,192.51,74.27ZM94.78,50.87,116,65.46V81.69L86.08,102.26,70.27,97.12,63.49,74.27A84.27,84.27,0,0,1,94.78,50.87Zm13.58,158.79-8.62-24.37L109.39,172h37.22l9.65,13.29-8.62,24.37a83.59,83.59,0,0,1-39.28,0Z',
  basquetebol: 'P:M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20ZM60,177.28A83.59,83.59,0,0,1,44.87,140H75.14A83.1,83.1,0,0,1,60,177.28ZM44.87,116A83.59,83.59,0,0,1,60,78.72,83.1,83.1,0,0,1,75.14,116ZM116,211.13a83.63,83.63,0,0,1-39-16.46A106.94,106.94,0,0,0,99.34,140H116ZM116,116H99.34A106.94,106.94,0,0,0,77,61.33a83.63,83.63,0,0,1,39-16.46Zm80-37.28A83.59,83.59,0,0,1,211.13,116H180.86A83.1,83.1,0,0,1,196,78.72ZM140,211.13V140h16.66A106.94,106.94,0,0,0,179,194.67,83.63,83.63,0,0,1,140,211.13ZM156.66,116H140V44.87a83.63,83.63,0,0,1,39,16.46A106.94,106.94,0,0,0,156.66,116ZM196,177.28A83.1,83.1,0,0,1,180.86,140h30.27A83.59,83.59,0,0,1,196,177.28Z',
  voleibol: 'P:M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20ZM96.83,50a83.49,83.49,0,0,1,17.92-5A84,84,0,0,1,161.26,116H134.93Zm38.1,90h76.2a83.37,83.37,0,0,1-4.69,18,84.07,84.07,0,0,1-84.68,4.79Zm76.2-24H185.29a107.43,107.43,0,0,0-14.4-49.71A108.71,108.71,0,0,0,159.5,50.15,84.21,84.21,0,0,1,211.13,116ZM76.07,62.05,89,84.39a107.44,107.44,0,0,0-35.85,37.32,108.9,108.9,0,0,0-8.28,18A83.65,83.65,0,0,1,76.07,62.05ZM62.79,180.87A84,84,0,0,1,101,105.2L114.14,128,76.07,194A84.68,84.68,0,0,1,62.79,180.87Zm34,25.11,12.92-22.37A107.41,107.41,0,0,0,160,196a109,109,0,0,0,19.59-1.78A83.72,83.72,0,0,1,96.83,206Z',
  tenis: '<circle cx="12" cy="12" r="9"/><path d="M6 5.3a9 9 0 0 1 0 13.4M18 5.3a9 9 0 0 0 0 13.4"/>',
  hoquei: '<path d="M18.5 3l-6.2 15.2a2 2 0 0 1-1.9 1.3H6.5a1.5 1.5 0 0 1 0-3h3l5.6-13.5"/><ellipse cx="5" cy="11" rx="2.4" ry="1.2"/>',
  dardos: 'P:M229.26,90.4a108,108,0,0,1-177.63,114A108,108,0,0,1,195.41,43.63l20.1-20.11a12,12,0,0,1,17,17l-96,96a12,12,0,1,1-17-17l24-24a36,36,0,1,0,19.76,39.65,12,12,0,0,1,23.53,4.74,60,60,0,1,1-25.73-62L178.3,60.74a84,84,0,1,0,28.46,38,12,12,0,1,1,22.5-8.35Z',
  esports: 'P:M176,116H152a12,12,0,0,1,0-24h24a12,12,0,0,1,0,24ZM104,92h-4V88a12,12,0,0,0-24,0v4H72a12,12,0,0,0,0,24h4v4a12,12,0,0,0,24,0v-4h4a12,12,0,0,0,0-24ZM244.76,202.94a40,40,0,0,1-61,5.35,7,7,0,0,1-.53-.56L144.67,164H111.33L72.81,207.73c-.17.19-.35.38-.53.56A40,40,0,0,1,4.62,173.05a1.18,1.18,0,0,1,0-.2L21,88.79A63.88,63.88,0,0,1,83.88,36H172a64.08,64.08,0,0,1,62.93,52.48,1.8,1.8,0,0,1,0,.19l16.36,84.17a1.77,1.77,0,0,1,0,.2A39.74,39.74,0,0,1,244.76,202.94ZM172,140a40,40,0,0,0,0-80H83.89A39.9,39.9,0,0,0,44.62,93.06a1.55,1.55,0,0,0,0,.21l-16.34,84a16,16,0,0,0,13,18.44,16.07,16.07,0,0,0,13.86-4.21L96.9,144.07a12,12,0,0,1,9-4.07Zm55.76,37.31-7-35.95a63.84,63.84,0,0,1-44.27,22.46l24.41,27.72a16,16,0,0,0,26.85-14.23Z',
  tenismesa: 'P:M243.93,195.71a20,20,0,0,0-8-14.41L203,155.17l12.1-12.1a43.66,43.66,0,0,0,12.11-39.4,103.52,103.52,0,0,0-36.81-60.23A106.19,106.19,0,0,0,122.52,20,104.29,104.29,0,0,0,20,122.52a106.17,106.17,0,0,0,23.43,67.85,103.52,103.52,0,0,0,60.23,36.81,43.64,43.64,0,0,0,39.39-12.11L155.17,203l26.13,32.95a20,20,0,0,0,14.41,8c.55,0,1.1.07,1.66.07a20,20,0,0,0,14.13-5.86l26.64-26.64A19.94,19.94,0,0,0,243.93,195.71ZM44,122.86C44.6,80,80,44.6,122.86,44a81.92,81.92,0,0,1,65.2,31L75,188.06a81.92,81.92,0,0,1-31-65.2ZM197.71,218l-32.1-40.49A12,12,0,0,0,156.9,173l-.69,0a12,12,0,0,0-8.49,3.51L126.09,198.1h0a19.72,19.72,0,0,1-17.75,5.54,76.28,76.28,0,0,1-11.68-3.33L200.31,96.66a76.28,76.28,0,0,1,3.33,11.68,19.72,19.72,0,0,1-5.54,17.75l-21.63,21.63a12,12,0,0,0,1,17.89L218,197.71Z',
  badminton: '<path d="M8 14l-3-9 4 1 3-3 3 3 4-1-3 9z"/><path d="M8 14h8M9 14v2a3 3 0 0 0 6 0v-2"/>',
  futamericano: '<ellipse cx="12" cy="12" rx="10" ry="5.6" transform="rotate(-45 12 12)"/><path d="M9.5 14.5l5-5M10.3 11.7l2 2M12.3 9.7l2 2"/>',
  basebol: '<circle cx="12" cy="12" r="9"/><path d="M7 4.6a9 9 0 0 1 0 14.8M17 4.6a9 9 0 0 0 0 14.8M5.2 9h2.6M5.2 15h2.6M16.2 9h2.6M16.2 15h2.6"/>',
  raguebi: '<ellipse cx="12" cy="12" rx="10" ry="6"/><path d="M2.6 12h18.8M9 10.3v3.4M12 10.3v3.4M15 10.3v3.4"/>',
  criquete: '<path d="M14.5 3.5l3 3-9 9-3-3z"/><path d="M5.5 12.5l-2.5 2.5 3 3 2.5-2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  boxe: '<path d="M7 11V8a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v5a5 5 0 0 1-5 5H9.5A3.5 3.5 0 0 1 6 14.5V13a2 2 0 0 1 1-2z"/><path d="M7 11h5a2 2 0 0 1 0 4H9M8 18v3h9v-3"/>',
  mma: '<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/><path d="M8 12h8M12 8v8"/>',
  resultados: 'P:M229,45a12,12,0,0,0-12.85,1.84c-24.71,21.41-44.53,13.31-74.82-1.68C113.19,31.27,78.17,13.94,40.14,46.88A12,12,0,0,0,36,56V224a12,12,0,0,0,24,0V181.71c22.84-17.13,42.1-9.11,70.68,5,16.23,8,34.74,17.2,54.8,17.2,14.72,0,30.28-4.94,46.38-18.88A12,12,0,0,0,236,176V56A12,12,0,0,0,229,45ZM185.48,83.91A63,63,0,0,0,212,78.08v32.15c-11,8.26-21.2,10.67-32,9.37V83.66C181.81,83.81,183.64,83.91,185.48,83.91ZM156,78.08v34.09c-4.64-2-9.5-4.4-14.68-7A255.21,255.21,0,0,0,116,93.83V59.75c4.64,2,9.5,4.4,14.68,7A252.91,252.91,0,0,0,156,78.08ZM92,52.32V88.24a63.33,63.33,0,0,0-32,5.61V61.68C71,53.42,81.2,51,92,52.32ZM86.52,148A63,63,0,0,0,60,153.86V121.7c11-8.25,21.2-10.66,32-9.36v35.94C90.19,148.13,88.36,148,86.52,148ZM116,153.86V119.77c4.64,2,9.5,4.4,14.68,7A252.91,252.91,0,0,0,156,138.1v34.09c-4.64-2.05-9.5-4.4-14.68-7A250.66,250.66,0,0,0,116,153.86Zm64,25.76V143.68c1.81.14,3.64.24,5.48.24A62.85,62.85,0,0,0,212,138.07v32.19C201,178.52,190.8,180.92,180,179.62Z',
};
function sportIcon(k) {
  const colour = colourSportIcon(k);
  if (colour) return colour;
  const v = SPORT_SVG[k] || SPORT_SVG.futebol;
  const kind = v.slice(0, 2);
  if (kind === 'P:' || kind === 'F:') {
    const paths = v.slice(2).split('|').map((d) => `<path d="${d}"/>`).join('');
    return kind === 'P:' ? `<svg viewBox="0 0 256 256" width="30" height="30" fill="currentColor" aria-hidden="true">${paths}</svg>`
      : `<svg viewBox="0 0 256 256" width="30" height="30" fill="currentColor" aria-hidden="true"><g transform="translate(30 10) scale(.766)">${paths}</g><rect x="44" y="226" width="168" height="18" rx="9"/></svg>`;
  }
  if (kind === 'S:') return `<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true">${v.slice(2)}</svg>`;
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${v}</svg>`;
}
/** A sport's colour icon at a given size (lists, headings, menu), its emoji when it has none. */
const sportBadge = (k, size = 18) => colourSportIcon(k, size) || SPORT_META[k]?.icon || '🏆';
// The tennis mini court (live tracker) is hidden for now; true shows it again (its code is kept).
const TENNIS_COURT = false;
const CODE_LABEL = { 1: 'Casa', X: 'Empate', 2: 'Fora' };
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
  fsExpanded: false,
  liveTv: false, liveSport: '',
  leagueTree: null, sideOpen: {}, leagueView: null,
  match: { id: null, data: null, extras: null, insights: null, picks: null, statTab: 'aovivo', tab: 'mercados', cat: 'todos', view: 'tracker', es: null, timer: null, ball: null, trail: [], actions: [], live: null, streaming: false },
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

// The same read asked twice at once (a poll and a render) goes to the server once.
const inflight = new Map();
/**
 * One API call. A read gives up after `timeoutMs` and, when the network failed (not the server),
 * is tried once more; a write is never repeated (it could be applied twice).
 */
function api(path, { method = 'GET', body, timeoutMs = method === 'GET' ? 15_000 : 30_000 } = {}) {
  if (method !== 'GET') return apiOnce(path, { method, body, timeoutMs });
  if (inflight.has(path)) return inflight.get(path);
  const p = apiOnce(path, { method, timeoutMs })
    .catch((err) => (err.network ? new Promise((r) => setTimeout(r, 600)).then(() => apiOnce(path, { method, timeoutMs })) : Promise.reject(err)))
    .finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

async function apiOnce(path, { method = 'GET', body, timeoutMs = 15_000 } = {}) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctl?.signal,
    });
  } catch (cause) {
    const err = new Error(ctl?.signal.aborted ? 'O servidor demorou demasiado a responder. Tente novamente.' : 'Sem ligação. Verifique a internet e tente novamente.');
    err.network = true;
    err.cause = cause;
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
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

/**
 * Asks every registered player whether they want promotions by email and SMS (those from before the
 * sign-up box, or who never answered); a "not now" is asked again 30 days later. Closing the window
 * asks again on a later visit. Only those who say yes receive the campaigns.
 */
const PROMO_ASK_AGAIN_MS = 30 * 86_400_000;
function askPromos() {
  const u = state.user;
  if (!u || u.role !== 'user' || state.promoAsked || u.prefs?.notifyPromos) return;
  if (u.prefs?.promoAsked && u.promoAskedAt && Date.now() - Date.parse(u.promoAskedAt) < PROMO_ASK_AGAIN_MS) return;
  if (u.excludedUntil && new Date(u.excludedUntil) > new Date()) return;
  if (!$('#modalBackdrop').classList.contains('hidden') || playingCasino()) return;
  state.promoAsked = true;
  openModal('Promoções e bónus', `<div class="promo-ask">
    <div class="promo-ask-icon">🎁</div>
    <p><b>Quer receber as nossas promoções por email${u.phone ? ' e SMS' : ''}?</b></p>
    <p class="muted">FreeBets, Free Spins, bónus de depósito e odds aumentadas — só para quem aceita. Pode desligar a qualquer momento em Perfil → Notificações.</p>
    <div class="promo-ask-acts"><button class="outline-btn" data-action="promo-answer" data-yes="0">Agora não</button><button class="primary-btn" data-action="promo-answer" data-yes="1">Sim, quero receber</button></div>
  </div>`);
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
        <label class="check"><input name="promos" type="checkbox"> <span>Quero receber promoções e ofertas por email e SMS (pode desligar a qualquer momento).</span></label>
        <label class="check"><input name="pep" type="checkbox"> <span>Sou pessoa politicamente exposta (PEP), familiar ou próximo de uma.</span></label>
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
  // No main market but others to bet on (pre-match too): straight to them, as in play.
  if (!sels.length && e.marketCount > 0 && isOpen(e)) return `<a class="odds-state bet-now" href="#/jogo/${e.id}">Aposte já</a>`;
  if (!sels.length) return '<div class="odds-off">Apostas indisponíveis neste jogo</div>';
  return `<div class="odds${sels.length === 2 ? ' two' : ''}">${sels.map((s) => {
    const prev = state.previousOdds.get(s.id);
    const move = prev && prev !== s.odds ? (s.odds > prev ? ' up' : ' down') : '';
    const locked = !s.active || !isOpen(e);
    const label = labels === 'name' ? (s.code === '1' ? tname(e, 'home') : s.code === '2' ? tname(e, 'away') : 'Empate') : s.code;
    return `<button class="odd-btn${inSlip(s.id) ? ' selected' : ''}${move}${locked ? ' locked' : ''}" data-sel="${s.id}" ${locked ? 'disabled' : ''}>
      <small>${esc(label)}</small>${locked ? '🔒' : fmtOdds(s.odds)}</button>`;
  }).join('')}</div>`;
}

/** Club badge from the data provider, falling back to initials (see the image error listener). */
// A team without a badge: its real kit picture, else a shirt in its real kit colours (both found
// with the badge, teamlogos.js);
// the house's colours for the clubs set in server/kits.js; a plain neutral shirt while none is known.
const SAFE_HEX = /^#[0-9a-f]{6}$/i;
function kitOf(name, kit) {
  const [a, b] = Array.isArray(kit) ? kit.filter((c) => SAFE_HEX.test(c)) : [];
  if (a) return [a, b || (a.toLowerCase() === '#ffffff' ? '#111827' : '#ffffff')];
  return ['#9aa4b1', '#d7dce3'];
}
const SHIRT = 'M11.5 4 5 7l-3 7 4.2 2 2.3-3.2V28h15V12.8l2.3 3.2 4.2-2-3-7-6.5-3c-.9 1.8-2.6 2.9-4.5 2.9S12.4 5.8 11.5 4z';
let jerseyN = 0;
function jerseySvg(name, kit) {
  const [a, b] = kitOf(name, kit);
  // A house kit (server/kits.js) may add stripes or sleeves of another colour: "stripes:#hex" / "sleeves:#hex".
  const [kind, extra] = String((Array.isArray(kit) && kit[2]) || '').split(':');
  const id = `kc${++jerseyN}`;
  const pattern = !SAFE_HEX.test(extra || '') ? ''
    : kind === 'stripes' ? `<clipPath id="${id}"><path d="${SHIRT}"/></clipPath><g clip-path="url(#${id})" fill="${extra}"><rect x="9.6" y="0" width="3.2" height="32"/><rect x="15.4" y="0" width="3.2" height="32"/><rect x="21.2" y="0" width="3.2" height="32"/></g>`
      : kind === 'sleeves' ? `<path d="M5 7l-3 7 4.2 2 2.3-3.2V8.2zM27 7l3 7-4.2 2-2.3-3.2V8.2z" fill="${extra}"/>` : '';
  return `<svg class="team-kit" viewBox="0 0 32 32" aria-hidden="true"><path d="${SHIRT}" fill="${a}"/>${pattern}<path d="${SHIRT}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".8" stroke-linejoin="round"/>`
    + `<path d="M11.5 4c.9 1.8 2.6 2.9 4.5 2.9s3.6-1.1 4.5-2.9" fill="none" stroke="${b}" stroke-width="1.6"/><path d="M2.6 12.6l3.9 1.9M29.4 12.6l-3.9 1.9" stroke="${b}" stroke-width="1.6"/></svg>`;
}
// Pictures that failed to load: the next refresh draws their replacement straight away (no blink).
const BROKEN_IMG = new Set();
function teamBadge(logo, name, size = '', fallback = null, kit = null, alt = null) {
  if (logo && BROKEN_IMG.has(logo)) {
    if (alt && !BROKEN_IMG.has(alt)) { logo = alt; alt = null; }
    else if (fallback && !BROKEN_IMG.has(fallback)) { logo = fallback; fallback = null; size = `${size} flag`.trim(); }
    else logo = null;
  }
  const cls = `team-icon${size ? ` ${size}` : ''}`;
  const kitAttr = kit === false ? ' data-kit="none"' : Array.isArray(kit) ? ` data-kit="${esc(kit.join(','))}"` : '';
  if (!logo && kit === false) return `<div class="${cls}">${esc(size.split(' ').includes('mini') ? initials(name).slice(0, 1) : initials(name))}</div>`;
  if (!logo) return `<div class="${cls} kit">${jerseySvg(name, kit)}</div>`;
  return `<div class="${cls} has-logo" data-initials="${esc(initials(name))}" data-name="${esc(name)}"${kitAttr}><img class="team-logo" src="${esc(logo)}" alt="" loading="lazy"${fallback ? ` data-fallback="${esc(fallback)}"` : ''}${alt && alt !== logo ? ` data-alt="${esc(alt)}"` : ''}></div>`;
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
Object.assign(COUNTRY_FLAG, {
  angola: 'ao', bahrain: 'bh', belarus: 'by', 'bosnia and herzegovina': 'ba', kazakhstan: 'kz', 'costa rica': 'cr', estonia: 'ee',
  georgia: 'ge', guatemala: 'gt', honduras: 'hn', 'faroe islands': 'fo', india: 'in', indonesia: 'id', iran: 'ir',
  'northern ireland': 'gb-nir', jamaica: 'jm', jordan: 'jo', kuwait: 'kw', luxembourg: 'lu', 'north macedonia': 'mk',
  montenegro: 'me', nicaragua: 'ni', nigeria: 'ng', 'new zealand': 'nz', panama: 'pa', singapore: 'sg', thailand: 'th',
  tanzania: 'tz', tunisia: 'tn', uzbekistan: 'uz', vietnam: 'vn', philippines: 'ph', lithuania: 'lt', rwanda: 'rw', malaysia: 'my', 'hong kong': 'hk', 'chinese taipei': 'tw', macau: 'mo',
});
// Countries whose cups are listed too (footballdivisions.js CUP_ONLY).
Object.assign(COUNTRY_FLAG, {
  russia: 'ru', bolivia: 'bo', lithuania: 'lt', latvia: 'lv', malta: 'mt', moldova: 'md', albania: 'al', armenia: 'am',
  azerbaijan: 'az', kosovo: 'xk', andorra: 'ad', 'san marino': 'sm', gibraltar: 'gi', liechtenstein: 'li', 'el salvador': 'sv',
  'dominican republic': 'do', algeria: 'dz', 'south africa': 'za', ghana: 'gh', kenya: 'ke', zambia: 'zm', uganda: 'ug',
  cameroon: 'cm', senegal: 'sn', 'ivory coast': 'ci', mozambique: 'mz', 'cape verde': 'cv', iraq: 'iq',
  'united arab emirates': 'ae', oman: 'om', lebanon: 'lb', syria: 'sy', malaysia: 'my', 'hong kong': 'hk', myanmar: 'mm',
  cambodia: 'kh', bangladesh: 'bd', mongolia: 'mn', kyrgyzstan: 'kg', tajikistan: 'tj', turkmenistan: 'tm', philippines: 'ph',
  rwanda: 'rw', ethiopia: 'et', libya: 'ly', sudan: 'sd', zimbabwe: 'zw', botswana: 'bw', haiti: 'ht',
  'trinidad and tobago': 'tt', cuba: 'cu', 'chinese taipei': 'tw', macau: 'mo', brunei: 'bn', nepal: 'np', 'sri lanka': 'lk',
  pakistan: 'pk', palestine: 'ps', yemen: 'ye',
});
const REGION_ICON = { africa: '🌍', europe: '🌍', 'south america': '🌎', 'north america': '🌎', asia: '🌏', world: '🌐', atp: '🎾', wta: '🎾', challengers: '🎾' };
// Sidebar countries in Portuguese (the league tree names them in English, as the provider does).
const COUNTRY_PT = {
  germany: 'Alemanha', angola: 'Angola', 'saudi arabia': 'Arábia Saudita', argentina: 'Argentina', australia: 'Austrália',
  austria: 'Áustria', bahrain: 'Bahrein', belgium: 'Bélgica', belarus: 'Bielorrússia', 'bosnia and herzegovina': 'Bósnia e Herzegovina',
  brazil: 'Brasil', bulgaria: 'Bulgária', canada: 'Canadá', kazakhstan: 'Cazaquistão', 'czech republic': 'Chéquia', chile: 'Chile',
  china: 'China', cyprus: 'Chipre', colombia: 'Colômbia', 'south korea': 'Coreia do Sul', 'costa rica': 'Costa Rica',
  croatia: 'Croácia', denmark: 'Dinamarca', egypt: 'Egipto', ecuador: 'Equador', scotland: 'Escócia', slovakia: 'Eslováquia',
  slovenia: 'Eslovénia', spain: 'Espanha', 'united states': 'Estados Unidos da América', estonia: 'Estónia', europe: 'Europa',
  finland: 'Finlândia', france: 'França', georgia: 'Geórgia', greece: 'Grécia', guatemala: 'Guatemala', honduras: 'Honduras',
  hungary: 'Hungria', 'faroe islands': 'Ilhas Faroé', india: 'Índia', indonesia: 'Indonésia', england: 'Inglaterra',
  world: 'Internacional', iran: 'Irão', ireland: 'Irlanda', 'northern ireland': 'Irlanda do Norte', iceland: 'Islândia',
  israel: 'Israel', italy: 'Itália', jamaica: 'Jamaica', japan: 'Japão', jordan: 'Jordânia', kuwait: 'Kuwait',
  luxembourg: 'Luxemburgo', 'north macedonia': 'Macedónia do Norte', morocco: 'Marrocos', mexico: 'México',
  montenegro: 'Montenegro', nicaragua: 'Nicarágua', nigeria: 'Nigéria', norway: 'Noruega', 'new zealand': 'Nova Zelândia',
  wales: 'País de Gales', netherlands: 'Países Baixos', panama: 'Panamá', paraguay: 'Paraguai', peru: 'Peru', poland: 'Polónia',
  portugal: 'Portugal', qatar: 'Qatar', romania: 'Roménia', serbia: 'Sérvia', singapore: 'Singapura', sweden: 'Suécia',
  switzerland: 'Suíça', thailand: 'Tailândia', tanzania: 'Tanzânia', tunisia: 'Tunísia', turkey: 'Turquia', ukraine: 'Ucrânia',
  uruguay: 'Uruguai', uzbekistan: 'Uzbequistão', venezuela: 'Venezuela', vietnam: 'Vietname', africa: 'África',
  'south america': 'América do Sul', 'north america': 'América do Norte', asia: 'Ásia', russia: 'Rússia', bolivia: 'Bolívia',
  philippines: 'Filipinas', rwanda: 'Ruanda', lithuania: 'Lituânia', malaysia: 'Malásia', 'hong kong': 'Hong Kong', 'chinese taipei': 'Taipé Chinesa', macau: 'Macau',
};
Object.assign(COUNTRY_PT, {
  russia: 'Rússia', bolivia: 'Bolívia', lithuania: 'Lituânia', latvia: 'Letónia', malta: 'Malta', moldova: 'Moldávia',
  albania: 'Albânia', armenia: 'Arménia', azerbaijan: 'Azerbaijão', kosovo: 'Kosovo', andorra: 'Andorra',
  'san marino': 'São Marino', gibraltar: 'Gibraltar', liechtenstein: 'Liechtenstein', 'el salvador': 'El Salvador',
  'dominican republic': 'República Dominicana', algeria: 'Argélia', 'south africa': 'África do Sul', ghana: 'Gana',
  kenya: 'Quénia', zambia: 'Zâmbia', uganda: 'Uganda', cameroon: 'Camarões', senegal: 'Senegal',
  'ivory coast': 'Costa do Marfim', mozambique: 'Moçambique', 'cape verde': 'Cabo Verde', iraq: 'Iraque',
  'united arab emirates': 'Emirados Árabes Unidos', oman: 'Omã', lebanon: 'Líbano', syria: 'Síria', malaysia: 'Malásia',
  'hong kong': 'Hong Kong', myanmar: 'Myanmar', cambodia: 'Camboja', bangladesh: 'Bangladesh', mongolia: 'Mongólia',
  kyrgyzstan: 'Quirguistão', tajikistan: 'Tajiquistão', turkmenistan: 'Turquemenistão', philippines: 'Filipinas',
  rwanda: 'Ruanda', ethiopia: 'Etiópia', libya: 'Líbia', sudan: 'Sudão', zimbabwe: 'Zimbabué', botswana: 'Botsuana',
  haiti: 'Haiti', 'trinidad and tobago': 'Trindade e Tobago', cuba: 'Cuba', 'chinese taipei': 'Taipé Chinesa', macau: 'Macau',
  brunei: 'Brunei', nepal: 'Nepal', 'sri lanka': 'Sri Lanka', pakistan: 'Paquistão', palestine: 'Palestina', yemen: 'Iémen',
});
const countryLabel = (country) => COUNTRY_PT[String(country || '').toLowerCase().trim()] || country;

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
  // Players (tennis, darts…) have no shirt: initials when there is no photo nor flag.
  const solo = ['tenis', 'tenismesa', 'badminton', 'dardos', 'boxe', 'mma'].includes(e.sport);
  // No badge: the team's real kit picture (the drawn shirt if it does not load).
  const kitImg = e[`${side}KitImg`];
  if (!logo && !solo && kitImg) return teamBadge(kitImg, e[side], `${size} kit-photo`.trim(), null, e[`${side}Kit`]);
  // Player photos (and any player picture) are round.
  return teamBadge(logo, e[side], flag || solo ? `${size} player`.trim() : size, flag, solo ? false : e[`${side}Kit`], e[`${side}LogoAlt`]);
}

function matchCard(e, extraClass = '') {
  const modifier = typeof extraClass === 'string' && extraClass ? ` ${extraClass}` : '';
  return `<article class="match-card clickable${modifier}" data-open="${e.id}">
    <div class="match-top"><span>${esc(e.competition)}</span><span>${e.status === 'live' ? liveClock(e) : esc(fmtWhen(e.startTime))}</span></div>
    <div class="teams">
      <div class="team">${sideBadge(e, 'home')}${esc(tname(e, 'home'))}${redCard(e, 'home')}</div>
      <div class="vs">${e.status !== 'live' ? 'VS' : e.sport === 'tenis' ? `<b>${esc((tennisPoints(e.tennis?.point) || ['', '']).join(' - ')) || '·'}</b>` : `<b>${e.homeScore ?? 0}-${e.awayScore ?? 0}</b>`}</div>
      <div class="team">${sideBadge(e, 'away')}${esc(tname(e, 'away'))}${redCard(e, 'away')}</div>
    </div>
    ${oddsButtons(e)}
  </article>`;
}

// ---------- match banners (home): the stadium photo, both teams' shirts, the time and the 1X2 ----------

// A team's three letters on its shirt's badge ("SL Benfica" → BEN, "Gil Vicente FC" → GIL): not the club's crest.
const ABBR_SKIP = /^(fc|cf|ac|afc|sc|sl|cd|ud|ca|rc|ss|ssc|as|us|sv|vfb|vfl|tsg|fk|nk|sk|ks|bk|if|ik|aik|real|sporting|club|clube|cd|1\.?)$/i;
/** The team's name to show: the short one when it is long (server/shortnames.js). */
const tname = (e, side) => e?.[`${side}Short`] || e?.[side] || '';
function teamAbbr(name) {
  const words = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  const main = words.find((w) => !ABBR_SKIP.test(w) && /[a-z]/i.test(w)) || words[0] || '?';
  return main.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
}
let bigShirtN = 0;
/** A big shirt for the banners: the team's kit colours (stripes / sleeves too) and its badge on the chest (its letters without one). */
function bannerShirt(name, kit, side = 'away', logo = null) {
  // The badge where a shirt has it: the wearer's left chest (the right of the picture); the home shirt
  // lies over the away one so both stay in view.
  const bx = 128;
  const [a, b] = kitOf(name, kit);
  const [kind, extra] = String((Array.isArray(kit) && kit[2]) || '').split(':');
  const id = `bs${++bigShirtN}`;
  const body = 'M62 18 30 31 6 82l31 15 13-25v124h100V72l13 25 31-15-24-51-32-13c-6 16-21 25-38 25S68 34 62 18z';
  const pattern = !SAFE_HEX.test(extra || '') ? ''
    : kind === 'stripes' ? `<g clip-path="url(#${id}c)" fill="${extra}">${[62, 86, 110, 134].map((x) => `<rect x="${x}" y="0" width="12" height="210"/>`).join('')}</g>`
      : kind === 'sleeves' ? `<g clip-path="url(#${id}c)" fill="${extra}"><path d="M0 0h50v210H0zM150 0h50v210h-50z"/></g>` : '';
  const letters = teamAbbr(name);
  return `<svg class="mb-shirt" viewBox="0 0 200 206" aria-hidden="true"><defs><clipPath id="${id}c"><path d="${body}"/></clipPath>
      <linearGradient id="${id}g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient></defs>
    <path d="${body}" fill="${a}"/>${pattern}<path d="${body}" fill="url(#${id}g)"/>
    <path d="M62 18c6 16 21 25 38 25s32-9 38-25" fill="none" stroke="${b}" stroke-width="7" stroke-linecap="round"/>
    <path d="M8 78l28 13M192 78l-28 13" stroke="${b}" stroke-width="7" stroke-linecap="round"/>
    ${logo ? `<image href="${esc(logo)}" x="${bx - 20}" y="60" width="40" height="40" preserveAspectRatio="xMidYMid meet"/>`
      : `<circle cx="${bx}" cy="78" r="15" fill="${b}" stroke="${a}" stroke-width="2.5"/><text x="${bx}" y="81.5" text-anchor="middle" font-size="10" font-weight="800" fill="${a}" font-family="system-ui,sans-serif">${esc(letters)}</text>`}
    <path d="${body}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
/** The competition's country, for its flag on the banner: "England. Premier League" → England, else the sidebar tree's. */
function compCountry(e) {
  const lead = /^([^.]+)\.\s/.exec(e.competition)?.[1];
  if (lead && COUNTRY_FLAG[lead.toLowerCase().trim()]) return lead;
  for (const c of state.leagueTree?.[e.sport] || []) if (c.leagues.some((l) => l.name === e.competition)) return c.country;
  return null;
}
function matchBanner(e) {
  const sels = e.selections || [];
  const country = compCountry(e);
  // Each outcome's chance from the prices (the margin taken out), as a bar under its button.
  const inv = sels.map((x) => (x.odds > 1 ? 1 / x.odds : 0));
  const sum = inv.reduce((t, v) => t + v, 0) || 1;
  const fav = inv.indexOf(Math.max(...inv));
  // In play with the 1X2 closed (or not worth it) and other markets open: "Aposte já", as in the list.
  const open = sels.filter((x) => x.active);
  const betNow = e.status === 'live' && e.marketCount > 0 && (!open.length || open.length < sels.length || open.some((x) => x.odds <= SHORT_FAVOURITE));
  // "Amanhã 20:45": the day small on top, the hour under it.
  const w = String(fmtWhen(e.startTime));
  const cut = w.lastIndexOf(' ');
  const when = e.status === 'live' ? `<span class="mb-score">${e.homeScore ?? 0} - ${e.awayScore ?? 0}</span>${liveClock(e)}`
    : cut > 0 ? `<span class="mb-day">${esc(w.slice(0, cut))}</span><span class="mb-time">${esc(w.slice(cut + 1))}</span>` : `<span class="mb-time">${esc(w)}</span>`;
  return `<div class="mb-card"><article class="mb-banner">
    <a class="mb-head" href="#/jogo/${e.id}">${sportBadge(e.sport, 22)}${country ? countryFlag(country) : ''}<span>${esc(leagueShort(e.competition))}</span><strong class="brand-word small mb-brand">BET<span>62</span></strong></a>
    <a class="mb-shirts" href="#/jogo/${e.id}" aria-label="${esc(`${e.home} vs ${e.away}`)}"><span class="mb-kit home">${bannerShirt(tname(e, 'home'), e.homeKit, 'home', e.homeLogo || e.homeLogoAlt)}</span><span class="mb-kit away">${bannerShirt(tname(e, 'away'), e.awayKit, 'away', e.awayLogo || e.awayLogoAlt)}</span></a>
    <a class="mb-teams" href="#/jogo/${e.id}"><b title="${esc(e.home)}">${esc(tname(e, 'home'))}</b><span class="mb-when">${when}</span><b title="${esc(e.away)}">${esc(tname(e, 'away'))}</b></a>
  </article>
  ${betNow ? `<div class="mb-odds one"><a class="odds-state bet-now mb-betnow" href="#/jogo/${e.id}">Aposte já</a></div>` : `<div class="mb-odds">${sels.map((x, i) => {
      const locked = !x.active || !isOpen(e);
      const title = x.code === '1' ? e.home : x.code === '2' ? e.away : 'Empate';
      return `<div class="mb-pick"><button class="odd-btn mb-odd${inSlip(x.id) ? ' selected' : ''}${locked ? ' locked' : ''}" data-sel="${x.id}" title="${esc(title)}" ${locked ? 'disabled' : ''}><small>${x.code === '1' || x.code === '2' ? x.code : 'X'}</small>${locked ? '🔒' : fmtOdds(x.odds)}</button>
        <svg class="mb-bar${i === fav ? ' fav' : ''}" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="6" rx="3"/><rect class="mb-fill" width="${Math.max(3, Math.round((inv[i] / sum) * 100))}" height="6" rx="3"/></svg></div>`;
    }).join('')}</div>`}</div>`;
}
/** The banners' games: football with the full 1X2, live or in the next 3 days, the big ones first. */
function bannerEvents(limit = 6) {
  const until = Date.now() + 3 * 86_400_000;
  const ok = state.events.filter((e) => e.sport === 'futebol' && (e.selections || []).length === 3 && (e.selections || []).every((x) => x.code === '1' || x.code === 'X' || x.code === '2')
    && (e.status === 'live' || (e.status === 'scheduled' && new Date(e.startTime).getTime() < until)));
  const rank = (a, b) => (b.featured - a.featured) || (!!b.bigTeam - !!a.bigTeam) || ((a.tier ?? 9) - (b.tier ?? 9)) || a.startTime.localeCompare(b.startTime);
  // Big and medium leagues only (the operator's featured games too), and both shirts in their own colours.
  const coloured = (kit) => Array.isArray(kit) && SAFE_HEX.test(kit[0] || '');
  return ok.filter((e) => (e.featured || (e.tier ?? 9) <= 2) && coloured(e.homeKit) && coloured(e.awayKit)).sort(rank).slice(0, limit);
}
function bannerSection() {
  const list = bannerEvents();
  return list.length ? `<section class="section mb-section">${carousel('carBanner', list.map(matchBanner))}</section>` : '';
}

function homeSpotlight(event) {
  return `<div class="home-feature" data-ball="${esc(event.sport)}">
    <div class="home-feature-label">JOGO EM DESTAQUE</div>
    ${matchCard(event, 'home-feature-match')}
    <a class="home-feature-link" href="#/jogo/${event.id}">Ver jogo completo <span aria-hidden="true">→</span></a>
  </div>`;
}

/** In play: the match time in red after a pulsing dot (45', S1, Q3, P2…) instead of "AO VIVO". */
// Sports played in sets: the clock is the set being played ("2.º set"); tennis from its board, the
// others from the sets already won. Basketball ("Q3 04:12"), ice hockey ("2.º P 12:30") and the
// minute sports ("67'") come ready from the server.
const SET_SPORTS = new Set(['tenis', 'tenismesa', 'badminton', 'voleibol']);
const currentSet = (e) => (e.sport === 'tenis' && e.tennis?.set) || (Number(e.homeScore) || 0) + (Number(e.awayScore) || 0) + 1;
const clockLabel = (e) => (SET_SPORTS.has(e.sport) ? `${currentSet(e)}.º set` : e.clock || 'Ao vivo');
function liveClock(e) {
  const text = clockLabel(e);
  return `<span class="live-clock"><i class="pulse-dot"></i>${esc(text)}</span>`;
}

/** Tennis in play: the set being played and the point (15 / 30 / 40 / AD) under it. */
function tennisLiveCell(e) {
  const t = e.tennis || {};
  const pts = tennisPoints(t.point);
  return `${liveClock(e)}<span class="tn-point">${pts ? `${esc(pts[0])} - ${esc(pts[1])}` : ''}</span>`;
}

/** Tennis on a card (live page, lists): who serves, the games of the set being played (in gold) and
 * the point (15 / 30 / 40 / AD) in a grey box shared by both players. */
function tennisCardPoint(e, side) {
  const t = e.tennis || {};
  const i = side === 'home' ? 0 : 1;
  const cur = (t.sets || [])[(t.sets || []).length - 1];
  const pts = tennisPoints(t.point);
  // Fixed columns (serve dot, games, point) so the two players' numbers sit exactly one under the other.
  return `<span class="tn-card ${side}"><i class="tn-serve${t.server === side ? '' : ' off'}"${t.server === side ? ' title="Ao serviço"' : ''}></i><em>${cur ? esc(String(cur[i])) : ''}</em><strong>${pts ? esc(pts[i]) : ''}</strong></span>`;
}
/** Above the two players: which set the games are from ("S2"), over the games column. */
const tennisCardHead = (e) => `<div class="tn-head"><span></span><span class="tn-card head"><i class="tn-serve off"></i><em>S${currentSet(e)}</em><strong></strong></span></div>`;

/** Per-player tennis line: sets won, games in the current set and the point, with the server marked. */
function tennisSide(e, side) {
  const t = e.tennis || {};
  const i = side === 'home' ? 0 : 1;
  const cur = (t.sets || [])[(t.sets || []).length - 1];
  const pts = tennisPoints(t.point);
  return `<span class="tn-line">${t.server === side ? '<i class="tn-serve" title="Ao serviço"></i>' : ''}<b>${side === 'home' ? e.homeScore ?? 0 : e.awayScore ?? 0}</b>${cur ? `<em>${cur[i]}</em>` : ''}${pts ? `<strong>${esc(pts[i])}</strong>` : ''}</span>`;
}

/** A side's red cards in play: a small red card with how many (nothing when none). */
function redCard(e, side) {
  const n = Number(e.redCards?.[side]) || 0;
  return n > 0 ? ` <i class="red-card" title="${n} ${n === 1 ? 'cartão vermelho' : 'cartões vermelhos'}">${n}</i>` : '';
}

function liveCard(e) {
  if (e.sport === 'tenis') {
    return `<article class="live-card clickable" data-open="${e.id}">
    <div class="match-top">${liveClock(e)}<span>${esc(e.competition)}</span></div>
    <div class="live-teams tn-board">${tennisCardHead(e)}<div><span>${sideBadge(e, 'home', 'mini')}${esc(tname(e, 'home'))}</span>${tennisCardPoint(e, 'home')}</div><div><span>${sideBadge(e, 'away', 'mini')}${esc(tname(e, 'away'))}</span>${tennisCardPoint(e, 'away')}</div></div>
    ${oddsButtons(e, { labels: 'name' })}
  </article>`;
  }
  return `<article class="live-card clickable" data-open="${e.id}">
    <div class="match-top">${liveClock(e)}<span>${esc(e.competition)}</span></div>
    <div class="live-teams"><div><span>${sideBadge(e, 'home', 'mini')}${esc(tname(e, 'home'))}${redCard(e, 'home')}</span><b>${e.homeScore ?? 0}</b></div><div><span>${sideBadge(e, 'away', 'mini')}${esc(tname(e, 'away'))}${redCard(e, 'away')}</span><b>${e.awayScore ?? 0}</b></div></div>
    ${oddsButtons(e, { labels: 'name' })}
  </article>`;
}

function eventRow(e) {
  const tennisLive = e.status === 'live' && e.sport === 'tenis';
  const when = e.status === 'live'
    ? liveClock(e)
    : esc(fmtWhen(e.startTime)).replace(' ', '<br>');
  const score = (side) => (tennisLive ? tennisCardPoint(e, side === 'h' ? 'home' : 'away')
    : e.status === 'live' ? `<b>${side === 'h' ? e.homeScore ?? 0 : e.awayScore ?? 0}</b>` : '');
  return `<div class="event-row clickable" data-open="${e.id}">
    <div class="event-time">${when}</div>
    <div class="event-teams">
      <div><span>${sideBadge(e, 'home', 'mini')}${esc(tname(e, 'home'))}${redCard(e, 'home')}</span>${score('h')}</div>
      <div><span>${sideBadge(e, 'away', 'mini')}${esc(tname(e, 'away'))}${redCard(e, 'away')}</span>${score('a')}</div>
    </div>
    ${oddsButtons(e)}
  </div>`;
}

/** `insert` (html) goes right after the `after`-th event of the list (the block is split there). */
function groupByCompetition(events, { after = 0, insert = '', limit = Infinity } = {}) {
  const groups = new Map();
  const ordered = [...events].sort((a, b) => (sportRank(a.sport) - sportRank(b.sport)) || byPriority(a, b));
  for (const e of ordered) {
    const key = `${e.sport}|${e.competition}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  let seen = 0;
  let pending = !!insert && after > 0;
  const html = [...groups.entries()].slice(0, limit).map(([key, list]) => {
    const [sport, comp] = key.split('|');
    const logo = list.find((e) => e.leagueLogo)?.leagueLogo;
    const icon = logo
      ? `<span class="league-logo" data-sport-icon="${esc(sport)}"><img class="league-img" src="${esc(logo)}" alt="" loading="lazy"></span>`
      : `<span class="league-logo">${sportBadge(sport)}</span>`;
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
const SPORT_ORDER = ['futebol', 'basquetebol', 'tenis', 'futamericano', 'hoquei', 'boxe', 'voleibol', 'andebol', 'dardos', 'mma', 'raguebi', 'futsal',
  'basebol', 'criquete', 'tenismesa', 'badminton'];
const sportRank = (s) => { const i = SPORT_ORDER.indexOf(s); return i < 0 ? 99 : i; };

/** Live: the operator's featured, then by league (big 1, medium 2, small 3, the rest), then the earliest. */
const liveRank = (a, b) => (b.featured - a.featured) || ((a.tier ?? 9) - (b.tier ?? 9)) || a.startTime.localeCompare(b.startTime);
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
    <div class="car-track" data-hscroll="${id}">${cards.join('')}</div>
    <button class="car-btn next" data-action="car-next" data-target="${id}" aria-label="Seguinte">›</button>
  </div>`;
}

// The side menu's invitation card: the offer and the link to copy or share.
function affSideHtml() {
  const a = state.affHome;
  if (!a?.enabled || !a.referralUrl || a.uid !== state.user?.id) return '';
  const url = esc(a.referralUrl);
  return `<section class="aff-side">
    <div class="aff-side-top"><span class="aff-side-badge"><b>${a.commission.rate}%</b></span>
      <div><small>🎁 Programa de convites</small><b>Convide amigos e ganhe ${a.commission.rate}% do 1.º depósito</b></div></div>
    <div class="aff-side-link">${url.replace(/^https?:\/\//, '')}</div>
    <div class="aff-side-btns"><button class="aff-btn copy" data-aff-copy="${url}" data-aff-label="Link copiado">Copiar link</button>
      ${navigator.share ? `<button class="aff-btn share" data-aff-share="${url}">Partilhar</button>` : ''}</div>
    <a class="aff-side-more" href="#/perfil/afiliados">Ver regras e comissões ›</a></section>`;
}
function renderSideInvite() {
  const box = $('#sideInvite');
  if (!box) return;
  if (state.user && state.affHome?.uid !== state.user.id) { loadAffHome(); return; }
  const html = state.user ? affSideHtml() : '';
  if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
}
async function loadAffHome() {
  const uid = state.user.id;
  state.affHome = { uid };
  try { state.affHome = { ...(await api('/api/affiliates/me')), uid }; } catch { state.affHome = { enabled: false, uid }; }
  renderSideInvite();
}

// Home: the leagues people look for first (then the busiest others), as cards with a round badge.
const TOP_LEAGUES = [
  ['futebol', /premier league/i, 'england'], ['futebol', /la ?liga|primera divisi/i, 'spain'], ['futebol', /s[eé]rie a/i, 'italy'],
  ['futebol', /bundesliga/i, 'germany'], ['futebol', /ligue 1/i, 'france'], ['futebol', /liga portugal|primeira liga|betclic/i, 'portugal'],
  ['futebol', /champions league/i, null], ['futebol', /europa league/i, null], ['futebol', /conference league/i, null],
  ['futebol', /eredivisie/i, 'netherlands'], ['futebol', /s[eé]rie a|brasileir/i, 'brazil'],
  ['basquetebol', /\bnba\b/i, null], ['basquetebol', /euroleague|euroliga/i, null],
  ['futamericano', /\bnfl\b/i, null], ['hoquei', /\bnhl\b/i, null], ['andebol', /ehf champions league|^champions league/i, null], ['voleibol', /superlega|cev champions league/i, null],
];
function popularLeagues(max = 16, only = '') {
  const all = [];
  for (const [sport, tree] of Object.entries(state.leagueTree || {})) {
    if (only && sport !== only) continue;
    for (const c of tree) for (const l of c.leagues) if (l.count) all.push({ sport, country: c.country, ...l });
  }
  const picked = [];
  const used = new Set();
  const take = (l) => { if (l && !used.has(`${l.sport}|${l.name}`)) { used.add(`${l.sport}|${l.name}`); picked.push(l); } };
  for (const [sport, re, country] of TOP_LEAGUES) {
    take(all.find((l) => l.sport === sport && re.test(l.name) && (!country || String(l.country).toLowerCase() === country)));
  }
  for (const l of [...all].sort((a, b) => b.count - a.count)) { if (picked.length >= max) break; take(l); }
  return picked.slice(0, max);
}
// Official logos (API-Football league ids, served from /league-logo/<id>): [regex on the league's own
// name, country or null, id]. Football only; the others keep the country's flag.
const LEAGUE_LOGOS = [
  [/^premier league$/i, 'england', 39], [/^championship$/i, 'england', 40], [/^fa cup$/i, 'england', 45],
  [/^(la ?liga|primera divisi[oó]n)$/i, 'spain', 140], [/segunda divisi[oó]n|la ?liga 2|laliga2/i, 'spain', 141], [/copa del rey/i, 'spain', 143],
  [/^s[eé]rie a$/i, 'italy', 135], [/^s[eé]rie b$/i, 'italy', 136], [/coppa italia/i, 'italy', 137],
  [/^bundesliga$/i, 'germany', 78], [/^2\.? ?bundesliga$/i, 'germany', 79], [/dfb.?pokal/i, 'germany', 81],
  [/^ligue 1$/i, 'france', 61], [/^ligue 2$/i, 'france', 62], [/coupe de france/i, 'france', 66],
  [/^(primeira liga|liga portugal( betclic)?|betclic)$/i, 'portugal', 94], [/(segunda liga|liga portugal 2)/i, 'portugal', 95], [/ta[cç]a de portugal/i, 'portugal', 96],
  [/^eredivisie$/i, 'netherlands', 88], [/eerste divisie/i, 'netherlands', 89], [/(pro league|jupiler)/i, 'belgium', 144],
  [/^premiership$/i, 'scotland', 179], [/s[uü]per lig/i, 'turkey', 203], [/super league/i, 'greece', 197], [/super league/i, 'switzerland', 207],
  [/^bundesliga$/i, 'austria', 218], [/superliga/i, 'denmark', 119], [/allsvenskan/i, 'sweden', 113], [/eliteserien/i, 'norway', 103],
  [/ekstraklasa/i, 'poland', 106], [/(czech liga|first league|chance liga)/i, 'czech republic', 345],
  [/champions league/i, null, 2], [/europa league/i, null, 3], [/conference league/i, null, 848], [/libertadores/i, null, 13],
  [/sudamericana/i, null, 11], [/world cup/i, null, 1], [/(euro championship|^euro\b)/i, null, 4], [/nations league/i, null, 5],
  [/^s[eé]rie a$|brasileir/i, 'brazil', 71], [/^s[eé]rie b$/i, 'brazil', 72], [/liga profesional|primera divisi[oó]n/i, 'argentina', 128],
  [/^(mls|major league soccer)$/i, 'usa', 253], [/liga mx/i, 'mexico', 262], [/(pro league|saudi)/i, 'saudi arabia', 307], [/j1 league/i, 'japan', 98],
];
const leagueLogoId = (l) => (l.sport !== 'futebol' ? null : LEAGUE_LOGOS.find(([re, country]) => re.test(leagueShort(l.name))
  && (!country || String(l.country || '').toLowerCase().trim() === country))?.[2] || null);
const ICON_LEAGUE_SPORTS = new Set(['mma', 'boxe', 'criquete', 'dardos']);
const LOGO_SPORTS = new Set(['basquetebol', 'hoquei', 'voleibol', 'andebol', 'futamericano', 'basebol', 'raguebi']);
function leagueBadge(l) {
  const k = String(l.country || '').toLowerCase().trim();
  const code = COUNTRY_FLAG[k];
  const flag = code ? `https://flagcdn.com/w80/${code}.png` : '';
  const logo = leagueLogoId(l);
  // The league's own logo; if it cannot be loaded, the country's flag takes its place.
  // Other sports: looked up by name on the server (API-Sports of that sport).
  const src = logo ? `/league-logo/${logo}` : LOGO_SPORTS.has(l.sport)
    ? `/league-logo/0?s=${l.sport}&n=${encodeURIComponent(l.name)}&c=${encodeURIComponent(l.country || '')}` : '';
  if (src) return `<span class="lg-badge logo"><img class="lg-logo" src="${esc(src)}" data-flag="${esc(flag)}" data-icon="${REGION_ICON[k] || '🌍'}" alt="" loading="lazy" decoding="async"></span>`;
  // Fights, cricket and darts have no league logos (API-Sports has none): the sport's own icon.
  if (ICON_LEAGUE_SPORTS.has(l.sport)) return `<span class="lg-badge sport">${sportIcon(l.sport)}</span>`;
  const pic = flag ? `<img src="${flag}" alt="" loading="lazy" decoding="async">` : `<i>${REGION_ICON[k] || (l.sport === 'tenis' ? '🎾' : '🌍')}</i>`;
  return `<span class="lg-badge">${pic}</span>`;
}
// A league's name on its card: "UFC Fight Night. 31.10.26" is the event, not the date; WinHouse's
// boxing "Fights" is the sport's.
function leagueCardName(l) {
  const short = leagueShort(l.name);
  if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(short)) return String(l.name).split('.')[0].trim();
  if (l.sport === 'boxe' && /^fights?$/i.test(short)) return 'Combates de boxe';
  return short;
}
// The leagues people look for first, as cards (home page; the sports page, of the sport chosen there).
function leagueRow(sport = '') {
  const leagues = popularLeagues(16, sport);
  if (!leagues.length) return '';
  return `<section class="lg-row" data-hscroll="leagueRow" aria-label="Ligas">
    ${leagues.map((l) => `<a class="lg-card" href="#/desporto/liga/${encodeURIComponent(l.name)}">${leagueBadge(l)}<b>${esc(l.label || leagueCardName(l))}</b></a>`).join('')}
  </section>`;
}

/** The top of the home page: the casino's games as round icons in a row that scrolls sideways. */
function casinoBubbles() {
  const games = state.casinoLobby?.rows?.[0]?.games?.length ? state.casinoLobby.rows[0].games
    : state.casino.enabled ? (state.casino.games || []).slice(0, 12) : [];
  if (!games.length) return '';
  return `<section class="cb-row" data-hscroll="casinoRow" aria-label="Jogos de casino">
    ${games.slice(0, 15).map((g) => `<button class="cb-game" data-game-id="${g.id}"><span class="cb-ring">${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy" decoding="async">` : '<i>🎰</i>'}</span><small>${esc(String(g.name).replace(/[™®©]/g, '').trim())}</small></button>`).join('')}
    <a class="cb-game cb-all" href="#/casino"><span class="cb-ring"><i>›</i></span><small>Ver todos</small></a>
  </section>`;
}

function homePage() {
  const livePool = pickHighlights(state.events.filter((e) => e.status === 'live'));
  const upcomingPool = pickHighlights(state.events.filter((e) => e.status === 'scheduled'));
  const spotlight = livePool[0] || upcomingPool.find((e) => e.featured) || upcomingPool[0] || null;
  const live = livePool.filter((e) => e.id !== spotlight?.id);
  const upcoming = upcomingPool.filter((e) => e.id !== spotlight?.id);
  if (!state.featured || Date.now() - state.featured.at > 60_000) loadFeatured();
  const hero = state.user ? '' : `<section class="hero${spotlight ? ' hero-has-feature' : ''}">
      <div class="hero-copy"><div class="eyebrow">A NOVA EXPERIÊNCIA DE APOSTAS</div><h1>Mais mercados.<br>Mais emoção.</h1><p>Uma plataforma clássica, rápida e simples para acompanhar desporto, apostas ao vivo e casino num único lugar.</p>
        <div class="hero-actions"><button class="primary-btn" data-action="register">Criar conta</button><a class="outline-btn" href="#/desporto">Explorar desporto</a></div>
      </div>${spotlight ? homeSpotlight(spotlight) : ''}
    </section>`;
  const memberSpotlight = state.user && spotlight ? `<section class="section">${homeSpotlight(spotlight)}</section>` : '';
  const upcomingSection = upcoming.length || (!spotlight && !upcomingPool.length)
    ? `<section class="section"><div class="section-head"><h2>Eventos em destaque</h2><a href="#/desporto">Todos os eventos ›</a></div>${upcoming.length ? carousel('carPre', upcoming.map(matchCard)) : emptyEvents()}</section>`
    : '';
  return `${casinoBubbles()}${leagueRow()}${state.user ? memberSpotlight : hero}
    ${live.length ? `<section class="section"><div class="section-head"><h2><span class="live-dot"></span>Ao Vivo agora</h2><a href="#/ao-vivo">Ver todos ›</a></div>${carousel('carLive', live.map(liveCard))}</section>` : ''}
    ${builderSection()}
    ${upcomingSection}
    ${accaSection({ home: true })}
    ${footer()}`;
}

const emptyEvents = () => `<div class="panel empty">${state.eventsLoaded ? 'Sem eventos disponíveis de momento.' : 'A carregar eventos…'}</div>`;

/** One league (from the sidebar): all its games of the next month, live first. */
function leaguePage(name) {
  // The sport whose sidebar tree lists this league (football when the tree is not loaded yet).
  const [sport, country, label] = Object.entries(state.leagueTree || {}).map(([sp, tree]) => {
    const group = tree.find((c) => c.leagues.some((l) => l.name === name));
    return [sp, group?.country, group?.leagues.find((l) => l.name === name)?.label];
  }).find(([, c]) => c) || ['futebol', null, null];
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
  return `<div class="page-title"><h1>${esc(label || leagueShort(name))}</h1><p>${esc(countryLabel(country) || SPORT_META[sport]?.name || 'Futebol')} · jogos ao vivo e do próximo mês.</p></div>
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
  // How many league blocks are shown (more load as the page is scrolled); back to the first ones on another sport.
  if (state.sportsShown?.sport !== (state.sport || '')) state.sportsShown = { sport: state.sport || '', n: SPORTS_BLOCK };
  const shown = state.sportsShown.n;
  const blocks = new Set(list.map((e) => `${e.sport}|${e.competition}`)).size;
  if (!state.featured || Date.now() - state.featured.at > 60_000) loadFeatured();
  // The big games' banners under the sports strip (football; all sports or football chosen).
  const banners = !state.sport || state.sport === 'futebol' ? bannerSection() : '';
  return `<div class="page-title"><h1>Desporto</h1>${banners ? '' : '<p>Todos os eventos pré-jogo e ao vivo com odds disponíveis.</p>'}</div>
    <div class="sport-tiles" data-hscroll="sportStrip">
      <button class="sport-tile${!state.sport ? ' active' : ''}" data-sport="">${sportIcon('popular')}<span>Popular</span></button>
      ${sports.map((s) => `<button class="sport-tile${state.sport === s ? ' active' : ''}" data-sport="${esc(s)}">${sportIcon(s)}<span>${esc(SPORT_META[s]?.name || s)}</span></button>`).join('')}
      <a class="sport-tile" href="#/desporto/resultados">${sportIcon('resultados')}<span>Resultados</span></a>
    </div>
    ${banners}${leagueRow(state.sport || '')}
    ${builderSection()}
    <section class="section">${list.length ? groupByCompetition(list, { after: 4, insert: accaSection(), limit: shown }) : emptyEvents()}
      ${blocks > shown ? `<div class="sports-more" id="sportsMore"><div class="loading">A carregar mais jogos…</div></div>` : ''}</section>
    ${blocks > shown ? '' : footer()}`;
}

// The sports page shows its leagues a few blocks at a time: the next ones as the page reaches the end.
// The live page does the same with its games, 12 at a time.
const SPORTS_BLOCK = 8;
const LIVE_BLOCK = 12;
let sportsObserver = null;
function watchSportsMore() {
  sportsObserver?.disconnect();
  const el = $('#sportsMore') || $('#liveMore');
  if (!el || !('IntersectionObserver' in window)) return;
  sportsObserver = new IntersectionObserver((entries) => {
    if (!entries.some((x) => x.isIntersecting)) return;
    sportsObserver.disconnect();
    if (el.id === 'liveMore') state.liveShown.n += LIVE_BLOCK; else state.sportsShown.n += SPORTS_BLOCK;
    render({ keepScroll: true });
  }, { rootMargin: '400px 0px' });
  sportsObserver.observe(el);
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
  return `<div class="combo-card builder" data-ball="${esc(b.legs[0]?.sport || 'futebol')}">
    <div class="combo-head"><div><strong>${esc(b.match)}</strong><small>${esc(shortWhen(b.startTime))}</small></div><span class="combo-icon">${ICON_SLIP}</span></div>
    <ul class="combo-legs">${b.legs.map((l) => `<li><span>${esc(l.marketName)} - </span><b>${esc(l.label)}</b></li>`).join('')}</ul>
    <button class="combo-btn" data-builder="${i}"><strong>${fmtOdds(b.odds)}</strong><small>CRIADOR DE APOSTAS</small></button>
  </div>`;
}

function accaCard(a, i, list = 'accas') {
  return `<div class="combo-card acca${a.big ? ' big' : ''}" data-ball="${esc(a.legs[0]?.sport || 'futebol')}">
    ${a.big ? '<div class="acca-badge">⭐ Grandes favoritos</div>' : ''}
    ${a.legs.map((l) => `<div class="acca-leg">
      <div class="acca-when">${sportBadge(l.sport, 14)} ${esc(shortWhen(l.startTime))}, ${esc(l.home)} - ${esc(l.away)}</div>
      <div class="acca-pick"><div><small>${esc(l.market === 'ml' ? 'Vencedor' : 'Resultado no fim do tempo regulamentar')}</small><b>${esc(l.label)}</b></div><span>${fmtOdds(l.odds)}</span></div>
    </div>`).join('')}
    <div class="acca-last">Início do último jogo: ${esc(shortWhen(a.lastStart))}</div>
    <div class="acca-foot"><span>Odds totais <b>${fmtOdds(a.odds)}</b></span><button class="primary-btn" data-acca="${i}" data-acca-list="${list}">Adicionar ao boletim</button></div>
  </div>`;
}

// "Construa o seu ganho" under the page title; "Apostas vencedoras" after the first four events.
function builderSection() {
  const b = state.featured?.builders;
  return b?.length ? `<section class="section"><div class="section-head"><h2>Construa o seu ganho</h2></div>${carousel('builderCar', b.map(builderCard))}</section>` : '';
}
// The sports page has the usual draw; the home page its own, the big clubs and leagues first.
function accaSection({ home = false } = {}) {
  const list = home ? 'topAccas' : 'accas';
  const a = state.featured?.[list];
  return a?.length ? `<div class="acca-section"><div class="section-head"><h2>🏆 Apostas vencedoras</h2></div>${carousel(home ? 'accaTopCar' : 'accaCar', a.map((x, i) => accaCard(x, i, list)))}</div>` : '';
}

/** A bet builder goes into the slip on its own (its legs are one bet on one match). */
function addBuilder(i) {
  const b = state.featured?.builders?.[i];
  if (!b) return;
  if (state.slip.length) toast('Boletim', 'O criador de apostas substituiu as seleções anteriores.');
  state.slip = [];
  state.builder = { eventId: b.eventId, match: b.match, competition: b.competition, startTime: b.startTime, legs: b.legs.map((l) => ({ ...l })), combo: legKey(b.legs) };
  saveSlip(); syncSelectedButtons(); renderSlip(); setSlipOpen(true);
}
// The picks of a ready-made bet, to tell later whether the slip still holds exactly them.
const legKey = (legs) => legs.map((l) => l.selectionId).sort((a, b) => a - b).join('-');
/** 'acca' while the slip is exactly one of the "Apostas vencedoras" as a multiple. */
const slipOrigin = () => (state.mode === 'multiple' && state.slip[0]?.acca && state.slip[0].acca === legKey(state.slip) ? 'acca' : undefined);

/** A ready-made multiple: its four picks into the slip (replacing other picks on those matches). */
function addAcca(i, list = 'accas') {
  const a = state.featured?.[list === 'topAccas' ? 'topAccas' : 'accas']?.[i];
  if (!a) return;
  state.builder = null;
  const events = new Set(a.legs.map((l) => l.eventId));
  state.slip = state.slip.filter((s) => !events.has(s.eventId));
  const acca = legKey(a.legs);
  for (const l of a.legs) {
    state.slip.push({ acca, selectionId: l.selectionId, eventId: l.eventId, market: l.market, marketName: l.marketName, code: l.code, label: l.label, odds: l.odds, match: `${l.home} vs ${l.away}`, competition: l.competition });
  }
  state.mode = 'multiple';
  saveSlip(); syncSelectedButtons(); renderSlip(); setSlipOpen(true);
  toast('Adicionado ao boletim', `Múltipla de ${a.legs.length} seleções`);
}

/** Shares a link: the phone's share sheet where there is one, else it is copied. */
async function shareLink(url, text) {
  if (navigator.share) {
    try { await navigator.share({ title: 'Bet62', text, url }); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copiado', 'Envie-o a quem quiser: abre o bilhete na Bet62.'); }
  catch { window.prompt('Copie o link do bilhete:', url); }
}

/** A placed ticket (open, in play or settled: only once it is placed): its own link, with the picks, the odds and the result. */
async function shareBet(id, text = null) {
  try {
    const { url } = await api(`/api/bets/${id}/share`, { method: 'POST', body: {} });
    const b = (state.myBets || []).find((x) => x.id === id);
    shareLink(url, text || (b?.status === 'won' ? `Bilhete vencedor na Bet62 🏆 (odd ${fmtOdds(b.totalOdds)})` : 'Vê o meu bilhete na Bet62'));
  } catch (err) { toast('Partilhar', err.message, 'error'); }
}

/** #/b/<token>: a ticket someone shared; its picks still open can be copied into the slip. */
function sharedBetPage(token) {
  const cur = state.sharedBet;
  if (cur?.token !== token) {
    state.sharedBet = { token };
    api(`/api/shared-bets/${encodeURIComponent(token)}`)
      .then((d) => { state.sharedBet = { token, ticket: d.ticket }; })
      .catch((err) => { state.sharedBet = { token, error: err.message }; })
      .finally(() => { if (currentRoute().page === 'b') render({ keepScroll: true }); });
    return '<div class="loading">A carregar o bilhete…</div>';
  }
  if (cur.error) return `<div class="panel empty">${esc(cur.error)}<div class="hero-actions"><a class="outline-btn" href="#/desporto">Ver jogos</a></div></div>${footer()}`;
  if (!cur.ticket) return '<div class="loading">A carregar o bilhete…</div>';
  const t = cur.ticket;
  const open = t.legs.filter((l) => l.selectionId).map((l) => l.selectionId);
  return `<div class="page-title"><h1>🎟️ Bilhete partilhado</h1><p>Um bilhete da Bet62, com as odds e o resultado de cada seleção.</p></div>
    <div class="tickets shared-ticket">${ticketCard(t)}</div>
    <div class="hero-actions shared-actions">${open.length ? `<a class="primary-btn" href="#/bilhete/${open.join('-')}">Copiar ${open.length === t.legs.length ? 'as apostas' : `${open.length} ${open.length === 1 ? 'seleção' : 'seleções'} em aberto`} para o boletim</a>` : ''}
      <a class="outline-btn" href="#/desporto">Ver jogos</a></div>${footer()}`;
}

/**
 * A ticket shared from the Telegram channel (#/bilhete/12-34-56): its picks go into the slip at
 * the current prices (a closed one, or a game already started, is left out), then the sports page.
 */
async function openSharedTicket(ids) {
  location.replace('#/desporto');
  try {
    const { legs, missing } = await api(`/api/slip-legs?ids=${encodeURIComponent(ids)}`);
    if (!legs.length) { toast('Bilhete', 'Os jogos deste bilhete já começaram ou as odds fecharam.'); return; }
    state.builder = null;
    const events = new Set(legs.map((l) => l.eventId));
    state.slip = state.slip.filter((s) => !events.has(s.eventId));
    for (const l of legs) {
      state.slip.push({ selectionId: l.selectionId, eventId: l.eventId, market: l.market, marketName: l.marketName, code: l.code, label: l.label, odds: l.odds, match: `${l.home} vs ${l.away}`, competition: l.competition });
    }
    state.mode = state.slip.length >= 2 ? 'multiple' : 'single';
    saveSlip(); syncSelectedButtons(); renderSlip(); setSlipOpen(true);
    toast('Bilhete adicionado ao boletim', missing ? `${legs.length} seleções (${missing} já não disponível)` : `${legs.length} seleções`);
  } catch (err) { toast('Bilhete', err.message, 'error'); }
}

// A leg the others make certain (double chance covering the result) counts as 1.00, as on the server.
const impliedLeg = (l, legs) => l.market === 'dc' && legs.some((r) => r.market === '1x2' && String(l.code).includes(r.code));
// A card of "Melhores escolhas" carries its boost (b.boost.pct), priced as the server does.
const builderTotal = (b) => Math.round(b.legs.reduce((p, l) => p * (impliedLeg(l, b.legs) ? 1 : l.odds), 1) * (state.config?.builderFactor ?? 1)
  * (1 + (b.boost?.pct || 0) / 100) * 100) / 100;

function resultsPage() {
  setTimeout(async () => {
    try {
      const { events } = await api('/api/results');
      const box = $('#resultsBox');
      if (!box) return;
      box.innerHTML = events.length
        ? `<div class="comp-block">${events.map((e) => `<div class="event-row">
            <div class="event-time">${esc(fmtWhen(e.startTime)).replace(' ', '<br>')}</div>
            <div class="event-teams"><div><span>${esc(tname(e, 'home'))}</span><b>${e.homeScore}</b></div><div><span>${esc(tname(e, 'away'))}</span><b>${e.awayScore}</b></div></div>
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
const ICON_STATS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_PITCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5v14M2 9.5h3v5H2M22 9.5h-3v5h3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

function livePage() {
  const all = state.events.filter((e) => e.status === 'live');
  // TV on: only games with live video. Then the sport chosen in the strip.
  const withTv = state.liveTv ? all.filter((e) => e.stream) : all;
  const present = [...new Set(withTv.map((e) => e.sport))].sort((a, b) => sportRank(a) - sportRank(b));
  if (state.liveSport && !present.includes(state.liveSport)) state.liveSport = '';
  const live = state.liveSport ? withTv.filter((e) => e.sport === state.liveSport) : withTv;
  const tvCount = all.filter((e) => e.stream).length;
  const strip = `<div class="sport-tiles live-sports" data-hscroll="liveSports">
      <button class="sport-tile${!state.liveSport ? ' active' : ''}" data-live-sport="">${sportIcon('popular')}<span>Todos</span><i class="tile-n">${withTv.length}</i></button>
      ${present.map((sp) => `<button class="sport-tile${state.liveSport === sp ? ' active' : ''}" data-live-sport="${esc(sp)}">${sportIcon(sp)}<span>${esc(SPORT_META[sp]?.name || sp)}</span><i class="tile-n">${withTv.filter((e) => e.sport === sp).length}</i></button>`).join('')}
    </div>`;
  // Football first, then the other sports; in each, by league: big, medium, small, the rest.
  const sports = [...new Set(live.map((e) => e.sport))].sort((a, b) => sportRank(a) - sportRank(b));
  // A few games at a time (more as the page is scrolled); back to the first ones on another filter.
  const key = `${state.liveSport || ''}|${state.liveTv ? 1 : 0}`;
  if (state.liveShown?.key !== key) state.liveShown = { key, n: LIVE_BLOCK };
  let left = state.liveShown.n;
  const moreLive = live.length > left;
  const blocks = sports.map((sp) => {
    const list = live.filter((e) => e.sport === sp).sort(liveRank).slice(0, Math.max(0, left));
    left -= list.length;
    if (!list.length) return '';
    return `<section class="section"><div class="section-head"><h2>${sportBadge(sp, 22)} ${esc(SPORT_META[sp]?.name || sp)} <small class="muted">${list.length}</small></h2></div>
      <div class="live-grid grid">${list.map(liveCard).join('')}</div></section>`;
  }).join('');
  const empty = state.liveTv ? 'Nenhum jogo com transmissão ao vivo neste momento.' : 'Não há eventos ao vivo neste momento.';
  // The live data provider is down: its games are hidden (they would show a frozen clock) until it is back.
  const down = state.config?.liveDown
    ? '<div class="panel live-down">⏳ <b>Jogos ao vivo temporariamente indisponíveis.</b> Estamos a receber os dados novamente — os jogos voltam a aparecer aqui em breve. As suas apostas estão guardadas.</div>' : '';
  return `<div class="page-title live-title"><div><h1><span class="live-dot"></span>Ao Vivo</h1><p>Eventos a decorrer agora. As odds atualizam automaticamente.</p></div>
      <button class="tv-toggle${state.liveTv ? ' active' : ''}" data-live-tv title="Só jogos com transmissão" aria-pressed="${state.liveTv}">${ICON_TV}<small>${tvCount}</small></button></div>
    ${down}
    ${all.length ? strip : ''}
    ${live.length ? blocks : `<div class="panel empty">${state.eventsLoaded ? empty : 'A carregar…'}</div>`}
    ${moreLive ? '<div class="sports-more" id="liveMore"><div class="loading">A carregar mais jogos…</div></div>' : footer()}`;
}


function casinoGameCard(g, i) {
  return `<button class="game-card" data-game="${i}">
    <div class="game-art">${g.image ? `<img class="game-img" src="${esc(g.image)}" alt="" loading="lazy">` : '🎰'}</div>
    <div class="game-info"><strong>${esc(g.name)}</strong><small>${esc(g.provider)} · ${esc(g.category)}</small></div></button>`;
}

const CASINO_PAGE = 48;
// A provider, a tab or a search: all its games in one go (e.g. every Pragmatic game).
const CASINO_ALL = 1000;

/** A lobby card (BigBang): opens the game's page. */
const isExclusive = (id) => !!state.casinoLobby?.exclusive?.includes(id);
const lobbyCard = (g) => `<button class="game-card" data-game-id="${g.id}" title="${esc(g.name)}">
    <div class="game-art">${g.image ? `<img class="game-img" src="${esc(g.image)}" alt="" loading="lazy">` : '🎰'}${isExclusive(g.id) ? '<span class="excl-badge">Exclusivo</span>' : ''}</div>
    <div class="game-info"><strong>${esc(g.name)}</strong><small>${esc(g.provider)}</small></div></button>`;

// ---------- "Os meus jogos": played recently (open straight away, ▶) and favourites (♥) ----------
function ensureCasinoMine(force = false) {
  if (!state.user) { state.casinoMine = null; return; }
  const who = state.user.id;
  if (!force && state.casinoMine?.for === who && Date.now() - state.casinoMine.at < 60_000) return;
  state.casinoMine = { ...(state.casinoMine?.for === who ? state.casinoMine : { recent: [], favorites: [] }), for: who, at: Date.now() };
  api('/api/casino/mine').then((r) => {
    if (state.user?.id !== who) return;
    const ids = (x) => JSON.stringify([x.recent, x.favorites, x.forYou || [], ...(x.because || []).map((b) => b.games)].map((l) => l.map((g) => g.id)));
    const before = ids(state.casinoMine);
    Object.assign(state.casinoMine, { recent: r.recent || [], favorites: r.favorites || [], forYou: r.forYou || [], because: r.because || [] });
    const now = ids(state.casinoMine);
    if (now !== before && currentRoute().page === 'casino' && currentRoute().sub !== 'jogar') render({ keepScroll: true });
  }).catch(() => {});
}
const isFavorite = (id) => !!state.casinoMine?.favorites.some((g) => g.id === id);
/** A game played recently: one touch opens it again (the ▶ on the picture). */
const recentCard = (g) => `<button class="game-card recent-card" data-play-id="${g.id}" title="Jogar outra vez">
    <div class="game-art">${g.image ? `<img class="game-img" src="${esc(g.image)}" alt="" loading="lazy">` : '🎰'}<span class="play-badge" aria-hidden="true">▶</span></div>
    <div class="game-info"><strong>${esc(g.name)}</strong><small>${g.playedAt ? playedAgo(g.playedAt) : esc(g.provider)}</small></div></button>`;
/** "há 5 minutos", "há 1 hora", "há 3 dias". */
function playedAgo(iso) {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 60) return `há ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

// The casino's tabs, as chips above the banner: the lobby first, then the kinds of game most looked
// for (Slots, Casino ao Vivo, Roleta, Blackjack…), then the rest of the house tabs that have games.
const CAT_ICON = {
  '': '✨', slots: '🎰', 'ao-vivo': '🔴', roleta: '🎡', blackjack: '🃏', jackpots: '💰', crash: '🚀', populares: '🔥', novos: '🆕',
  baccarat: '🎴', megaways: '⚡', instantaneos: '🎯', mesa: '♠️', exclusivos: '⭐', 'alta-volatilidade': '🌋', 'jackpot-progressivo': '🏆',
};
const CAT_ORDER = ['slots', 'ao-vivo', 'roleta', 'blackjack', 'jackpots', 'crash', 'populares', 'novos'];
function casinoCats() {
  const cats = (state.casinoLobby?.categories || []).map((c) => ({ ...c, at: CAT_ORDER.includes(c.key) ? CAT_ORDER.indexOf(c.key) : 99 }))
    .sort((a, b) => a.at - b.at);
  return state.casino.bigbang && cats.length ? [{ key: '', label: 'Início' }, ...cats]
    : [{ key: '', label: 'Todos' }, { key: 'Slots', label: 'Slots' }, { key: 'Ao Vivo', label: 'Ao Vivo' }];
}
function casinoTabs(f) {
  return `<nav class="casino-chips" data-hscroll="casinoChips" aria-label="Tipos de jogo">${casinoCats().map((c) => `<button class="casino-chip${f.category === c.key && !f.provider && !f.q ? ' active' : ''}" data-casino-cat="${esc(c.key)}">
    <span aria-hidden="true">${CAT_ICON[c.key] || CAT_ICON[String(c.key).toLowerCase()] || '🎲'}</span>${esc(c.label)}</button>`).join('')}</nav>`;
}

/**
 * The casino menu (on the left, like the sports one; on phones behind the ☰ button): search, the
 * tabs and every provider.
 */
function casinoSideMenu() {
  const c = state.casino;
  const f = state.casinoFilter;
  const onLobby = currentRoute().page === 'casino' && !currentRoute().sub;
  const link = (attr, val, icon, label, on, extra = '') => `<button class="side-link${on ? ' active' : ''}" ${attr}="${esc(val)}"${extra}><span>${icon}</span> ${esc(label)}</button>`;
  return `<div class="sidebar-head"><span>CASINO</span><button class="close-mobile" data-close-menu aria-label="Fechar">×</button></div>
    <div class="side-search"><input class="search-input" id="casinoSearch" type="search" placeholder="Procurar jogo ou fornecedor…" value="${esc(f.q || '')}" autocomplete="off" enterkeyhint="search"></div>
    ${casinoCats().map((x) => link('data-casino-cat', x.key, CAT_ICON[x.key] || '🎲', x.label, onLobby && f.category === x.key && !f.provider && !f.q)).join('')}
    ${c.providers?.length ? `<div class="side-divider"></div><div class="sidebar-head">FORNECEDORES</div>
    ${c.providers.map((p) => link('data-casino-prov', p.id, '🎲', `${p.name}${p.maintenance ? ' (manutenção)' : ''}`, onLobby && f.provider === String(p.id), p.maintenance ? ' disabled' : '')).join('')}` : ''}
    <div class="side-divider"></div><div class="sidebar-head">EXPLORAR</div>
    <a class="side-link" href="#/desporto"><span>⚽</span> Desporto</a>
    <a class="side-link" href="#/ao-vivo"><span class="red-icon">●</span> Ao Vivo</a>
    <a class="side-link" href="#/promocoes"><span>🎁</span> Promoções</a>
    <a class="side-link" href="#/perfil/jogo-responsavel"><span>🛡️</span> Jogo responsável</a>`;
}
function renderCasinoSide() {
  const box = $('#casinoSide');
  if (!box) return;
  // Changed in place: the search box keeps its focus and what is being typed.
  if (box.firstChild) morph(box, casinoSideMenu()); else box.innerHTML = casinoSideMenu();
}

async function loadCasinoLobby() {
  loadFreeSpins();
  try {
    state.casinoLobby = await api('/api/casino/lobby');
  } catch { state.casinoLobby = null; }
  const { page, sub } = currentRoute();
  if ((page === 'casino' && !sub) || page === 'home') render({ keepScroll: true });
}

/** The player's free spins: the games to pick from (only the picked one once chosen). */
async function loadFreeSpins() {
  if (!state.user) { state.fsActive = null; state.fsExpanded = false; return; }
  state.fsAt = Date.now();
  try {
    const active = await api('/api/me/free-spins/active');
    if (state.fsActive?.freeSpins?.id !== active?.freeSpins?.id) state.fsExpanded = false;
    state.fsActive = active;
  } catch { state.fsActive = null; state.fsExpanded = false; }
  const { page, sub } = currentRoute();
  if (page === 'casino' && !sub) render({ keepScroll: true });
}

/** The player's free spins, fetched on arrival (another player, or a while since the last look). */
function ensureFreeSpins() {
  if (state.user && (state.fsFor !== state.user.id || Date.now() - (state.fsAt || 0) > 30_000)) {
    state.fsFor = state.user.id;
    state.fsAt = Date.now();
    loadFreeSpins();
  }
}

// ---------- banners at the top of the casino (Admin → Banners) ----------
// Loaded again when the visitor signs in or out (some banners are only for guests or for players).
function ensureCasinoBanners() {
  const who = state.user ? `u${state.user.id}` : 'guest';
  if (state.cbanFor === who && Date.now() - (state.cbanAt || 0) < 5 * 60_000) return;
  state.cbanFor = who;
  state.cbanAt = Date.now();
  api('/api/casino/banners').then((r) => {
    const before = JSON.stringify(state.casinoBanners || []);
    state.casinoBanners = r.banners || [];
    if (JSON.stringify(state.casinoBanners) !== before && currentRoute().page === 'casino' && currentRoute().sub !== 'jogar') render({ keepScroll: true });
  }).catch(() => {});
}

// ---------- destaques: one game shown big between the rows (Admin → Destaques do casino) ----------
function ensureSpotlights() {
  const who = state.user ? `u${state.user.id}` : 'guest';
  if (state.spotFor === who && Date.now() - (state.spotAt || 0) < 5 * 60_000) return;
  state.spotFor = who;
  state.spotAt = Date.now();
  api('/api/casino/spotlights').then((r) => {
    const before = JSON.stringify(state.spotlights || []);
    state.spotlights = r.spotlights || [];
    if (JSON.stringify(state.spotlights) !== before && currentRoute().page === 'casino' && !currentRoute().sub) render({ keepScroll: true });
  }).catch(() => {});
}
/**
 * The card: the operator's wide picture or video when there is one; otherwise the game's own art,
 * blurred as the background and whole on the side. The line of text and "Joga agora!" (opens the game).
 */
function spotlightCard(s) {
  const g = s.game;
  const vid = (src, cls) => `<video class="${cls}" src="${esc(src)}" autoplay muted loop playsinline preload="metadata"></video>`;
  const own = (src, isVid) => (isVid ? vid(src, 'spot-own') : `<img class="spot-own" src="${esc(src)}" alt="" loading="lazy">`);
  // Without its own picture: on computers the art fills the right of the card (fading into the text side);
  // on phones it stands whole.
  const art = g.image ? `<img class="spot-bg" src="${esc(g.image)}" alt="" loading="lazy"><img class="spot-wide" src="${esc(g.image)}" alt="" loading="lazy">
      <img class="spot-art" src="${esc(g.image)}" alt="" loading="lazy">` : '';
  const d = s.img?.d, m = s.img?.m;
  return `<section class="section spot${d ? ' own-d' : ''}${m ? ' own-m' : ''}${s.bare ? ' bare' : ''}" data-key="spot${s.id}">
    <a class="spot-card" href="#/casino/jogo/${g.id}" aria-label="${esc(`${g.name}: ${s.cta || 'Joga agora!'}`)}">
      <div class="spot-media dk">${d ? own(d, s.video?.d) : art}</div>
      <div class="spot-media mb">${m ? own(m, s.video?.m) : art}</div>
      <div class="spot-copy">${s.tagline ? `<strong>${esc(s.tagline)}</strong>` : ''}<small>${esc(g.name)} · ${esc(g.provider)}</small>
        <span class="spot-cta">${esc(s.cta || 'Joga agora!')}</span></div>
    </a></section>`;
}

/** The carousel: one slide per banner (its phone picture on small screens), arrows, dots and the terms. */
function casinoBanners() {
  const list = state.casinoBanners || [];
  if (!list.length) return '';
  const slide = (b, i) => {
    const ext = /^https:/i.test(b.link);
    const tag = b.link ? `a href="${esc(b.link)}"${ext ? ' target="_blank" rel="noopener"' : ''}` : 'div';
    const copy = b.title || b.subtitle || b.cta
      ? `<div class="cban-copy">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}${b.cta ? `<span class="cban-cta">${esc(b.cta)}</span>` : ''}</div>` : '';
    // A video plays muted in a loop (as a picture would show); computer and phone can differ.
    const vid = (src, cls) => `<video class="${cls}" src="${esc(src)}" autoplay muted loop playsinline preload="${i ? 'metadata' : 'auto'}" aria-label="${esc(b.title || 'Promoção')}"></video>`;
    const media = b.video?.d || b.video?.m
      ? `${b.video.d ? vid(b.img.d, 'cban-d') : `<img class="cban-d" src="${esc(b.img.d)}" alt="${esc(b.title || 'Promoção')}">`}${b.img.m !== b.img.d ? (b.video.m ? vid(b.img.m, 'cban-m') : `<img class="cban-m" src="${esc(b.img.m)}" alt="">`) : ''}`
      : `<picture><source media="(max-width: 700px)" srcset="${esc(b.img.m)}"><img src="${esc(b.img.d)}" alt="${esc(b.title || 'Promoção')}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></picture>`;
    return `<${tag} class="cban-slide${b.img.m !== b.img.d && (b.video?.d || b.video?.m) ? ' two' : ''}" data-cban="${i}">${media}${copy}</${tag.split(' ')[0]}>`;
  };
  const many = list.length > 1;
  return `<section class="cban" aria-roledescription="carrossel" aria-label="Promoções do casino">
    <div class="cban-track" id="cbanTrack" data-hscroll="cban">${list.map(slide).join('')}</div>
    ${many ? `<button class="cban-btn prev" data-action="cban-go" data-dir="-1" aria-label="Anterior">‹</button>
      <button class="cban-btn next" data-action="cban-go" data-dir="1" aria-label="Seguinte">›</button>
      <div class="cban-dots">${list.map((_, i) => `<button class="${i ? '' : 'on'}" data-action="cban-dot" data-i="${i}" aria-label="Banner ${i + 1}"></button>`).join('')}</div>` : ''}
  </section>
  <p class="cban-terms" id="cbanTerms">${cbanTerms(list[0])}</p>`;
}
const cbanTerms = (b) => `<b>18+</b> Jogue com responsabilidade.${b?.terms ? ` ${esc(b.terms)}` : ''}`;
/** Which slide is showing (the track scrolls by whole slides). */
const cbanIndex = (t) => Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
function cbanGo(i) {
  const t = $('#cbanTrack');
  if (!t) return;
  const n = t.children.length;
  t.scrollTo({ left: ((i % n) + n) % n * t.clientWidth, behavior: 'smooth' });
}
// The dots and the terms follow the slide on screen (by arrow, dot, swipe or the timer).
document.addEventListener('scroll', (e) => {
  if (e.target?.id !== 'cbanTrack') return;
  const i = cbanIndex(e.target);
  $$('.cban-dots button').forEach((b, k) => b.classList.toggle('on', k === i));
  const terms = $('#cbanTerms');
  const b = (state.casinoBanners || [])[i];
  if (terms && b) terms.innerHTML = cbanTerms(b);
}, true);
// Turns every 6 s, unless the pointer is on it or the tab is hidden.
setInterval(() => {
  const t = $('#cbanTrack');
  if (!t || document.hidden || t.matches(':hover') || t.children.length < 2) return;
  cbanGo(cbanIndex(t) + 1);
}, 6000);

/** A personal, expandable casino banner shown only while the player has active free spins. */
function freeSpinsBar() {
  const d = state.fsActive;
  const games = Array.isArray(d?.games) ? d.games : [];
  if (!d?.freeSpins || !games.length) return '';
  const s = d.freeSpins;
  const chosen = s.chosenGame ? games[0] : null;
  const expanded = Boolean(state.fsExpanded);
  const previewGames = games.slice(0, 5);
  const count = Number(s.spinsLeft ?? s.spins) || 0;
  const gameCards = previewGames.map((g) => `<button class="fs-showcase-game" type="button" data-action="fs-pick" data-id="${esc(g.id)}">
      <span class="fs-showcase-art">${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : '<span class="fs-showcase-fallback" aria-hidden="true">🎰</span>'}
        <span class="fs-showcase-tag">FREE SPINS</span><span class="fs-showcase-play" aria-hidden="true">▶</span></span>
      <span class="fs-showcase-info"><strong title="${esc(g.name)}">${esc(g.name)}</strong>
        <small><span>${esc(g.provider)}</span><b>${fsCount(count)}</b></small></span>
      <span class="fs-showcase-action">${chosen ? 'Jogar agora' : 'Escolher jogo'} <i aria-hidden="true">↗</i></span>
    </button>`).join('');
  const intro = chosen
    ? `As suas Free Spins estão no jogo ${esc(chosen.name)}.`
    : `Escolha 1 dos ${games.length} jogos elegíveis para começar.`;
  return `<section class="fs-banner${expanded ? ' is-open' : ''}" aria-label="Free Spins disponíveis">
    <div class="fs-banner-light" aria-hidden="true"></div>
    <button class="fs-banner-toggle" type="button" data-action="fs-toggle" aria-expanded="${expanded}" aria-controls="fsGameReveal">
      <span class="fs-emblem" aria-hidden="true"><i class="fs-orbit"></i><span class="fs-token"><b>FS</b></span><i class="fs-spark">✦</i></span>
      <span class="fs-banner-copy"><span class="fs-kicker"><i></i> OFERTA ATIVA NO CASINO</span>
        <strong>As tuas Free Spins estão prontas</strong><small>${intro}</small></span>
      <span class="fs-count"><b>${count}</b><small>Free Spins</small></span>
      <span class="fs-cta">${expanded ? 'Fechar jogos' : chosen ? 'Jogar agora' : 'Entrar'}<i aria-hidden="true">${expanded ? '−' : '→'}</i></span>
    </button>
    <div class="fs-reveal"${expanded ? '' : ' hidden'} id="fsGameReveal">
      <div class="fs-reveal-head"><div><span>ESCOLHE A TUA EXPERIÊNCIA</span><strong>${chosen ? 'O teu jogo de Free Spins' : `${previewGames.length} jogos disponíveis`}</strong></div>
        <small>${chosen ? 'Joga quando quiseres' : 'As Free Spins valem em qualquer um deles'}</small></div>
      <div class="fs-showcase">${gameCards}</div>
      ${games.length > 5 ? `<button class="fs-more-games" type="button" data-action="fs-more">Ver todos os ${games.length} jogos disponíveis <span aria-hidden="true">→</span></button>` : ''}
      <p class="fs-note">Válidas até ${esc(fmtDateTime(s.expiresAt))} · Os ganhos passam a saldo real quando as Free Spins terminam.</p>
    </div>
  </section>`;
}

function openFreeSpins() {
  const d = state.fsActive;
  if (!d?.freeSpins) return;
  const s = d.freeSpins;
  const intro = s.chosenGame
    ? 'Este é o jogo das suas Free Spins. Pode sair e voltar quando quiser: as Free Spins por jogar ficam guardadas.'
    : `Escolha o jogo onde quer usar as suas ${fsCount(s.spinsLeft)}. Depois de escolher, as Free Spins ficam nesse jogo até terminarem.`;
  openModal('Jogos disponíveis para Free Spins', `<p class="muted">${intro}</p>
    <div class="fs-pick">${d.games.map((g) => `<button class="fs-game" data-action="fs-pick" data-id="${g.id}">
      <span class="fs-art">${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : '🎰'}</span>
      <strong>${esc(g.name)}</strong><small>${esc(g.provider)}</small></button>`).join('')}</div>
    <p class="muted fs-note">Válidas até ${esc(fmtDateTime(s.expiresAt))}. Os ganhos passam a saldo real quando as Free Spins terminam.</p>`);
}

function casinoPage() {
  const c = state.casino;
  ensureFreeSpins();
  ensureCasinoBanners();
  ensureSpotlights();
  ensureCasinoMine();
  if (!c.enabled) {
    return `<div class="page-title"><h1>Casino</h1><p>Jogos, mesas e entretenimento num só espaço.</p></div>
      <div class="notice"><strong>${c.loaded ? 'Casino em integração.' : 'A carregar…'}</strong> ${c.loaded ? 'Os jogos ficam disponíveis assim que o fornecedor de casino for ligado à plataforma.' : ''}</div>
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
  // The lobby: rows of games that scroll sideways, each with "Ver todos".
  const rows = c.bigbang && !filtered ? state.casinoLobby?.rows || [] : [];
  // Top 10: the place on the corner of each game.
  const topCard = (g, k) => `<div class="top-card"><span class="top-n" aria-hidden="true">${k + 1}</span>${lobbyCard(g)}</div>`;
  // "Ver todos": a tab, a provider or a collection's own page.
  const seeAll = (r, i) => (r.key === 'collection' ? `<a class="see-all" href="#/casino/colecao/${r.id}">Ver todos</a>`
    : r.key === 'provider' ? `<button class="see-all" data-casino-prov="${esc(r.provider)}">Ver todos</button>`
    : r.more ? `<button class="see-all" data-casino-cat="${esc(r.more)}">Ver todos</button>`
    : `<button class="see-all" data-casino-list="${i}">Ver todos</button>`);
  // A row shows its first 12; "Ver todos" opens all of them.
  const ROW_MAX = 12;
  const row = (r, i, cards = r.games.slice(0, ROW_MAX).map(lobbyCard)) => `<section class="section casino-row${r.layout === 'top' ? ' casino-top' : ''}${r.key === 'recent' ? ' casino-recent' : ''}">
      <div class="section-head"><h2>${esc(r.title)}</h2>${seeAll(r, i)}</div>${carousel(`casinoRow${i}`, cards)}</section>`;
  // The order of the big operators: the week's picks, then the player's own (played recently, the
  // seasonal collection, "Sabemos que vais gostar", "Porque jogaste …", favourites), then the rest.
  const m = state.user ? state.casinoMine : null;
  const picks = rows.filter((r) => r.key === 'destaques');
  const lead = rows.slice(0, rows.findIndex((r) => r.key === 'destaques') + 1 || 0).filter((r) => r.key === 'collection');
  const rest = rows.filter((r) => !picks.includes(r) && !lead.includes(r));
  const because = m?.because || [];
  // A tab, a provider or a search shows its own grid: none of the lobby's rows (the player's own
  // included, or they would take the grid's place).
  const order = filtered ? [] : [
    ...picks,
    m?.recent.length && { key: 'recent', title: 'Jogaste recentemente', games: m.recent },
    ...lead,
    m?.forYou?.length >= 3 && { key: 'foryou', title: 'Sabemos que vais gostar', games: m.forYou },
    because[0] && { key: 'because', title: `Porque jogaste ${because[0].game.name}`, games: because[0].games },
    m?.favorites.length && { key: 'favs', title: 'Os teus favoritos', games: m.favorites },
    because[1] && { key: 'because', title: `Porque jogaste ${because[1].game.name}`, games: because[1].games },
    ...rest,
  ].filter(Boolean);
  // Destaques after the row they were set to follow (after the second row when that one is not shown).
  const spots = state.spotlights || [];
  const placed = new Set();
  const lobby = order.map((r, i) => {
    const html = r.layout === 'top' ? row(r, i, r.games.map(topCard)) : r.key === 'recent' ? row(r, i, r.games.slice(0, ROW_MAX).map(recentCard)) : row(r, i);
    const here = spots.filter((x) => !placed.has(x.id) && (x.after === r.key || (i === 1 && !order.some((o) => o.key === x.after))));
    here.forEach((x) => placed.add(x.id));
    return html + here.map(spotlightCard).join('');
  }).join('');
  state.casinoRows = order;
  // "Ver todos" of a row without a tab of its own (Sabemos que vais gostar, Porque jogaste…, Top 10…):
  // all its games in a grid.
  const view = state.casinoView;
  if (view && !filtered) {
    return `${casinoTabs({ category: null })}<div class="section-head casino-prov-head"><h2>${esc(view.title)} <small class="muted">· ${view.games.length} jogos</small></h2>
        <button class="link-btn" data-casino-cat="">‹ Voltar ao casino</button></div>
      <section class="section"><div class="game-grid grid">${view.games.map(view.recent ? recentCard : lobbyCard).join('')}</div></section>
      ${footer()}`;
  }
  // One provider or one tab open: its name, how many games and the way back to the lobby.
  const prov = c.bigbang && f.provider ? c.providers.find((p) => String(p.id) === f.provider) : null;
  const cat = c.bigbang && !prov && f.category ? (state.casinoLobby?.categories || []).find((x) => x.key === f.category) : null;
  const theme = !cat && f.category ? state.casinoLobby?.rows?.find((r) => r.more === f.category) : null;
  const head = f.q ? `Resultados para “${f.q}”` : prov?.name || cat?.label || theme?.title;
  const provHead = head ? `<div class="section-head casino-prov-head"><h2>${esc(head)} <small class="muted">· ${c.total} jogos</small></h2>
      <button class="link-btn" data-casino-cat="">‹ Voltar ao casino</button></div>` : '';
  // As the big operators show it: the kinds of game on top, the banner below them, then the rows.
  // Search and providers are in the casino menu (on the left; ☰ on phones).
  return `${casinoTabs(f)}${filtered ? '' : casinoBanners()}${freeSpinsBar()}
    ${lobby || `${provHead}<section class="section">
      <div class="game-grid grid" id="casinoGrid">${c.games.length ? c.games.map(casinoGameCard).join('') : `<div class="empty">${c.loading ? 'A carregar…' : 'Sem jogos neste filtro.'}</div>`}</div>
      ${more ? `<div class="load-more"><button class="outline-btn" data-action="casino-more" id="casinoMore" ${c.loading ? 'disabled' : ''}>${c.loading ? 'A carregar…' : `Mostrar mais jogos (${c.games.length} de ${c.total})`}</button></div>` : ''}
    </section>`}
    ${footer()}`;
}

/** A collection's own page (#/casino/colecao/ID, e.g. the button of a banner): its games. */
function casinoCollectionPage(id) {
  const cur = state.casinoCollection;
  if (cur?.id !== id || Date.now() - cur.at > 5 * 60_000) {
    state.casinoCollection = { id, at: Date.now(), data: cur?.id === id ? cur.data : null };
    api(`/api/casino/collection/${id}`).then((d) => { if (state.casinoCollection?.id === id) state.casinoCollection.data = d; })
      .catch((err) => { if (state.casinoCollection?.id === id) state.casinoCollection.data = { error: err.message }; })
      .finally(() => { const r = currentRoute(); if (r.page === 'casino' && r.sub === 'colecao' && Number(r.rest) === id) render({ keepScroll: true }); });
  }
  const d = state.casinoCollection.data;
  const chips = casinoTabs({ category: null });
  if (!d) return `${chips}<div class="loading">A carregar…</div>`;
  if (d.error) return `${chips}<div class="panel empty">${esc(d.error)}<div class="hero-actions"><a class="outline-btn" href="#/casino">Voltar ao casino</a></div></div>${footer()}`;
  return `${chips}<div class="section-head casino-prov-head"><h2>${esc(d.title)} <small class="muted">· ${d.games.length} jogos</small></h2>
      <a class="link-btn" href="#/casino">‹ Voltar ao casino</a></div>
    <section class="section"><div class="game-grid grid">${d.games.map(lobbyCard).join('')}</div></section>
    ${footer()}`;
}

/** Loads the next block of games (or the first block after a filter change). */
// Each new filter (a tab, a provider, a search) replaces the request still on its way: only the answer
// to the latest one is shown ("Mostrar mais" waits for the one loading).
let casinoReq = 0;
async function loadCasino({ reset = false } = {}) {
  const c = state.casino;
  if (c.loading && !reset) return;
  const f = state.casinoFilter;
  const offset = reset ? 0 : c.games.length;
  const mine = ++casinoReq;
  c.loading = true;
  if (reset) c.games = [];
  if (currentRoute().page === 'casino' && currentRoute().sub !== 'jogar') render({ keepScroll: true });
  try {
    const all = f.provider || f.category || f.q;
    const qs = new URLSearchParams({ offset, limit: all ? CASINO_ALL : CASINO_PAGE, provider: f.provider || '', category: f.category || '', q: f.q || '' });
    const data = await api(`/api/casino/games?${qs}`);
    if (mine !== casinoReq) return; // another filter was chosen meanwhile
    state.casino = { ...data, games: reset ? data.games : [...state.casino.games, ...data.games], loaded: true, loading: false };
  } catch {
    if (mine !== casinoReq) return;
    state.casino = { enabled: false, games: [], providers: [], total: 0, loaded: true, loading: false };
  }
  const { page, sub } = currentRoute();
  if (page === 'home' || (page === 'casino' && sub !== 'jogar')) {
    const search = document.activeElement?.id === 'casinoSearch';
    render({ keepScroll: true });
    if (search) { const el = $('#casinoSearch'); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }
  }
}

// A tab, provider or search shows all its games: the next ones load by themselves as the page reaches
// the end of the list ("Mostrar mais jogos" stays for a tap).
let moreObserver = null;
function watchCasinoMore() {
  const el = $('#casinoMore');
  if (!el || !('IntersectionObserver' in window)) return;
  moreObserver?.disconnect();
  moreObserver = new IntersectionObserver((entries) => {
    if (entries.some((x) => x.isIntersecting) && !state.casino.loading) loadCasino();
  }, { rootMargin: '600px 0px' });
  moreObserver.observe(el);
}

/** Opens a game inside Bet62. The balance follows the player into the casino automatically. */
async function openGame(index) {
  const g = state.casino.games[index];
  if (!g) return;
  if (!state.user) return openAuth('login');
  state.casinoSession = { name: g.name, provider: g.provider, code: g.code, url: null };
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
    loadFreeSpins();
  } catch { state.user && (state.user.casinoActive = true); }
}

/** Free spins are shown as a count ("5 Free Spins"), never in money (to us each one is worth its bet). */
const fsCount = (n) => `${Number(n) || 0} ${Number(n) === 1 ? 'Free Spin' : 'Free Spins'}`;
const fsRounds = (g) => `${g.fsLeft ?? 0}${g.fsSpins ? ` de ${g.fsSpins}` : ''}`;

/** While a game is open, the header shows the live casino balance (and the free-spins rounds left in its bar). */
async function refreshCasinoBalance() {
  const sess = state.casinoSession;
  if (!state.user || sess?.demo) return;
  try {
    const w = await api(`/api/casino/wallet${sess?.fs ? `?fs=${sess.fs}` : ''}`);
    if (state.user) {
      state.user.balance = w.balance;
      updateHeader();
    }
    if (sess?.fs && w.freeSpins && state.casinoSession === sess) {
      const was = [sess.fsLeft, sess.fsEnded];
      sess.fsLeft = w.freeSpins.spinsLeft;
      sess.fsSpins = w.freeSpins.spins;
      sess.fsWon = w.freeSpins.won;
      sess.fsEnded = w.freeSpins.ended;
      sess.fsBet = w.freeSpins.bet;
      sess.fsPalace = w.freeSpins.palace;
      if (w.freeSpins.betTooHigh !== !!sess.fsWarn) { sess.fsWarn = w.freeSpins.betTooHigh; render({ keepScroll: true }); }
      const el = $('#fsBal');
      if (el) el.textContent = fsRounds(sess);
      updateHeader();
      // The last round played: the game is covered (no more spins) until the free spins end.
      if ((was[0] > 0) !== (sess.fsLeft > 0) || was[1] !== sess.fsEnded) {
        render({ keepScroll: true });
        if (sess.fsEnded) { loadFreeSpins(); state.promos = null; }
      }
    }
  } catch { /* next tick retries */ }
}

// ---------- one game's page (BigBang): Jogar, Testar, Free Spins ----------

/**
 * The game servers' connection opened ahead (DNS, TLS) while the player looks at the game page, so
 * "Jogar" starts loading at once; then the origin of each game opened, for the next one.
 */
// The game's page loaded (load does not bubble: caught on the way down): the cover goes.
const uncoverGame = () => {
  if (state.casinoSession) state.casinoSession.loaded = true;
  $('#casinoCover')?.classList.add('gone');
};
document.addEventListener('load', (e) => {
  if (e.target?.id !== 'casinoFrame') return;
  setTimeout(uncoverGame, 300);
  armSkin();
}, true);

// A cover waits for the game itself: Pragmatic first shows its loading bar and an intro screen, which the
// cover must not sit on. Set per cover in Admin → Películas: either once the game starts (\`after\` s
// after the first touch inside it, the one that closes the intro; never before 2 s after the page
// loaded), with \`delay\` s after loading as a fallback when nobody touches (0 = none); or \`delay\` s
// after the page loaded. A message from the game saying it is ready also shows it.
let skinTimer = null;
const skinSide = (s) => (matchMedia('(orientation: portrait)').matches ? s?.port : s?.land);
function showSkin() {
  const g = state.casinoSession;
  if (!g || g.skinReady) return;
  g.skinReady = true;
  $('.skin-wrap')?.classList.remove('skin-wait');
}
function armSkin() {
  const g = state.casinoSession, side = g && skinSide(gameSkin(g));
  clearTimeout(skinTimer);
  if (!side || g.skinReady) return;
  g.frameAt = Date.now();
  if (!side.touch || side.delay > 0) skinTimer = setTimeout(showSkin, side.delay * 1000);
}
function skinSoon(ms) {
  const g = state.casinoSession;
  if (!g?.frameAt || g.skinReady) return;
  clearTimeout(skinTimer);
  skinTimer = setTimeout(showSkin, Math.max(ms, g.frameAt + 2000 - Date.now()));
}
// A touch inside the game moves the focus into its frame: this page loses it.
window.addEventListener('blur', () => setTimeout(() => {
  const g = state.casinoSession;
  const side = skinSide(gameSkin(g || {}));
  if (document.activeElement?.id === 'casinoFrame' && side?.touch) skinSoon(side.after * 1000);
}));
window.addEventListener('message', (e) => {
  const f = $('#casinoFrame');
  if (!f || e.source !== f.contentWindow) return;
  const text = typeof e.data === 'string' ? e.data : (() => { try { return JSON.stringify(e.data); } catch { return ''; } })();
  if (state.user?.role === 'admin') console.info('[jogo → site]', String(text).slice(0, 300));
  if (/game.?ready|loaded|load.?(end|complete)|game.?start/i.test(text)) skinSoon(300);
});

const warmOrigins = new Set();
function warmOrigin(url) {
  let origin;
  try { origin = new URL(url).origin; } catch { return; }
  if (warmOrigins.has(origin)) return;
  warmOrigins.add(origin);
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  document.head.append(link);
}

function casinoGamePage(id) {
  warmOrigin('https://bigbangcasino.bet');
  if (state.casinoGame?.id !== id) {
    state.casinoGame = { id, data: null };
    api(`/api/casino/game/${id}`).then((d) => {
      if (state.casinoGame?.id !== id) return;
      state.casinoGame.data = d;
      // Opened from "Jogados recentemente": the game starts straight away.
      if (state.casinoAutoPlay === id) { state.casinoAutoPlay = null; if (state.user) { playCasino('real'); return; } }
      // "Jogar" ready ahead: the player created at BigBang now (once), so the real game opens with one call.
      if (state.user && !state.casinoPrepared) { state.casinoPrepared = true; api('/api/casino/prepare', { method: 'POST', body: {} }).catch(() => { state.casinoPrepared = false; }); }
      // "Testar" ready ahead: the demo's address asked now, while the player reads the page.
      state.casinoGame.demo = d.game?.demo === false ? Promise.resolve(null) : api('/api/casino/launch', { method: 'POST', body: { gameId: id, demo: true } })
        .then((r) => { warmOrigin(r.url); return r; }).catch(() => null);
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
  const art = g.image ? `<img src="${esc(g.image)}" alt="" class="game-img" loading="lazy" decoding="async">` : '<span class="cg-emoji">🎰</span>';
  const tags = [g.category, g.premium ? 'Premium' : null, g.provider].filter(Boolean);
  const rel = (x) => `<a class="cg-rel" href="#/casino/jogo/${x.id}"><span class="cg-rel-art">${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy" class="game-img">` : '🎰'}</span><strong>${esc(x.name)}</strong></a>`;
  return `<div class="cg">
      <div class="cg-hero">
        ${g.image ? `<img class="cg-bg" src="${esc(g.image)}" alt="" loading="lazy" decoding="async">` : ''}
        <a class="cg-close" href="#/casino" aria-label="Fechar">×</a>
        <div class="cg-art">${art}</div>
      </div>
      <div class="cg-body">
        <h1>${esc(g.name)}${state.user ? `<button class="cg-fav${isFavorite(g.id) ? ' on' : ''}" data-action="cg-fav" data-id="${g.id}" aria-pressed="${isFavorite(g.id)}" title="${isFavorite(g.id) ? 'Tirar dos favoritos' : 'Juntar aos favoritos'}">${isFavorite(g.id) ? '♥' : '♡'}</button>` : ''}</h1>
        <div class="cg-provider">${esc(g.provider)}</div>
        <p class="cg-tags">${tags.map(esc).join(', ')}</p>
        <div class="cg-actions">
          ${fs?.eligible ? `<button class="cg-btn fs" data-cg-play="fs">🎁 Jogar com Free Spins <small>${fs.spinsLeft} disponíveis</small></button>` : ''}
          <button class="cg-btn play" data-cg-play="real"><span class="cg-play-ico">▶</span> Jogar</button>
          ${g.demo !== false ? '<button class="cg-btn demo" data-cg-play="demo">Testar</button>' : ''}
        </div>
        ${fs && !fs.eligible ? '<p class="cg-note">As suas Free Spins são para outro jogo — veja os jogos disponíveis no topo do <a href="#/casino">Casino</a>.</p>' : ''}
        ${g.demo !== false ? '<p class="cg-note">Testar abre o jogo em modo demonstração, com saldo virtual: nenhum dinheiro real é usado.</p>' : ''}
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
  state.casinoSession = { name: g.name, provider: g.provider, code: g.code || null, image: g.image || null, url: null, gameId: g.id, demo: mode === 'demo', fs: mode === 'fs' ? d.freeSpins?.id : null,
    fsLeft: d.freeSpins?.spinsLeft ?? null, fsSpins: d.freeSpins?.spins ?? null, fsBet: d.freeSpins?.spinValue ?? null, fsWon: 0, fsEnded: false };
  location.hash = '#/casino/jogar';
  try {
    const ahead = mode === 'demo' ? await state.casinoGame?.demo : null;
    const r = ahead || await api('/api/casino/launch', { method: 'POST', body: { gameId: g.id, demo: mode === 'demo', freeSpins: mode === 'fs' ? d.freeSpins?.id : undefined } });
    if (!state.casinoSession) return;
    warmOrigin(r.url);
    state.casinoSession.url = r.url;
    // A Palace slot (Transfer mode): the balance is in that casino until the game closes.
    if (r.transfer && state.user) { state.user.casinoActive = true; state.user.balance = r.balance; updateHeader(); }
    // Never covered for long: a game whose page does not report loading shows itself anyway.
    setTimeout(uncoverGame, 20_000);
    if (r.freeSpins) { Object.assign(state.casinoSession, { fsLeft: r.freeSpins.spinsLeft, fsSpins: r.freeSpins.spins }); updateHeader(); }
    // This game goes to the front of "Jogados recentemente" (seen when the player comes back).
    if (mode !== 'demo' && state.casinoMine) {
      state.casinoMine.recent = [g, ...state.casinoMine.recent.filter((x) => x.id !== g.id)];
      state.casinoMine.at = 0;
    }
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

/**
 * Covers ("películas") over parts of some games, made in Admin → Películas from the game's own
 * artwork. The game frame keeps the proportion the cover was made for, so it always lands on the
 * same spot; the cover also takes the clicks there. land: computer, landscape; port: phone upright.
 * box: left, top, width, height in % of the frame.
 */
function gameSkin(g) {
  const mode = state.config?.casinoSkins;
  if (g.demo || !g.code || !(mode === 'all' || (mode === 'admin' && state.user?.role === 'admin'))) return null;
  const mine = (state.config?.skins || []).filter((s) => s.code === g.code);
  if (!mine.length) return null;
  const side = (k) => {
    const list = mine.filter((s) => s.side === k);
    return list.length ? { ratio: list[0].ratio, covers: list, delay: list[0].delay ?? 8, touch: list[0].touch !== false, after: list[0].after ?? 0.5 } : null;
  };
  return { land: side('land'), port: side('port') };
}
function skinned(g, frame) {
  const s = gameSkin(g);
  if (!s) return frame;
  const covers = (side) => (s[side]?.covers || []).map((c) => {
    const [l, t, w, h] = c.box;
    return `<img class="skin-${side}" src="${esc(c.img)}" alt="" draggable="false" data-box="${[l, t, w, h].join(',')}">`;
  }).join('');
  const vars = [s.land ? s.land.ratio : '', s.port ? s.port.ratio : ''].join(',');
  const cls = ['skin-wrap', s.land && 'sk-land', s.port && 'sk-port', !g.skinReady && 'skin-wait'].filter(Boolean).join(' ');
  return `<div class="${cls}"><div class="skin-box" data-ratios="${vars}">${frame}${covers('land')}${covers('port')}</div></div>`;
}
/** Places the covers (the CSP refuses style="" in the page's HTML; the CSSOM is fine). */
function placeSkins() {
  for (const box of $$('.skin-box[data-ratios]')) {
    const [rl, rp] = box.dataset.ratios.split(',');
    if (rl) box.style.setProperty('--rl', rl);
    if (rp) box.style.setProperty('--rp', rp);
  }
  for (const img of $$('.skin-land[data-box], .skin-port[data-box]')) {
    const [l, t, w, h] = img.dataset.box.split(',');
    Object.assign(img.style, { left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` });
  }
}

function casinoPlayPage() {
  const g = state.casinoSession;
  if (!g) {
    setTimeout(() => { location.hash = '#/casino'; });
    return '<div class="loading">A voltar ao casino…</div>';
  }
  // The game's own loading shows black for seconds: our cover (its picture, a spinner) stays until
  // the game's page has loaded (or 20 s), over the frame that loads beneath it.
  const cover = `<div class="casino-loading${g.url ? ' over' : ''}" id="casinoCover">${g.image ? `<img src="${esc(g.image)}" alt="" class="casino-cover-img">` : ''}<div class="spinner"></div><strong>${esc(g.name)}</strong><span class="muted">${g.url ? 'A carregar o jogo…' : 'A abrir o jogo…'}</span></div>`;
  if (!g.url) return `<div class="casino-player">${cover}</div>`;
  const mode = g.demo ? '<span class="cbar-tag">DEMO · saldo virtual</span>'
    : g.fs ? `<span class="cbar-tag fs">FREE SPINS · <b id="fsBal">${fsRounds(g)}</b></span>` : '';
  // Every round played: the game is covered; when they end, what they won is already real balance.
  const fsDone = !g.fs || (g.fsLeft > 0 && !g.fsEnded) || g.fsLeft === null ? ''
    : `<div class="fs-done"><div class="fs-done-box">${g.fsEnded
      ? `<strong>Free Spins terminadas</strong><span>${g.fsWon > 0 ? `Ganhou <b>${money(g.fsWon)}</b>: já está no seu saldo real.` : 'Desta vez não houve ganhos.'}</span>
        <a class="cg-btn play" href="#/casino">Voltar ao casino</a>`
      : '<div class="spinner"></div><strong>Free Spins usadas</strong><span>A confirmar os ganhos…</span>'}</div></div>`;
  // Free spins are played at a fixed bet: said when the game opens, and again (louder) when the
  // player raises it in the game (BigBang refuses the spin; at Palace it uses several Free Spins).
  const bet = money(g.fsBet || 0.2);
  const fsNote = !g.fs || g.fsEnded ? ''
    : g.fsWarn ? `<div class="fs-bet-note warn" role="alert">⚠️ Esta promoção utiliza uma aposta fixa de <b>${bet}</b> por rodada. ${g.fsPalace
      ? `Uma aposta maior gasta várias Free Spins de uma vez (cada ${bet} conta como 1).` : 'A rodada não foi aceite e nenhuma Free Spin foi usada.'} Ajusta o valor da aposta para <b>${bet}</b> para continuar.</div>`
      : `<div class="fs-bet-note">Jogue com a aposta de <b>${bet}</b> por rodada: cada rodada usa 1 Free Spin.</div>`;
  return `<div class="casino-player">
    ${g.gameId ? `<div class="casino-bar"><a href="#/casino/jogo/${g.gameId}" class="cbar-back">‹ Sair</a><strong>${esc(g.name)}</strong>${mode}</div>` : ''}${fsNote}
    <div class="casino-stage">${g.loaded ? '' : cover}${fsDone}
    ${skinned(g, `<iframe id="casinoFrame" class="casino-frame" src="${esc(g.url)}" title="${esc(g.name)}"
      allow="fullscreen; autoplay; clipboard-write; encrypted-media" allowfullscreen referrerpolicy="origin"></iframe>`)}</div>
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
    accaBoost: ['MÚLTIPLAS', `Boost até +${Math.max(0, ...(c.tiers || []).map(([, p]) => p))}% nos ganhos`, `Quanto mais seleções na múltipla, maior o boost: ${(c.tiers || []).map(([n, p]) => `${n} seleções → +${p}%`).join(' · ')}.`,
      [`Cada seleção com odd ≥ ${fmtOdds(c.minOdds)}`, 'O boost é sobre os ganhos (retorno menos a aposta) e é pago em saldo real', `Até ${money(c.maxBoost)} por aposta`, 'Só apostas com saldo real (não free bets nem bónus)', 'Uma seleção anulada deixa de contar para o boost']],
    casinoFs: ['CASINO', `Free Spins no ${c.firstDepositOnly ? '1.º depósito' : 'depósito'}`, `Escolha "Free Spins casino" ao depositar: ${(c.tiers || []).map(([d, n]) => `${money(d)} → ${n} rodadas`).join(' · ')}.`,
      [c.firstDepositOnly ? 'Só no primeiro depósito' : null, 'Cada rodada à aposta do jogo (ex.: €0,20 ou €0,10)', `Válidas ${c.validityDays} dias`, `Em ${c.games} jogo(s) selecionado(s)`, 'Tudo o que ganhar com as Free Spins passa a saldo real', 'Não acumula com outra promoção no mesmo depósito']],
    depositFb: ['DESPORTO', `Free Bet no ${c.firstDepositOnly ? '1.º depósito' : 'depósito'}`, `Escolha "Free Bet desporto" ao depositar: ${(c.tiers || []).map(([d, n]) => `${money(d)} → ${money(n)}`).join(' · ')}.`,
      [c.firstDepositOnly ? 'Só no primeiro depósito' : null, `Odd mínima ${fmtOdds(c.minOdds)}`, `Válida ${c.validityDays} dias`, 'Aposta-se o valor inteiro da Free Bet de uma vez', 'O lucro é pago em saldo real (o valor da Free Bet não)', 'Não acumula com outra promoção no mesmo depósito']],
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
  const wagering = f.conversion?.type === 'wagering';
  return `<div class="bonus-card">
    <div class="bonus-head"><strong>🎰 Casino · ${fsCount(f.spins)}</strong><span class="pf-badge verified">Ativas</span></div>
    <div class="bonus-nums"><div><small>Free Spins por jogar</small><b>${f.spinsLeft} de ${f.spins}</b></div><div><small>Aposta por rodada</small><b>${money(f.spinValue)}</b></div><div><small>Ganhos ${wagering ? '(pendentes)' : '(saldo real)'}</small><b class="green">${money(f.winnings)}</b></div></div>
    ${f.state === 'SUSPENDED' ? '<p class="fs-bet-note warn">Promoção suspensa temporariamente: as rodadas ficam guardadas.</p>' : ''}
    <small class="muted">Jogos: ${f.games.map((g) => `<a href="#/casino/jogo/${g.id}">${esc(g.name || `#${g.id}`)}</a>`).join(', ')} · expiram a ${esc(dateShort(f.expiresAt))} · ${wagering
      ? `os ganhos ficam pendentes até apostar ${f.conversion.multiplier}× o seu valor com saldo real em ${f.conversion.days} dias`
      : 'os ganhos passam a saldo real quando terminarem'}</small>
    <div class="pf-actions"><button class="outline-btn" data-action="fs-claim" data-id="${f.id}">Terminar${wagering ? '' : ` e receber ganhos (${money(f.winnings)})`}</button></div>
  </div>`;
}

/** The player's money by kind, never mixed: real, promotional, promotional winnings pending, withdrawable. */
function walletKinds(w) {
  return `<div class="pf-stats wallet-kinds"><div><small>Saldo real</small><strong>${money(w.real)}</strong></div><div><small>Saldo promocional</small><strong>${money(w.promotional)}</strong></div>
    <div><small>Ganhos promocionais pendentes</small><strong>${money(w.pendingPromo)}</strong></div><div><small>Saldo levantável</small><strong class="green">${money(w.withdrawable)}</strong></div></div>`;
}
/** Free Spins winnings waiting on an approved wagering rule: what is left to bet and until when. */
function wagerCard(f) {
  const w = f.wager;
  const pctDone = w.required ? Math.min(100, Math.round((w.done / w.required) * 100)) : 0;
  return `<div class="bonus-card">
    <div class="bonus-head"><strong>🎰 Ganhos das Free Spins · ${money(w.pending)}</strong><span class="pf-badge">Pendentes</span></div>
    <div class="bonus-nums"><div><small>Apostado</small><b>${money(w.done)} / ${money(w.required)}</b></div><div><small>Falta</small><b>${money(Math.max(0, w.required - w.done))}</b></div><div><small>Até</small><b>${esc(dateShort(w.until))}</b></div></div>
    <div class="stat-bar bonus-bar"><i class="w${Math.floor(pctDone / 5) * 5}"></i></div>
    <small class="muted">Contam as apostas com saldo real ${f.conversion?.games === 'all' ? 'em qualquer jogo de casino' : 'nos jogos da promoção'}${f.conversion?.maxCountCents ? `, até ${money(f.conversion.maxCountCents / 100)} por aposta` : ''}; apostas anuladas não contam. Cumprido o requisito, os ganhos passam a saldo real; se o prazo terminar, perdem-se.</small>
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
    ${m.wallets ? walletKinds(m.wallets) : ''}
    ${m.activeSpins ? spinsCard(m.activeSpins) : ''}
    ${(m.spins || []).filter((s) => s.wager?.status === 'pending').map(wagerCard).join('')}
    ${m.active.length ? m.active.map(bonusCard).join('') : m.activeSpins ? '' : '<p class="muted">Sem bónus ativos. Veja as campanhas em <a href="#/promocoes">Promoções</a>.</p>'}
    ${free.length ? `<h4>Free bets</h4><div class="pf-list">${free.map((f) => `<div class="pf-row"><div><b>${money(f.amount)}</b><small>Válida até ${esc(fmtDateTime(f.expiresAt))}${f.minOdds > 1 ? ` · odd mínima ${fmtOdds(f.minOdds)}` : ''} · escolha-a no boletim</small></div><span class="pf-badge verified">Disponível</span></div>`).join('')}</div>` : ''}
    ${past.length ? `<h4>Histórico</h4><div class="pf-list">${past.map((b) => `<div class="pf-row"><div><b>${esc(b.name)} · ${money(b.amount)}</b><small>${esc(dateShort(b.createdAt))}${b.cancelReason ? ` · ${esc(b.cancelReason)}` : ''}</small></div><span class="pf-badge">${BONUS_STATUS[b.status]}</span></div>`).join('')}</div>` : ''}
    ${m.ledger.length ? `<h4>Movimentos promocionais</h4><div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>
      ${m.ledger.slice(0, 15).map((l) => `<tr><td>${esc(fmtDateTime(l.createdAt))}</td><td>${esc(l.description)}</td><td class="num ${l.amount >= 0 ? 'green' : ''}">${l.type === 'rollover_progress' ? '' : `${l.amount >= 0 ? '+' : ''}${money(l.amount)}`}</td></tr>`).join('')}
    </tbody></table></div>` : ''}`;
}

function promosPage() {
  if (!state.campaigns) loadPromos();
  const cards = (state.campaigns || []).filter((c) => c.id !== 'welcome' || c.open).map(campaignCard).join('');
  return `<div class="page-title"><h1>Promoções</h1><p>Ofertas e campanhas da Bet62.</p></div>
    ${state.user ? `<section class="section"><details class="promo-mine"${state.promosOpen ? ' open' : ''} data-promos-toggle>
      <summary class="section-head"><h2>As minhas promoções</h2><span class="promo-chev" aria-hidden="true">⌄</span></summary>
      <div class="panel pf-panel">${myPromosView()}</div></details></section>` : ''}
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
    <div class="pf-avatar${u.avatar ? ' emblem' : ''}">${u.avatar ? `<img src="/media/avatar-${esc(u.avatar)}.webp" alt="" width="160" height="160">` : esc(initials(u.name))}</div>
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
    case 'notificacoes': return `${prefToggles([
      ['notifyResults', 'Resultados das apostas por email', 'Aviso quando uma aposta é resolvida'],
      ['notifyPromos', 'Promoções por email', 'Ofertas e campanhas'],
      ['notifySms', 'Promoções por SMS', 'Ofertas e campanhas (precisa de telefone na conta)'],
      ['notifyPush', 'Avisos no telemóvel', 'Quando uma aposta ganha e quando um levantamento é aprovado ou pago'],
      ['notifyPushPromos', 'Promoções no telemóvel', 'Ofertas e campanhas, só entre as 09:00 e as 21:00'],
    ])}${pushDeviceBox()}`;
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
  }[k.status] || '<div class="pf-note">Para desbloquear levantamentos: fotografe o seu documento de identificação (frente e verso) e envie um comprovativo de IBAN ou extrato bancário.</div>';
  const idState = slot(['Documento (frente)', 'Documento (verso)', 'Passaporte']);
  const bankState = slot(['Comprovativo de IBAN / morada']);
  const canSend = (st) => st === 'missing' || st === 'rejected';
  box.innerHTML = `${notice}
    <div class="pf-list">
      ${badge('Email', 'given', esc(u.email))}
      ${badge('NIF', u.nif ? 'given' : 'none', u.nif ? esc(u.nif) : 'Indique-o em Dados bancários')}
    </div>
    <div class="kyc-step">
      <div class="kyc-step-head"><span class="kyc-num">1</span><div><b>Documento de identificação</b><small>Cartão de Cidadão ou outro documento — frente e verso, fotografado com a câmara.</small></div>
        <span class="pf-badge ${KYC_STATE[idState][0]}">${KYC_STATE[idState][1]}</span></div>
      ${canSend(idState) ? '<button class="primary-btn kyc-cam-btn" data-action="kyc-camera">📷 Fotografar documento (frente e verso)</button>'
        : `<p class="kyc-done">${idState === 'approved' ? '✅ Documento verificado.' : '✅ Fotografias enviadas — em análise.'}</p>`}
    </div>
    <div class="kyc-step">
      <div class="kyc-step-head"><span class="kyc-num">2</span><div><b>Comprovativo de IBAN ou extrato bancário</b><small>Documento do banco com o seu nome e o IBAN (PDF ou imagem, máx. 5 MB).</small></div>
        <span class="pf-badge ${KYC_STATE[bankState][0]}">${KYC_STATE[bankState][1]}</span></div>
      ${canSend(bankState) ? `<form data-form="kyc"><input type="hidden" name="kind" value="address">
        <div class="field"><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></div>
        <div class="form-actions"><button class="primary-btn">Enviar comprovativo</button></div></form>`
        : `<p class="kyc-done">${bankState === 'approved' ? '✅ Comprovativo verificado.' : '✅ Comprovativo enviado — em análise.'}</p>`}
    </div>
    ${k.documents.length ? `<h4>Documentos enviados</h4><div class="pf-list">${k.documents.map((d) => `<div class="pf-row"><div><b>${esc(d.kind)}</b><small>${esc(d.fileName)} · ${esc(fmtDateTime(d.createdAt))}</small></div>
      <span class="pf-badge ${KYC_STATE[d.status][0]}">${KYC_STATE[d.status][1]}</span></div>`).join('')}</div>` : ''}`;
}

/**
 * Identity document through the camera only: the front, then the back, each checked before going on;
 * both are sent together. No file upload: the document has to be photographed there and then.
 */
async function kycCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Câmara', 'Este navegador não dá acesso à câmara. Abra o site no telemóvel (Chrome ou Safari).', 'error');
    return;
  }
  const steps = [['id_front', 'Frente do documento', 'Coloque a FRENTE do documento dentro do retângulo.'], ['id_back', 'Verso do documento', 'Agora vire o documento e fotografe o VERSO.']];
  const shots = [];
  const el = document.createElement('div');
  el.className = 'cam';
  el.innerHTML = `<div class="cam-top"><b class="cam-title"></b><button class="cam-x" aria-label="Fechar">×</button></div>
    <p class="cam-hint"></p>
    <div class="cam-view"><video playsinline autoplay muted></video><img class="cam-shot" alt=""><i class="cam-frame"></i></div>
    <div class="cam-acts"></div>`;
  document.body.appendChild(el);
  const video = el.querySelector('video');
  const img = el.querySelector('.cam-shot');
  const acts = el.querySelector('.cam-acts');
  let stream = null;
  const stop = () => { stream?.getTracks().forEach((t) => t.stop()); el.remove(); };
  el.querySelector('.cam-x').onclick = stop;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    video.srcObject = stream;
  } catch (err) {
    stop();
    toast('Câmara', err?.name === 'NotAllowedError' ? 'Permita o acesso à câmara para fotografar o documento (nas definições do navegador).' : 'Não foi possível abrir a câmara.', 'error');
    return;
  }
  const grab = () => {
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const scale = Math.min(1, 1600 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  };
  const live = (i) => {
    el.querySelector('.cam-title').textContent = `${i + 1}/2 · ${steps[i][1]}`;
    el.querySelector('.cam-hint').textContent = steps[i][2];
    img.hidden = true; video.hidden = false;
    acts.innerHTML = '<button class="cam-shoot" aria-label="Tirar foto"></button>';
    acts.querySelector('.cam-shoot').onclick = () => {
      const shot = grab();
      img.src = shot; img.hidden = false; video.hidden = true;
      el.querySelector('.cam-hint').textContent = 'A foto está nítida e o documento aparece inteiro?';
      acts.innerHTML = '<button class="outline-btn cam-redo">Repetir</button><button class="primary-btn cam-ok">Usar foto</button>';
      acts.querySelector('.cam-redo').onclick = () => live(i);
      acts.querySelector('.cam-ok').onclick = () => { shots[i] = shot; i === 0 ? live(1) : review(); };
    };
  };
  const review = () => {
    stream?.getTracks().forEach((t) => t.stop());
    el.querySelector('.cam-title').textContent = 'Frente e verso';
    el.querySelector('.cam-hint').textContent = 'Confirme as duas fotografias e envie.';
    el.querySelector('.cam-view').innerHTML = `<div class="cam-pair">${shots.map((s, n) => `<figure><img src="${s}" alt=""><figcaption>${n ? 'Verso' : 'Frente'}</figcaption></figure>`).join('')}</div>`;
    acts.innerHTML = '<button class="outline-btn cam-again">Repetir tudo</button><button class="primary-btn cam-send">Enviar</button>';
    acts.querySelector('.cam-again').onclick = () => { stop(); kycCamera(); };
    acts.querySelector('.cam-send').onclick = async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'A enviar…';
      try {
        for (const [n, [kind]] of steps.entries()) {
          await api('/api/me/kyc', { method: 'POST', body: { kind, mimeType: 'image/jpeg', fileName: `${kind === 'id_front' ? 'frente' : 'verso'}.jpg`, data: shots[n].split(',')[1] } });
        }
        el.querySelector('.cam-view').innerHTML = '<div class="cam-okmsg">✅<b>Documento enviado</b><span>A equipa vai analisá-lo em até 48 horas úteis.</span></div>';
        el.querySelector('.cam-hint').textContent = '';
        acts.innerHTML = '<button class="primary-btn cam-close">OK</button>';
        acts.querySelector('.cam-close').onclick = () => { el.remove(); loadKyc(); };
        if (state.user.kycStatus !== 'approved') state.user.kycStatus = 'pending';
      } catch (err) {
        ev.target.disabled = false; ev.target.textContent = 'Enviar';
        toast('Erro', err.message, 'error');
      }
    };
  };
  live(0);
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

/** This phone's notifications: on, off in the browser, to turn on, or (iPhone) the app to install first. */
function pushDeviceBox() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let text, btn = '';
  if (!pushSupported()) {
    text = ios && !installed ? 'No iPhone, os avisos funcionam com a app instalada: no Safari, toque em Partilhar → Adicionar ao ecrã principal e abra a Bet62 a partir do ícone.' : 'Este navegador não recebe avisos.';
    if (ios && !installed && window.bet62InstallGuide) btn = '<button class="primary-btn btn-sm" data-action="install-guide">Como instalar</button>';
  }
  else if (Notification.permission === 'granted') text = '✅ Este dispositivo recebe os avisos.';
  else if (Notification.permission === 'denied') text = 'Os avisos estão bloqueados neste navegador: permita-os nas definições do site (cadeado ao lado do endereço).';
  else { text = 'Este dispositivo ainda não recebe os avisos.'; btn = '<button class="primary-btn btn-sm" data-action="push-yes">Ativar neste dispositivo</button>'; }
  return `<div class="pf-note push-device"><span>${text}</span>${btn}</div>`;
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
  // 1st deposit without the 100% welcome bonus: the sports offer is the free bet (€20 → €10).
  const sportBonus = !(state.user?.firstDeposit && !c.welcomeBonus);
  return `${c.paymentsMode === 'demo' ? '<div class="notice"><strong>Modo demonstração:</strong> nenhum pagamento real é processado; o valor é creditado de imediato.</div><br>' : ''}
    ${c.paymentsMode === 'eupago' ? '<div class="notice">Pagamentos processados pela Eupago. Escolha um método de pagamento.</div><br>' : ''}
    <form data-form="deposit" class="deposit-form">
      <div class="methods payment-methods">
        <label class="method payment-method-logo"><input type="radio" name="method" value="mbway" checked><img src="https://sandbox.eupago.pt/backoffice/files/assets/images/servicos/mbway_Logo.svg" alt="MB WAY" title="MB WAY"></label>
        <label class="method payment-method-logo"><input type="radio" name="method" value="multibanco"><img src="https://sandbox.eupago.pt/backoffice/files/assets/images/servicos/multibanco_Logo.svg" alt="Multibanco" title="Multibanco"></label>
        <label class="method payment-method-logo"><input type="radio" name="method" value="cartao"><img src="https://sandbox.eupago.pt/backoffice/files/assets/images/servicos/cartao_credito_Logo.svg" alt="Cartão de Crédito" title="Cartão de Crédito"></label>
      </div>
      <div class="amount-presets">${DEPOSIT_PRESETS.map((v) => `<button type="button" data-amount="${v}">€${v}</button>`).join('')}</div>
      <div class="form-grid">
        <div class="field"><label>Valor (€${c.minDeposit ?? 5} – €${c.maxDeposit ?? 5000})</label><input name="amount" type="number" min="${c.minDeposit ?? 5}" max="${c.maxDeposit ?? 5000}" step="0.01" value="20" required inputmode="decimal"></div>
        <div class="field mbway-only"><label>Telemóvel MB WAY</label><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="912 345 678" value="${esc(state.user.phone || '')}"></div>
      </div>
      <div class="promo-pick"><span>Promoção deste depósito</span>
        ${sportBonus ? '<label><input type="radio" name="promo" value="sport" checked> Bónus de desporto</label>' : ''}
        <label><input type="radio" name="promo" value="casino"> Free Spins casino</label>
        <label><input type="radio" name="promo" value="freebet"${sportBonus ? '' : ' checked'}> Free Bet desporto</label>
        <label><input type="radio" name="promo" value="none"> Sem promoção</label></div>
      <div class="deposit-offer" id="depositOffer"></div>
      <div class="form-actions"><button class="primary-btn">Depositar</button></div>
    </form>
    <div id="depositPanel"></div>`;
}

function withdrawFormHtml() {
  const c = state.config || {};
  const min = c.minWithdraw ?? 20;
  const instant = c.instantWithdraw ?? 200;
  setTimeout(withdrawGate);
  return `<div class="pf-note warn">Mínimo €${min}. De €${min} a €${instant}: levantamento instantâneo. Acima de €${instant}: processado em 24 a 72 horas.
      Transferência bancária para uma conta em seu nome. Para levantar é necessário ter a identidade verificada e vencer uma aposta depois do último depósito.</div>
    <div id="withdrawGate"></div>
    <form data-form="withdraw"><div class="form-grid">
      <div class="field"><label>Valor (mín. €${min})</label><input name="amount" type="number" min="${min}" step="0.01" required inputmode="decimal"></div>
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
    <small class="muted pay-safe">🔒 Pagamento seguro processado pela Eupago.</small></div>`);

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

const TICKET_BADGE = { open: ['Em aberto', 'pending'], won: ['Ganha', 'won'], lost: ['Perdida', 'lost'], void: ['Anulada', 'void'], cashout: ['Cash Out', 'cashout'] };
// What the ticket is: the player's own picks, a bet builder, or one of the ready-made bets (its colour and icon).
const TICKET_KIND = {
  single: ['Simples', '🎯', 'own'], multiple: ['Múltipla', '🔗', 'own'], builder: ['Criador de apostas', '🧩', 'builder'],
  combo: ['Construa o seu ganho', '🧩', 'builder'], pick: ['Melhores escolhas', '🔥', 'pick'], acca: ['Apostas vencedoras', '🏆', 'acca'],
};
const LEG_MARK = { won: '✓', lost: '✕', void: '—' };

/** Where a pick's match stands: its kick-off, the clock and score in play, or the final score. */
function legState(l, open) {
  if (open && l.eventStatus === 'live') return `<span class="bt-live"><i class="pulse-dot"></i>${esc(l.clock || 'Ao vivo')}${l.score ? ` · ${esc(l.score)}` : ''}</span>`;
  if (l.eventStatus === 'finished') return `Terminado${l.score ? ` · ${esc(l.score)}` : ''}`;
  if (l.eventStatus === 'cancelled') return 'Jogo cancelado';
  if (l.eventStatus === 'live') return `Ao vivo${l.score ? ` · ${esc(l.score)}` : ''}`;
  return esc(fmtWhen(l.startTime));
}

/** One ticket: what it is (own picks, builder, ready-made), its status, each pick with where its match stands, the money, cash out, reference. */
function ticketCard(b) {
  const [badge, cls] = TICKET_BADGE[b.status] || TICKET_BADGE.open;
  const open = b.status === 'open';
  const builder = b.type === 'builder';
  const [title, icon, tone] = TICKET_KIND[b.origin] || TICKET_KIND[b.type] || TICKET_KIND.single;
  const n = b.legs.length;
  const first = b.legs[0];
  // A builder is one match: it is named once, at the top, with where it stands on a line of its own (a
  // long name is cut short, never the clock and score).
  const sub = builder ? `${sportBadge(first.sport, 14)} ${esc(first.match)}`
    : n > 1 ? `${tone === 'own' ? '' : '🔗 Combinação · '}${n} seleções` : esc(first.competition || '');
  const done = b.legs.filter((l) => l.status !== 'open').length;
  const bar = n > 1 ? `<div class="bt-bar" title="${done} de ${n} resolvidas">${b.legs.map((l) => `<i class="${l.status}"></i>`).join('')}</div>` : '';
  const legs = b.legs.map((l) => {
    const live = open && l.eventStatus === 'live';
    return `<a class="bt-leg ${l.status}${live ? ' live' : ''}" href="#/jogo/${l.eventId}">
      <span class="bt-mark">${LEG_MARK[l.status] || ''}</span>
      <span class="bt-pick"><strong>${esc(l.label || CODE_LABEL[l.code])}</strong>
        <small>${esc(l.marketName && l.market !== '1x2' ? l.marketName : 'Resultado final')}${builder ? '' : ` · ${esc(l.match)}`}</small>
        ${builder ? '' : `<small class="bt-when">${legState(l, open)}</small>`}</span>
      <b class="bt-odd">${fmtOdds(l.odds)}</b></a>`;
  }).join('');
  const ret = open ? ['Retorno potencial', money(b.potential), '']
    : b.status === 'lost' ? ['Retorno', money(0), 'red']
      : b.status === 'void' ? ['Reembolso', money(b.payout), '']
        : b.status === 'cashout' ? ['Cash out', money(b.payout), 'gold'] : ['Ganhou', money(b.payout), 'green'];
  const profit = open ? null : (b.freebet ? b.payout : b.payout - b.stake);
  const tags = [b.pickPct ? `<span class="bt-tag boost">🔥 ${b.pickPct >= 20 ? 'Super Boost' : 'Boost'} +${b.pickPct}% incluído na odd</span>` : '', b.boostPct ? `<span class="bt-tag boost">🚀 ${b.boostPct >= 20 ? 'Super Boost' : 'Boost'} +${b.boostPct}%${b.boost ? ` · ${money(b.boost)}` : ''}</span>` : '',
    b.freebet ? '<span class="bt-tag">🎁 Free bet</span>' : '', b.bonusStake ? `<span class="bt-tag">${money(b.bonusStake)} com bónus</span>` : '',
    b.protected ? '<span class="bt-tag">🛡️ Primeira aposta protegida</span>' : ''].join('');
  return `<div class="ticket ${cls} t-${tone}">
    <div class="bt-head"><span class="bt-ic">${icon}</span>
      <div class="bt-title"><strong>${title}${n > 1 && !builder ? ` <em>${n}</em>` : ''}</strong><small>${sub}</small>${builder ? `<span class="bt-when">${legState(first, open)}</span>` : ''}</div>
      <span class="bt-status ${cls}">${badge}</span></div>
    ${bar}${tags ? `<div class="bt-tags">${tags}</div>` : ''}
    <div class="bt-legs">${legs}</div>
    <div class="bt-sum">
      <div><small>Aposta</small><b>${money(b.stake)}</b></div>
      <div><small>Odd total</small><b>${fmtOdds(b.totalOdds)}</b></div>
      <div class="ret"><small>${ret[0]}</small><b class="${ret[2]}">${ret[1]}</b></div>
    </div>
    ${profit !== null && profit !== 0 ? `<div class="bt-profit ${profit > 0 ? 'green' : 'red'}">${profit > 0 ? 'Lucro' : 'Prejuízo'} ${profit > 0 ? '+' : ''}${money(profit)}</div>` : ''}
    ${b.id ? cashoutBlock(b) : ''}
    <div class="bt-foot"><button class="tk-ref" data-copy="${esc(b.ref)}" title="Copiar referência">Ref ${esc(b.ref)}</button>
      <span>${esc(fmtDateTime(b.settledAt && !open ? b.settledAt : b.createdAt))}</span>
      ${b.id ? `<button class="tk-share" data-share-bet="${b.id}">↗ Partilhar</button>` : ''}</div>
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
      label: sel.label, odds: sel.odds, match: `${tname(ev, 'home')} vs ${tname(ev, 'away')}`, competition: ev.competition,
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
    const base = Math.min(stake * odds, state.config?.maxPayout ?? Infinity);
    // Multiple boost (not with a free bet): its % of the winnings, paid on top.
    const boost = fb ? null : multipleBoost(items);
    const extra = boost?.pct ? Math.min(Math.floor((base - stake) * boost.pct) / 100, boost.max) : 0;
    return { stake, total: stake, odds, potential: net(base) + extra, freebet: fb, boost, boostAmount: extra };
  }
  if (fb && items.length === 1) return { stake, total: stake, odds: null, potential: net(Math.min(stake * items[0].odds, state.config?.maxPayout ?? Infinity)), freebet: fb };
  const potential = items.reduce((a, s) => a + Math.min(stake * s.odds, state.config?.maxPayout ?? Infinity), 0);
  // One pick: the boost box already shows how many more make a boosted multiple.
  return { stake, total: stake * items.length, odds: null, potential, boost: items.length === 1 && !fb ? multipleBoost(items) : null, boostAmount: 0 };
}

/**
 * The multiple boost for these picks: { pct, count, next: { n, pct, more } | null, minOdds, max }, or
 * null while the campaign is off. Only picks priced at minOdds or more count.
 */
function multipleBoost(items) {
  const c = state.config?.accaBoost;
  if (!c?.tiers?.length) return null;
  const count = items.filter((s) => s.odds >= c.minOdds).length;
  let pct = 0;
  for (const [n, p] of c.tiers) if (count >= n) pct = p;
  const nxt = c.tiers.find(([n]) => n > count);
  return { pct, count, minOdds: c.minOdds, max: c.maxBoost, next: nxt ? { n: nxt[0], pct: nxt[1], more: nxt[0] - count } : null };
}

/**
 * The boost box of the slip: "add N more events for X%", a line filling up with the picks (the
 * picks each step needs above it, its % below) and the boost of this multiple.
 */
function renderBoost(t) {
  const el = $('#slipBoost');
  const b = !state.builder && (state.mode === 'multiple' || state.slip.length === 1) ? t.boost : null;
  el.classList.toggle('hidden', !b);
  if (!b) return;
  const tiers = state.config.accaBoost.tiers;
  const head = b.next
    ? `Adicione mais ${b.next.more} ${b.next.more === 1 ? 'evento' : 'eventos'} para um bónus de ganho de ${b.next.pct}%`
    : `Bónus máximo de ${b.pct}% atingido 🔥`;
  el.innerHTML = `<div class="boost-head">🚀 ${esc(head)}</div>
    <div class="boost-scale">${tiers.map(([n]) => `<span class="${b.count >= n ? 'on' : ''}">${n}</span>`).join('')}</div>
    <div class="boost-line"><i></i></div>
    <div class="boost-scale pct">${tiers.map(([n, p]) => `<span class="${b.count >= n ? 'on' : ''}">${p}%</span>`).join('')}</div>
    <div class="boost-foot"><span>🚀 Boost de múltipla</span><b><span class="boost-pct">${b.pct}%</span> = ${money(t.boostAmount || 0)}</b></div>`;
  // The line reaches each step's mark as its picks are added (the CSP refuses style="", the CSSOM is fine).
  const last = tiers.length - 1;
  const at = (i) => (last ? i / last : 1);
  let fill = 0;
  if (b.count >= tiers[last][0]) fill = 1;
  else if (b.count < tiers[0][0]) fill = (b.count / tiers[0][0]) * 0.04;
  else {
    const i = tiers.findIndex(([n], k) => b.count >= n && b.count < tiers[k + 1][0]);
    fill = at(i) + ((b.count - tiers[i][0]) / (tiers[i + 1][0] - tiers[i][0])) * (at(i + 1) - at(i));
  }
  $('.boost-line i', el).style.width = `${Math.max(fill, b.count ? 0.03 : 0) * 100}%`;
}

function renderBuilderSlip() {
  $('#slipBoost').classList.add('hidden');
  const b = state.builder;
  const n = b.legs.length;
  $('#betCount').textContent = 'Criador de apostas';
  $('#slipFabCount').textContent = n;
  $('#slipFab').classList.toggle('hidden', false);
  $$('.bet-tabs button').forEach((x) => x.classList.remove('active'));
  const changed = b.legs.some((l) => l.newOdds);
  $('#betItems').innerHTML = `<div class="bet-item${changed ? ' warn' : ''}">
      ${b.boost ? `<div class="pick-ribbon in-slip${b.boost.pct >= 20 ? ' super' : ''}">${ICON_ROCKET}${b.boost.pct}% ${b.boost.pct >= 20 ? 'SUPER BOOST' : 'BOOST'}</div>` : ''}
      <div class="bet-item-top"><span>${esc(b.competition)} · ${b.boost ? 'Melhor escolha' : 'Criador de apostas'}</span><span><span class="odd">${fmtOdds(builderTotal(b))}</span><button class="remove-bet" data-remove-builder aria-label="Remover">×</button></span></div>
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
  renderBoost(t);

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
        ? { mode: 'builder', stake, freebetId: freebet?.id, pickKey: b.boost?.key, origin: b.combo && b.combo === legKey(b.legs) ? 'combo' : undefined, selections: b.legs.map((l) => ({ selectionId: l.selectionId, odds: l.odds })) }
        : { mode: state.mode, stake, freebetId: freebet?.id, origin: slipOrigin(), selections: state.slip.map((s) => ({ selectionId: s.selectionId, odds: s.odds })) },
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
      await refreshEvents({ full: true });
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
    // Playing free spins: the header shows how many are left ("5 Free Spins"), never a balance.
    const fsg = state.casinoSession;
    $('#headerBalance').textContent = fsg?.fs && !fsg.fsEnded && fsg.fsLeft !== null ? fsCount(fsg.fsLeft) : money(u.balance);
    // Open tickets on the ticket button.
    const open = (state.myBets || []).filter((b) => b.status === 'open').length;
    $('#myBetsCount').textContent = open || '';
    $('#myBetsCount').classList.toggle('hidden', !open);
    // Free bets beside the balance (shown only, not a button): "5,00 F".
    const fb = Number(u.freebet) || 0;
    $('#freebetPill').classList.toggle('hidden', !fb);
    $('#headerFreebet').textContent = `${fb.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} F`;
    // The player's emblem (the one on the profile page); the initials only if there is none.
    const pb = $('#profileBtn');
    pb.classList.toggle('emblem', !!u.avatar);
    pb.innerHTML = u.avatar ? `<img src="/media/avatar-${esc(u.avatar)}.webp" alt="" width="38" height="38">` : esc(initials(u.name));
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
  // Tennis tours (ATP, WTA, Challengers) keep the server's order, ahead of the countries.
  const sorted = [...tree.filter((c) => c.tour), ...tree.filter((c) => !c.tour).sort((a, b) => countryLabel(a.country).localeCompare(countryLabel(b.country), 'pt'))];
  return `<div class="side-tree">${sorted.map(({ country, leagues }) => {
    const total = leagues.reduce((n, l) => n + l.count, 0);
    const open = state.sideOpen[`${sport}|${country}`] || leagues.some((l) => l.name === current);
    return `<button class="side-country${open ? ' open' : ''}${total ? '' : ' none'}" data-side-country="${esc(`${sport}|${country}`)}">
        <i class="caret">${open ? '▾' : '▸'}</i>${countryFlag(country)}${esc(countryLabel(country))}<b>${total || ''}</b></button>
      ${open ? leagues.map((l) => `<a class="side-league${l.name === current ? ' active' : ''}${l.count ? '' : ' none'}" href="#/desporto/liga/${encodeURIComponent(l.name)}">
        ${l.flag ? `<img class="side-flag small" src="https://flagcdn.com/w40/${esc(l.flag)}.png" alt="" loading="lazy">` : ''}${esc(l.label || leagueShort(l.name))}<b>${l.count || ''}</b></a>`).join('') : ''}`;
  }).join('')}</div>`;
}

function renderSidebar() {
  renderSideInvite();
  const counts = {};
  for (const e of state.events) counts[e.sport] = (counts[e.sport] || 0) + 1;
  $('#sportLinks').innerHTML = Object.entries(SPORT_META)
    .map(([k, v]) => {
      const tree = !!state.leagueTree?.[k];
      return `<a class="side-link" href="#/desporto" data-sport-link="${k}"${tree ? ` data-side-open="${k}"` : ''}><span>${sportBadge(k, 20)}</span> ${v.name} <b>${counts[k] || ''}</b>${tree ? `<i class="caret">${state.sideOpen[k] ? '▾' : '▸'}</i>` : ''}</a>${sideTree(k)}`;
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

/**
 * Brings `root` to the given HTML changing only what differs: a refresh (odds, clock, score) touches
 * just those nodes, so badges, casino pictures and buttons stay as they are instead of being built
 * again (which made every picture blink). Children are matched in order, or by a key (id, link,
 * data-key…) when a list gains or loses a row, so the rows below keep their pictures too.
 */
const nodeKey = (n) => (n.nodeType === 1 ? n.id || n.getAttribute('data-key') || n.getAttribute('data-event-id') || n.getAttribute('data-game-id')
  || n.getAttribute('data-hscroll') || (n.tagName === 'A' ? n.getAttribute('href') : null) || null : null);
function morphNode(cur, next) {
  if (cur.nodeType !== 1) { if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue; return; }
  for (const a of [...cur.attributes]) if (!next.hasAttribute(a.name)) cur.removeAttribute(a.name);
  for (const a of [...next.attributes]) if (cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value);
  if (cur.tagName === 'IFRAME' || cur.tagName === 'VIDEO' || cur.tagName === 'CANVAS') return;
  morphChildren(cur, next);
}
function morphChildren(parent, nextParent) {
  const next = [...nextParent.childNodes];
  const keyed = new Map();
  for (const c of parent.childNodes) { const k = nodeKey(c); if (k && !keyed.has(`${c.tagName}|${k}`)) keyed.set(`${c.tagName}|${k}`, c); }
  const placed = new Set();
  next.forEach((n, i) => {
    let cur = parent.childNodes[i] || null;
    const k = nodeKey(n);
    const match = k ? keyed.get(`${n.tagName}|${k}`) : null;
    if (match && match !== cur && !placed.has(match)) { parent.insertBefore(match, cur); cur = match; }
    const same = cur && !placed.has(cur) && cur.nodeType === n.nodeType
      && (n.nodeType !== 1 || (cur.tagName === n.tagName && nodeKey(cur) === k));
    if (same) morphNode(cur, n);
    else { parent.insertBefore(n, cur); cur = n; }
    placed.add(cur);
  });
  while (parent.childNodes.length > next.length) parent.lastChild.remove();
}
function morph(root, html) {
  const fresh = document.createElement('template');
  fresh.innerHTML = html;
  morphChildren(root, fresh.content);
}

function currentRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [page = '', sub = '', ...rest] = path.split('/');
  return { page: page || 'home', sub, rest: rest.join('/'), query: new URLSearchParams(query) };
}

function render({ keepScroll = false } = {}) {
  const { page, sub, rest } = currentRoute();
  if (page === 'bilhete') { openSharedTicket(sub); return; }
  const pages = {
    b: () => sharedBetPage(sub),
    home: homePage, desporto: () => sportsPage(sub, rest), 'ao-vivo': livePage, casino: () => (sub === 'jogo' && rest ? casinoGamePage(Number(rest)) : sub === 'colecao' && rest ? casinoCollectionPage(Number(rest)) : casinoPage()),
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
    // The balance follows each spin (every 2 s); in a background tab every 30 s, which also tells the
    // server the game is still open (otherwise it brings the balance back after 3 minutes).
    let tick = 0;
    state.casinoTimer = setInterval(() => {
      tick += 1;
      if (state.casinoSession?.url && (!document.hidden || tick % 15 === 0)) refreshCasinoBalance();
    }, 2_000);
  }
  document.body.classList.toggle('immersive', immersive);
  // The casino has no sports menu nor bet slip: its pages take the whole width.
  document.body.classList.toggle('casino-mode', page === 'casino' && !immersive);
  if (page === 'casino' && !immersive) renderCasinoSide();
  // Carousels (and the casino row) keep their position when the page refreshes itself (odds, live
  // scores): only the person scrolling moves them, never the refresh.
  const carScroll = keepScroll ? $$('#content [data-hscroll]').map((t) => [t.dataset.hscroll, t.scrollLeft]) : [];
  const html = immersive ? casinoPlayPage() : (pages[page] || homePage)();
  // A playing video must never leave the document: an iframe that is detached, even for a moment,
  // reloads (black "Loading stream…", sound lost). The match page refreshes every few seconds, so
  // there the new page is merged around the slot that holds it instead of replacing everything.
  const keep = page === 'jogo' ? $('#content #trackerInline') : null;
  if (keep?.querySelector('iframe')) mergeKeeping($('#content'), html, 'trackerInline');
  // A refresh of the same page changes only what moved; a new page is built whole.
  else if (keepScroll && $('#content').dataset.page === page) morph($('#content'), html);
  else $('#content').innerHTML = html;
  $('#content').dataset.page = page;
  for (const [key, left] of carScroll) { const t = $(`#content [data-hscroll="${key}"]`); if (t) t.scrollLeft = left; }
  if (page === 'jogo') afterMatchRender();
  if (immersive) placeSkins();
  watchCasinoMore();
  watchSportsMore();
  $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === page));
  if (!keepScroll) window.scrollTo({ top: 0 });
  showMaintenance(page);
}

// Maintenance (switched in the admin): a full screen over the site, or over sports only (the casino,
// my bets and the account stay open, reached from the screen's buttons). Admins see the site with a
// strip saying the screen is on.
const MAINT_SPORTS = new Set(['home', 'desporto', 'ao-vivo', 'jogo', 'b']);
function showMaintenance(page) {
  const m = state.config?.maintenance;
  $('#maintenance')?.remove();
  $('#maintStrip')?.remove();
  document.body.classList.remove('maint-on');
  if (!m) return;
  if (state.user?.role === 'admin') {
    document.body.insertAdjacentHTML('beforeend', `<div id="maintStrip" class="maint-strip">🛠️ Manutenção ativa (${m.scope === 'all' ? 'site todo' : 'desporto'}): os jogadores veem o ecrã de manutenção. <a href="/admin#feed">Desligar no admin</a></div>`);
    return;
  }
  if (m.scope !== 'all' && !MAINT_SPORTS.has(page)) return;
  document.body.classList.add('maint-on');
  const links = m.scope === 'all' ? '' : `<div class="maint-links"><a class="primary-btn" href="#/casino">Ir para o Casino</a>
    ${state.user ? '<a class="ghost-btn" href="#/apostas">As minhas apostas</a>' : ''}</div>`;
  document.body.insertAdjacentHTML('beforeend', `<div id="maintenance" class="maint" role="alertdialog" aria-live="polite">
    <div class="maint-box"><span class="brand-word">BET<span>62</span></span>
      <div class="maint-icon" aria-hidden="true">🛠️</div>
      <h1>Estamos em manutenção</h1>
      <p class="maint-soon">Brevemente disponível.</p>
      ${m.message ? `<p class="maint-msg">${esc(m.message)}</p>` : ''}
      ${m.scope === 'all' ? '' : '<p class="maint-note">As apostas desportivas estão em pausa. As suas apostas em aberto continuam guardadas.</p>'}
      ${links}</div></div>`);
}

/** The phone menu: opened and closed by its button (or a swipe), never by a page refresh. */
function setSideMenu(open) {
  $('#leftSidebar').classList.toggle('open', open);
  $('#menuBtn')?.setAttribute('aria-expanded', String(open));
}

/** Re-renders only pages that show odds, and never while the user is typing. */
let swipingUntil = 0;
for (const ev of ['touchstart', 'touchmove', 'wheel']) {
  document.addEventListener(ev, (e) => { if (e.target.closest?.('[data-hscroll]')) swipingUntil = Date.now() + 1500; }, { passive: true });
}
document.addEventListener('scroll', (e) => { if (e.target.matches?.('[data-hscroll]')) swipingUntil = Date.now() + 1500; }, { capture: true, passive: true });

function refreshView() {
  const { page } = currentRoute();
  if (!['home', 'desporto', 'ao-vivo'].includes(page)) return;
  // Someone is swiping a carousel: this refresh waits for the next one, the gesture is not cut.
  if (Date.now() < swipingUntil) return;
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
    const r = currentRoute();
    if (first && (r.sub === 'liga' || r.page === 'home' || (r.page === 'desporto' && !r.sub))) render({ keepScroll: true });
  } catch { /* the sidebar works without it */ }
}

/**
 * The board. The whole of it (pre-match up to two weeks ahead and live) is read at most every 30 s
 * (or when asked: coming back to the page, odds changed on a bet); in between, every poll reads only
 * the live games, a far smaller answer, and lays them over the last pre-match list. A finished game
 * leaves "Ao vivo" on the next poll; a pre-match game whose start has passed drops off.
 */
let board = { events: [], at: 0 };
async function refreshEvents({ full = false, prefetched = null } = {}) {
  try {
    let events;
    if (prefetched || full || !state.eventsLoaded || Date.now() - board.at > 30_000) {
      ({ events } = prefetched ? await prefetched : await api('/api/events'));
      board = { events, at: Date.now() };
    } else {
      const { events: live } = await api('/api/events?status=live');
      const liveIds = new Set(live.map((e) => e.id));
      const now = new Date().toISOString();
      events = [...live, ...board.events.filter((e) => e.status !== 'live' && !liveIds.has(e.id) && e.startTime > now)]
        .sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));
    }
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
    if (user) { loadPromos(); loadBets({ quiet: true }); checkWins(); pushCheck(); } else state.promos = null;
  } catch (err) {
    // Only a real sign-out clears the account; a dropped connection keeps the last balance shown.
    if (err.status === 401) state.user = null;
  }
  updateHeader();
}

// ---------- won bets: the full-screen "Ganhou!" (winfx.js) and the notifications on the phone ----------

let winsBusy = false;
async function checkWins() {
  if (!state.user || winsBusy || playingCasino() || document.hidden || $('.win-fx')) return;
  winsBusy = true;
  try {
    const { wins } = await api('/api/me/wins');
    if (wins?.length) {
      celebrate(wins, {
        money, esc, sportIcon: (k) => sportBadge(k, 18),
        onShare: (b) => shareBet(b.id, `Bilhete premiado na Bet62 🏆 ${money((Number(b.payout) || 0) + (Number(b.boost) || 0))} com odd ${fmtOdds(b.totalOdds)}`),
        onClose: (ids) => { api('/api/me/wins/seen', { method: 'POST', body: { ids } }).catch(() => {}); refreshMe(); },
      });
    }
  } catch { /* the next poll tries again */ } finally { winsBusy = false; }
}

// Web Push (server/push.js): asked once after signing in, again 30 days after a "not now".
const PUSH_ASKED = 'bet62_push_asked';
let pushChecked = false;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const urlB64 = (b64) => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
async function pushKey() {
  if (state.pushKey === undefined) state.pushKey = (await api('/api/push/key').catch(() => ({}))).key || null;
  return state.pushKey;
}
async function pushSubscribe() {
  const key = await pushKey();
  if (!key) return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Made under other keys (the site's changed): replaced.
  const same = sub?.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === key;
  if (sub && !same) { await sub.unsubscribe().catch(() => {}); sub = null; }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
  await api('/api/me/push', { method: 'POST', body: { subscription: sub.toJSON() } });
  return true;
}
async function pushCheck() {
  if (pushChecked || !state.user || !pushSupported()) return;
  pushChecked = true;
  if (!(await pushKey())) return;
  if (Notification.permission === 'granted') { pushSubscribe().catch(() => {}); return; }
  if (Notification.permission !== 'default') return;
  let asked = 0;
  try { asked = Number(localStorage.getItem(PUSH_ASKED) || 0); } catch { /* ignore */ }
  if (Date.now() - asked < 30 * 86_400_000) return;
  setTimeout(() => {
    if (!state.user || !$('#modalBackdrop').classList.contains('hidden') || $('.win-fx') || playingCasino()) { pushChecked = false; return; }
    openModal('Avisos da Bet62', `<div class="promo-ask"><div class="promo-ask-icon" aria-hidden="true">🔔</div>
      <p><b>Saiba logo quando a sua aposta ganhar.</b></p>
      <p class="muted">Avisamos no telemóvel quando um bilhete é ganho, mesmo com a app fechada. Pode desligar quando quiser.</p>
      <div class="promo-ask-acts"><button class="primary-btn" data-action="push-yes">Ativar avisos</button><button class="outline-btn" data-action="push-no">Agora não</button></div></div>`);
  }, 6000);
}
async function pushYes() {
  try { localStorage.setItem(PUSH_ASKED, String(Date.now())); } catch { /* ignore */ }
  closeModal();
  try {
    if ((await Notification.requestPermission()) !== 'granted') { toast('Avisos desligados', 'Pode ativá-los nas definições do navegador.', 'error'); return; }
    await pushSubscribe();
    toast('Avisos ativados', 'Vai saber logo quando a sua aposta ganhar.');
    if (currentRoute().sub === 'notificacoes') render({ keepScroll: true });
  } catch (err) { toast('Erro', err.message || 'Não foi possível ativar os avisos.', 'error'); }
}

/**
 * Coming back to the page (tab shown again, app reopened, phone unlocked, back online): fetch
 * everything fresh at once instead of waiting for the next poll, so old data never stays on screen.
 */
let lastResume = 0;
/**
 * A casino game is open full screen. The sports board, the leagues and the account are not
 * refreshed meanwhile: on phones (and Safari) the game's frame shares the page's thread, and
 * fetching and redrawing them every few seconds made the games stutter. Only the balance is kept fresh.
 */
const playingCasino = () => { const r = currentRoute(); return r.page === 'casino' && r.sub === 'jogar' && !!state.casinoSession; };

async function resume() {
  if (document.hidden || Date.now() - lastResume < 2000) return;
  // Back from the game's frame (a click outside it focuses the page): only the balance.
  if (playingCasino()) { refreshCasinoBalance(); return; }
  lastResume = Date.now();
  try {
    const c = await api('/api/config');
    // A deploy happened while away: load the new version.
    if (state.config?.version && c.version && c.version !== state.config.version && !state.casinoSession) { window.location.reload(); return; }
  } catch { /* offline: the polls retry */ }
  await Promise.all([refreshMe(), refreshEvents({ full: true }), loadLeagues()]);
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
    let user;
    try {
      ({ user } = await api('/api/auth/login', { method: 'POST', body: { email: d.email, password: d.password, code: d.code } }));
    } catch (err) {
      // An administrator with two-step sign-in: the code field appears.
      if (err.data?.need2fa && !$('input[name="code"]', form)) {
        const field = document.createElement('div');
        field.className = 'field';
        field.innerHTML = '<label>Código de verificação</label><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000">';
        $('button', form).before(field);
      }
      throw err;
    }
    state.user = user;
    closeModal();
    toast('Sessão iniciada', `Bem-vindo, ${user.name.split(' ')[0]}.`);
    updateHeader(); renderSlip(); render({ keepScroll: true });
    setTimeout(askPromos, 2500);
  },
  async register(form) {
    const d = formData(form);
    const { user } = await api('/api/auth/register', {
      method: 'POST',
      body: { name: d.name, email: d.email, birthdate: d.birthdate, phone: d.phone, password: d.password, acceptTerms: form.acceptTerms.checked, promos: form.promos.checked, pep: form.pep.checked, ref: referralCode() || undefined },
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
    toast('Comprovativo enviado', 'A equipa vai analisá-lo em até 48 horas úteis.');
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
      if (p.method === 'cartao') {
        if (p.redirectUrl && /^https:\/\//i.test(p.redirectUrl)) {
          const providerUrl = new URL(p.redirectUrl);
          if (providerUrl.hostname === 'eupago.pt' || providerUrl.hostname.endsWith('.eupago.pt')) {
            location.assign(providerUrl.href);
            return;
          }
          throw new Error('A Eupago devolveu um endereço de pagamento não reconhecido. Contacte o suporte.');
        }
        if (res.clientSecret && res.publishableKey) return showCardForm(p, res.clientSecret, res.publishableKey);
        throw new Error('Não foi possível abrir o pagamento por cartão. Confirme a configuração do serviço Cartão de Crédito na Eupago.');
      }
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
    toast('Depósito efetuado', `Novo saldo: ${money(res.balance)}${res.bonus ? ` · ${res.bonus.name}: ${res.bonus.spins ? `${res.bonus.spins} rodadas grátis` : money(res.bonus.amount)}` : ''}`);
    updateHeader(); loadWallet(); loadPromos();
  },
  async withdraw(form) {
    const d = formData(form);
    let res;
    try {
      res = await api('/api/wallet/withdraw', { method: 'POST', body: { amount: d.amount, iban: d.iban } });
    } catch (err) {
      // Not allowed yet (identity not verified, no bet won since the last deposit…): said in a notification.
      if (err.data?.code) { toast('Levantamento indisponível', err.message, 'error'); withdrawGate(); return; }
      // A deposit bonus is running: withdrawing cancels it, so the player confirms first.
      if (!err.data?.bonusActive || !confirm(`${err.message}\n\nContinuar com o levantamento?`)) throw err;
      res = await api('/api/wallet/withdraw', { method: 'POST', body: { amount: d.amount, iban: d.iban, forfeitBonus: true } });
      loadPromos(); refreshMe();
    }
    state.user.balance = res.balance;
    form.reset();
    if (form.closest('#modal')) closeModal();
    if (res.payout === 'paid' || res.payout === 'processing') {
      toast('Levantamento processado', res.payout === 'paid' ? 'Pago automaticamente: o valor deve chegar à sua conta em poucos minutos.' : 'Aprovado e em pagamento automático: o valor chega à sua conta em breve.');
    } else if (res.payout === 'failed') {
      toast('Levantamento recebido', 'O seu pedido está a ser tratado pela nossa equipa.');
    } else {
      toast(res.instant ? 'Levantamento aprovado' : 'Levantamento pedido',
        res.instant ? 'Levantamento instantâneo: a transferência segue para o seu IBAN.' : 'Acima de €' + ((state.config || {}).instantWithdraw ?? 200) + ': processado pela equipa em 24 a 72 horas.');
    }
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
  const statTabBtn = e.target.closest('[data-stat-tab]');
  if (statTabBtn) { state.match.statTab = statTabBtn.dataset.statTab; render({ keepScroll: true }); return; }
  const standBtn = e.target.closest('[data-stand-view]');
  if (standBtn) { state.match.standView = standBtn.dataset.standView; render({ keepScroll: true }); return; }

  const remove = e.target.closest('[data-remove]');
  if (remove) {
    state.slip = state.slip.filter((s) => s.selectionId !== Number(remove.dataset.remove));
    saveSlip(); autoMode(); syncSelectedButtons(); renderSlip();
    return;
  }

  const pickBtn = e.target.closest('[data-pick]');
  if (pickBtn) { addPick(Number(pickBtn.dataset.pick)); return; }
  const builderBtn = e.target.closest('[data-builder]');
  if (builderBtn) { addBuilder(Number(builderBtn.dataset.builder)); return; }
  const accaBtn = e.target.closest('[data-acca]');
  if (accaBtn) { addAcca(Number(accaBtn.dataset.acca), accaBtn.dataset.accaList); return; }
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

  const replay = e.target.closest('[data-play-id]');
  if (replay) {
    const id = Number(replay.dataset.playId);
    state.casinoAutoPlay = id;
    // Already loaded (came back from it): play now; else the game page plays it as soon as it loads.
    if (state.casinoGame?.id === id && state.casinoGame.data?.game) { state.casinoAutoPlay = null; playCasino('real'); }
    else location.hash = `#/casino/jogo/${id}`;
    return;
  }
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
  const shareBetBtn = e.target.closest('[data-share-bet]');
  if (shareBetBtn) { shareBet(Number(shareBetBtn.dataset.shareBet)); return; }
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
  // A tab or provider (from the chips, a row or the casino menu): its games on the casino page.
  const list = e.target.closest('[data-casino-list]');
  if (list) {
    const r = (state.casinoRows || [])[Number(list.dataset.casinoList)];
    if (r) { state.casinoView = { title: r.title, games: r.games, recent: r.key === 'recent' }; render(); window.scrollTo({ top: 0 }); }
    return;
  }
  const cat = e.target.closest('[data-casino-cat]');
  const prov = !cat && e.target.closest('[data-casino-prov]');
  if (cat || prov) {
    state.casinoView = null;
    Object.assign(state.casinoFilter, cat ? { category: cat.dataset.casinoCat, provider: '', q: '' } : { provider: prov.dataset.casinoProv, category: '', q: '' });
    const box = $('#casinoSearch');
    if (box) box.value = '';
    setSideMenu(false);
    if (location.hash !== '#/casino') location.hash = '#/casino';
    loadCasino({ reset: true });
    window.scrollTo({ top: 0 });
    return;
  }
  if (e.target.closest('[data-close-menu]')) { setSideMenu(false); return; }

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
  const promoAnswer = e.target.closest('[data-action="promo-answer"]');
  if (promoAnswer) {
    const yes = promoAnswer.dataset.yes === '1';
    closeModal();
    try {
      const { user } = await api('/api/me', { method: 'PATCH', body: { prefs: { notifyPromos: yes, notifySms: yes, promoAsked: true } } });
      state.user = user;
      if (yes) toast('Obrigado!', `Vai receber as nossas promoções por email${user.prefs?.notifySms ? ' e SMS' : ''}.`);
    } catch (err) { toast('Erro', err.message, 'error'); }
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
      if (on && (k === 'notifyPush' || k === 'notifyPushPromos') && pushSupported() && Notification.permission === 'default') pushYes();
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
  else if (action === 'push-yes') pushYes();
  else if (action === 'install-guide') window.bet62InstallGuide?.();
  else if (action === 'push-no') { try { localStorage.setItem(PUSH_ASKED, String(Date.now())); } catch { /* ignore */ } closeModal(); }
  else if (action === 'cban-go') { const t = $('#cbanTrack'); if (t) cbanGo(cbanIndex(t) + Number(actionEl.dataset.dir)); }
  else if (action === 'cban-dot') cbanGo(Number(actionEl.dataset.i));
  else if (action === 'cg-fav') {
    const id = Number(actionEl.dataset.id), on = !isFavorite(id);
    const g = state.casinoGame?.id === id ? state.casinoGame.data?.game : null;
    // Shown at once; put back if the server refuses.
    const m = state.casinoMine;
    if (m) m.favorites = on ? [g || { id, name: '', provider: '' }, ...m.favorites] : m.favorites.filter((x) => x.id !== id);
    render({ keepScroll: true });
    api('/api/casino/favorite', { method: 'POST', body: { gameId: id, on } })
      .then(() => { toast(on ? 'Juntado aos favoritos' : 'Tirado dos favoritos'); ensureCasinoMine(true); })
      .catch((err) => { toast('Erro', err.message, 'error'); ensureCasinoMine(true); });
  }
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
  } else if (action === 'kyc-camera') {
    kycCamera();
  } else if (action === 'fs-toggle') {
    const d = state.fsActive;
    if (!state.fsExpanded && d?.freeSpins?.chosenGame && d.games?.[0]) {
      location.hash = `#/casino/jogo/${d.games[0].id}`;
    } else {
      state.fsExpanded = !state.fsExpanded;
      render({ keepScroll: true });
    }
  } else if (action === 'fs-more') {
    openFreeSpins();
  } else if (action === 'fs-pick') {
    const d = state.fsActive;
    const g = d?.games.find((x) => String(x.id) === actionEl.dataset.id);
    if (!g) return;
    if (!d.freeSpins.chosenGame) {
      if (!confirm(`Usar as Free Spins em ${g.name}? Depois de escolher não é possível trocar de jogo.`)) return;
      try {
        await api(`/api/me/free-spins/${d.freeSpins.id}/choose`, { method: 'POST', body: { gameId: g.id } });
        d.freeSpins.chosenGame = g.id;
        d.games = [g];
      } catch (err) { toast('Free Spins', err.message, 'error'); return; }
    }
    closeModal();
    state.fsExpanded = false;
    location.hash = `#/casino/jogo/${g.id}`;
  } else if (action === 'fs-claim') {
    if (!confirm('Terminar as Free Spins? Os ganhos passam a saldo real; as rodadas por jogar deixam de estar disponíveis.')) return;
    try {
      const r = await api(`/api/me/free-spins/${actionEl.dataset.id}/claim`, { method: 'POST', body: {} });
      state.user = r.user;
      toast('Free Spins terminadas', r.paid > 0 ? `${money(r.paid)} de ganhos creditados no saldo.` : 'Sem ganhos a pagar.');
      updateHeader(); loadPromos(); loadFreeSpins();
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
  // A league logo that fails: the country's flag instead (or the globe).
  if (img instanceof HTMLImageElement && img.classList.contains('lg-logo')) {
    const badge = img.parentElement;
    badge?.classList.remove('logo');
    if (img.dataset.flag) { img.classList.remove('lg-logo'); img.src = img.dataset.flag; delete img.dataset.flag; } else img.replaceWith(Object.assign(document.createElement('i'), { textContent: img.dataset.icon || '🌍' }));
    return;
  }
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
  BROKEN_IMG.add(img.getAttribute('src'));
  // The feed's badge did not load: the one found here (API-Football…).
  if (img.dataset.alt) {
    img.src = img.dataset.alt;
    delete img.dataset.alt;
    return;
  }
  // No player photo: show the flag instead.
  if (img.dataset.fallback) {
    img.src = img.dataset.fallback;
    delete img.dataset.fallback;
    img.parentElement.classList.add('flag');
    return;
  }
  const box = img.parentElement;
  box.classList.remove('has-logo');
  box.classList.remove('flag', 'kit-photo');
  // No badge after all: the shirt (players keep their initials).
  if (box.classList.contains('player') || box.dataset.kit === 'none') box.textContent = box.classList.contains('mini') ? box.dataset.initials.slice(0, 1) : box.dataset.initials;
  else { box.classList.add('kit'); box.innerHTML = jerseySvg(box.dataset.name, box.dataset.kit ? box.dataset.kit.split(',') : null); }
}, true);
// A league badge that fails to load falls back to the sport icon.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.classList.contains('league-img')) img.parentElement.innerHTML = sportBadge(img.parentElement.dataset.sportIcon);
}, true);
// A 204 response is a "successful" empty image: treat zero-size loads the same way.
document.addEventListener('load', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && (img.classList.contains('team-logo') || img.classList.contains('league-img')) && !img.naturalWidth) img.dispatchEvent(new Event('error'));
}, true);

// "As minhas promoções" opens and closes; remembered while the app is open.
document.addEventListener('toggle', (e) => {
  if (e.target.matches?.('[data-promos-toggle]')) state.promosOpen = e.target.open;
}, true);

let casinoSearchTimer = null;
document.addEventListener('input', (e) => {
  if (e.target.id === 'casinoSearch') {
    clearTimeout(casinoSearchTimer);
    casinoSearchTimer = setTimeout(() => {
      Object.assign(state.casinoFilter, { q: e.target.value.trim(), category: '', provider: '' });
      state.casinoView = null;
      if (location.hash !== '#/casino') location.hash = '#/casino';
      loadCasino({ reset: true });
    }, 350);
  }
  if (e.target.id === 'searchInput') renderSearch(e.target.value);
  if (e.target.id === 'stake') renderSlip();
  if (e.target.closest('form[data-form="deposit"]')) depositOffer();
});
document.addEventListener('change', (e) => { if (e.target.closest('form[data-form="deposit"]')) depositOffer(); });

// What the deposit typed would earn (decided again by the server when the payment is confirmed).
let offerTimer = null;
/** Why the player cannot withdraw yet (the wallet's withdraw form): a notice, and the button off. */
async function withdrawGate() {
  const box = $('#withdrawGate');
  if (!box || !state.user) return;
  let g;
  try { g = await api('/api/wallet/withdraw/eligibility'); } catch { return; }
  const box2 = $('#withdrawGate');
  if (!box2) return;
  const button = box2.parentElement?.querySelector('form[data-form="withdraw"] button');
  if (button) button.disabled = !g.eligible;
  box2.innerHTML = g.eligible ? '' : `<div class="pf-note bad"><b>Levantamento indisponível.</b> ${esc(g.message)}${g.code === 'KYC_REQUIRED' ? ' <a href="#/perfil/verificacao" data-action="close-modal">Verificar identidade</a>' : ''}</div>`;
}

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
      const dep = money(Number(form.amount.value) || 0);
      const tiers = (fmt) => (o.tiers?.length ? `<small class="offer-tiers">${o.tiers.map(([d, n]) => `${money(d)} → ${fmt(n)}`).join(' · ')}</small>` : '');
      box.innerHTML = o.freebet > 0
        ? `<div class="offer ok">🎟️ Deposite <b>${dep}</b> e ganhe <b>${money(o.freebet)} em Free Bet</b> (odd mínima ${fmtOdds(o.minOdds)}). O lucro é pago em saldo real.${tiers(money)}</div>`
        : o.spins > 0
        ? `<div class="offer ok">🎰 Deposite <b>${dep}</b> e ganhe <b>${o.spins} Free Spins</b>. Os ganhos passam a saldo real.${tiers((n) => `${n} rodadas`)}</div>`
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
  // Search typed in the phone menu: Enter puts the menu away to show the games found.
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'casinoSearch') { e.target.blur(); setSideMenu(false); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); setSlipOpen(false); const big = $('.expanded'); if (big) toggleExpand(big); } });
  window.addEventListener('hashchange', () => { state.profileCollapsed = false; render(); });
  // The bottom bar (and the top menu): the tab lights up and the page changes as soon as it is touched,
  // not when the finger lifts.
  document.addEventListener('pointerdown', (e) => {
    const a = e.target.closest?.('.mobile-nav a[href], .topnav a[href]');
    if (!a || e.button > 0) return;
    $$('[data-route]').forEach((x) => x.classList.toggle('active', x.dataset.route === a.dataset.route));
    const hash = a.getAttribute('href');
    if (hash.startsWith('#') && location.hash !== hash) requestAnimationFrame(() => { location.hash = hash; });
  }, { passive: true });
  // A game touched (or hovered): its page starts loading before the tap ends.
  const ahead = (ev) => { const id = Number(ev.target.closest?.('[data-open]')?.dataset.open); if (id > 0 && state.match.id !== id) prefetchMatch(id); };
  document.addEventListener('pointerdown', ahead, { passive: true });
  // With a mouse, only a game the pointer rests on (not every card it crosses).
  let hover = null;
  document.addEventListener('mouseover', (ev) => {
    clearTimeout(hover);
    hover = setTimeout(() => ahead(ev), 150);
  }, { passive: true });
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
  goalkick: 'Pontapé de baliza', penalty: 'Penálti', shot: 'Remate', halftime: 'Intervalo', var: 'Revisão VAR',
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
  clearTimeout(m.clipTimer);
  drop3D();
  Object.assign(m, { score: null, kickoff: null, cornerWatch: null, clipGate: null, clipToken: null, clipTimer: null, clipHold: null });
  Object.assign(m, { id: null, data: null, extras: null, insights: null, picks: null, statTab: 'aovivo', tab: 'mercados', cat: 'todos', view: 'tracker', es: null, timer: null, ball: null, prevBall: null, actions: [], live: null, streaming: false, widget: null, widgetKind: null, streamEl: null, streamKey: null });
  clearTimeout(m.streamTimer);
  $('#sideTracker')?.replaceChildren();
}

// A match page read ahead: when the finger touches a game (or the mouse rests on it), its page is
// already on its way, so opening it shows everything at once. Kept a few seconds only.
const prefetched = new Map(); // id → { at, promise }
function prefetchMatch(id) {
  const hit = prefetched.get(id);
  if (hit && Date.now() - hit.at < 8_000) return;
  const promise = api(`/api/events/${id}`);
  promise.catch(() => prefetched.delete(id));
  prefetched.set(id, { at: Date.now(), promise });
  if (prefetched.size > 20) prefetched.delete(prefetched.keys().next().value);
}
function takePrefetched(id) {
  const hit = prefetched.get(id);
  prefetched.delete(id);
  return hit && Date.now() - hit.at < 8_000 ? hit.promise : null;
}

/**
 * The match page before its own answer arrives: the game as the lists already have it (teams,
 * score, clock, main market), so the page shows at once; the full page replaces it in a moment.
 */
function matchFromList(id) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return null;
  const main = e.selections[0]?.market || '1x2';
  return { ...e, partial: true, markets: e.selections.length ? [{ market: main, name: main === 'ml' ? 'Vencedor' : 'Resultado final', selections: e.selections }] : [] };
}

async function loadMatch(id, { quiet = false } = {}) {
  try {
    const { event } = await (takePrefetched(id) || api(`/api/events/${id}`));
    if (state.match.id !== id) return;
    const wasLive = state.match.data?.status === 'live';
    // Tennis: the live board (sets, point) from the stream stays when the polled event has none yet.
    if (event.sport === 'tenis' && !event.tennis && state.match.data?.id === event.id && state.match.data.tennis) event.tennis = state.match.data.tennis;
    state.match.data = event;
    noteScore(event);
    // The goal held on the pitch until betting opens again (the goal suspended it).
    const open = [...(event.selections || []), ...(event.markets || []).flatMap((x) => x.selections || [])].some((x) => x.active);
    if (state.match.clipHold && marketsReopened(state.match.clipHold, open)) state.match.clipHold.release();
    if (event.status !== 'scheduled') loadMatchExtras(id);
    if (event.sport === 'futebol' && !state.match.insights) loadMatchInsights(id);
    if (event.sport === 'futebol' && event.status === 'scheduled' && !state.match.picks) loadMatchPicks(id);
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

// Head-to-head, league table and last five games (GOAL API); asked once per match page.
/** "Melhores escolhas": the match's boosted ready-made builders (shown above its markets). */
async function loadMatchPicks(id) {
  state.match.picks = [];
  try {
    const { picks } = await api(`/api/events/${id}/picks`);
    if (state.match.id !== id) return;
    state.match.picks = picks;
    if (picks.length && currentRoute().page === 'jogo' && state.match.tab !== 'estatisticas') render({ keepScroll: true });
  } catch { /* the page works without them */ }
}

const ICON_ROCKET = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.8-.8.8-2.2 0-3s-2.2-.8-3 0z"/><path d="M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.5-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.5 4-2c1.1-1.6 0-5 0-5"/></svg>';

function pickCard(p, i) {
  return `<div class="pick-card${p.super ? ' super' : ''}">
    <div class="pick-top"><span class="pick-ribbon${p.super ? ' super' : ''}">${ICON_ROCKET}${p.pct}% ${p.super ? 'SUPER BOOST' : 'BOOST'}</span>
      ${p.popular ? `<span class="pick-hot">🔥 ${esc(p.popular)}</span>` : ''}</div>
    <ul class="pick-legs">${p.legs.map((l) => `<li><span>${esc(l.marketName)} - </span><b>${esc(l.label)}</b></li>`).join('')}</ul>
    <button class="pick-btn" data-pick="${i}"><s>${fmtOdds(p.odds)}</s><b>${fmtOdds(p.boosted)}</b></button>
  </div>`;
}
function picksSection() {
  const p = state.match.picks;
  return p?.length ? `<section class="picks-section"><h2 class="picks-title">MELHORES ESCOLHAS</h2>${carousel('picksCar', p.map(pickCard))}</section>` : '';
}
/** A card of "Melhores escolhas" into the slip, as a builder with its boost. */
function addPick(i) {
  const e = state.match.data;
  const p = state.match.picks?.[i];
  if (!e || !p) return;
  if (state.slip.length || state.builder) toast('Boletim', 'A melhor escolha substituiu as seleções anteriores.');
  state.slip = [];
  state.builder = { eventId: e.id, match: `${tname(e, 'home')} × ${tname(e, 'away')}`, competition: e.competition, startTime: e.startTime, legs: p.legs.map((l) => ({ ...l })), boost: { key: p.key, pct: p.pct } };
  saveSlip(); syncSelectedButtons(); renderSlip(); setSlipOpen(true);
}

async function loadMatchInsights(id) {
  state.match.insights = { loading: true };
  try {
    const insights = await api(`/api/events/${id}/insights`);
    if (state.match.id !== id) return;
    state.match.insights = insights;
    if (currentRoute().page === 'jogo' && state.match.tab === 'estatisticas') render({ keepScroll: true });
  } catch { if (state.match.id === id) state.match.insights = {}; }
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
    if (s.event) applyLiveEvent(s.event, { quiet: true });
    for (const d of s.livedata || []) pushBall(d);
    // Opened during a corner: its kick still plays the clip (older frames never do).
    m.cornerWatch = createCornerWatch();
    if (m.ball?.situation === 'corner') m.cornerWatch.frame(m.ball);
    m.prevBall = null;
    m.actions = (s.actions || []).slice(-15);
    updateTracker();
    updateActionsList();
  });
  on('event', (e) => applyLiveEvent(e));
  on('livedata', (d) => {
    const before = m.ball;
    pushBall(d);
    if (d.situation !== 'goal') m.kickoff = null;
    // The goal celebration holds until the game goes again.
    const hold = m.clipHold;
    if (hold) {
      if (d.situation === 'goal') hold.sawGoal = true;
      hold.var?.(d.situation === 'var');
      if (restartSeen(hold, d.situation, Date.now())) hold.release();
    }
    updateTracker();
    // A goal, or a corner being taken (the kick, not the award): the 3D clip over the pitch.
    m.cornerWatch ||= createCornerWatch();
    if (situationClip(before, d) === 'goal') { m.cornerWatch.reset(); celebrateGoal(d.side); return; }
    const corner = m.cornerWatch.frame(m.ball);
    if (corner) playClip(corner);
  });
  on('action', (a) => { m.actions.push(a); m.actions = m.actions.slice(-15); updateActionsList(); });
  on('odds', () => loadMatch(id, { quiet: true }));
  // No stream (match not covered by the live socket): the page keeps polling instead.
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) m.es = null; };
}

function applyLiveEvent(e, { quiet = false } = {}) {
  const d = state.match.data;
  if (!d) return;
  const scored = d.homeScore !== e.homeScore || d.awayScore !== e.awayScore;
  d.homeScore = e.homeScore;
  d.awayScore = e.awayScore;
  noteScore(d, { quiet });
  d.clock = e.clock || d.clock;
  if (e.server) d.server = e.server;
  state.match.live = e.stats || state.match.live;
  const score = $('#matchScore');
  if (score) score.textContent = `${d.homeScore ?? 0} - ${d.awayScore ?? 0}`;
  const clock = $('#matchClock span');
  if (clock) clock.textContent = d.sport === 'tenis' ? d.clock || '' : clockLabel(d);
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
    m.data = matchFromList(id);
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
    ? `<div class="match-score" id="matchScore">${e.homeScore ?? 0} - ${e.awayScore ?? 0}</div>${e.sport === 'tenis' ? `<div class="tn-sets" id="matchClock"><span>${esc(e.clock || '')}</span></div>` : `<div class="live-clock big" id="matchClock"><i class="pulse-dot"></i><span>${esc(clockLabel(e))}</span></div>`}
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
      <div class="match-comp">${e.leagueLogo ? `<span class="league-logo" data-sport-icon="${esc(e.sport)}"><img class="league-img" src="${esc(e.leagueLogo)}" alt=""></span>` : sportBadge(e.sport)} ${esc(e.competition)}</div>
      <div class="match-teams">
        <div class="match-team">${sideBadge(e, 'home', 'big')}<strong>${esc(tname(e, 'home'))}${redCard(e, 'home')}${e.sport === 'tenis' && live ? ' <i class="serve-dot" data-serve="home" title="Ao serviço"></i>' : ''}</strong></div>
        <div class="match-center">${center}</div>
        <div class="match-team">${sideBadge(e, 'away', 'big')}<strong>${esc(tname(e, 'away'))}${redCard(e, 'away')}${e.sport === 'tenis' && live ? ' <i class="serve-dot" data-serve="away" title="Ao serviço"></i>' : ''}</strong></div>
      </div>
      <div id="trackerInline" class="tracker-inline"></div>
    </section>
    <div class="match-views">
      ${live ? `<button class="${m.view === 'stream' ? 'active' : ''}${hasTv(e) ? '' : ' none'}" data-match-view="stream" title="${hasTv(e) ? 'Transmissão ao vivo' : 'Sem transmissão para este jogo'}">${ICON_PLAY}<span>Live</span></button>
      ${(e.sport === 'tenis' ? TENNIS_COURT : e.liveTracker) ? `<button class="${m.view !== 'stream' ? 'active' : ''}" data-match-view="tracker" title="Tracker">${ICON_PITCH}<span>Tracker</span></button>` : ''}` : ''}
      <button class="${m.tab === 'estatisticas' ? 'active' : ''}" data-match-tab="${m.tab === 'estatisticas' ? 'mercados' : 'estatisticas'}" title="${m.tab === 'estatisticas' ? 'Voltar aos mercados' : 'Estatísticas do jogo'}">${ICON_STATS}<span>Estatísticas</span></button>
    </div>
    ${m.tab === 'estatisticas' ? '<button class="stats-back" data-match-tab="mercados">‹ Voltar aos mercados</button>' : ''}
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

// Other sports have their own menu: tennis is won by sets and games (no goals, corners or cards),
// basketball by points and quarters, volleyball / table tennis by sets and points.
const SPORT_CATS = {
  tenis: {
    cats: [['todos', 'Todos'], ['principais', 'Principais'], ['sets', 'Sets'], ['jogos', 'Jogos'], ['resultados', 'Resultados exatos'], ['especiais', 'Especiais']],
    // Tennis 'ou' / 'hcp' are counted in sets, 'gou' / 'ghcp' and a set's own totals in games.
    byMarket: { ml: 'principais', '1x2': 'principais', ou: 'sets', hcp: 'sets', pw: 'sets', cs: 'resultados',
      gou: 'jogos', ghcp: 'jogos', oe: 'jogos', goe: 'jogos', tou: 'jogos', pou: 'jogos', phcp: 'jogos', poe: 'jogos' },
    // A set's winner or total is a set market; the match winner ("Vencedor do jogo") a main one.
    byName: [['resultados', /exact|correct score|resultado exato|set score/], ['sets', /\bsets?\b|tie.?break/],
      ['principais', /winner|vencedor|\bwin/], ['jogos', /\bgames?\b|jogos?\b|total|handicap|odd|even/]],
  },
  basquetebol: {
    cats: [['todos', 'Todos'], ['principais', 'Principais'], ['pontos', 'Pontos'], ['handicap', 'Handicap'], ['equipa', 'Equipa'], ['periodos', 'Quartos e partes'],
      ['marcadores', 'Jogadores'], ['especiais', 'Especiais']],
    byMarket: { ml: 'principais', '1x2': 'principais', dnb: 'principais', ou: 'pontos', oe: 'pontos', hcp: 'handicap', tou: 'equipa',
      pw: 'periodos', pou: 'periodos', phcp: 'periodos', poe: 'periodos' },
    byName: [['marcadores', /player|jogador|points? by|rebound|assist/], ['periodos', /quarter|half|period|parte|quarto/],
      ['equipa', /\bteam [12]\b|home team|away team|individual|equipa/], ['handicap', /handicap|spread/], ['pontos', /total|points?|pontos|odd|even/],
      ['principais', /winner|vencedor|money ?line|\bwin|1x2/]],
  },
};
for (const sp of ['voleibol', 'tenismesa', 'badminton']) {
  SPORT_CATS[sp] = {
    cats: [['todos', 'Todos'], ['principais', 'Principais'], ['sets', 'Sets'], ['pontos', 'Pontos'], ['handicap', 'Handicap'], ['resultados', 'Resultados exatos'], ['especiais', 'Especiais']],
    byMarket: { ml: 'principais', '1x2': 'principais', ou: 'pontos', oe: 'pontos', hcp: 'handicap', cs: 'resultados', pw: 'sets', pou: 'sets', phcp: 'sets', poe: 'sets' },
    byName: [['resultados', /exact|correct score|resultado exato|set score/], ['sets', /\bsets?\b/], ['handicap', /handicap/],
      ['pontos', /total|points?|pontos|odd|even/], ['principais', /winner|vencedor|\bwin/]],
  };
}
const catsOf = (sport) => SPORT_CATS[sport] || null;
// Football's menu also serves ice hockey, handball and futsal (goals, periods).
const marketCatsFor = (sport) => catsOf(sport)?.cats || MARKET_CATS;

function marketCat(mk, sport) {
  const own = catsOf(sport);
  if (own) {
    if (mk.market !== 'x') return own.byMarket[mk.market] || 'especiais';
    const name = String(mk.name || '').toLowerCase();
    return own.byName.find(([, re]) => re.test(name))?.[0] || 'especiais';
  }
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
  // The page as the list had it: its main market now, the others in a moment.
  if (e.partial) return `${e.markets.length ? marketBlocks(e, e.markets) : ''}<div class="panel empty loading-more">A carregar todos os mercados…</div>`;
  if (!e.markets?.length) {
    return `<div class="panel empty">${e.status === 'live' ? '<span class="odds-state suspended">Suspenso</span>' : 'Ainda não há mercados para este jogo.'}</div>`;
  }
  const m = state.match;
  const counts = new Map();
  for (const mk of e.markets) counts.set(marketCat(mk, e.sport), (counts.get(marketCat(mk, e.sport)) || 0) + 1);
  if (m.cat !== 'todos' && !counts.has(m.cat)) m.cat = 'todos';
  const chips = marketCatsFor(e.sport).filter(([k]) => k === 'todos' || counts.has(k))
    .map(([k, l]) => `<button class="${m.cat === k ? 'active' : ''}" data-market-cat="${k}">${l}<small>${k === 'todos' ? e.markets.length : counts.get(k)}</small></button>`).join('');
  const shown = m.cat === 'todos' ? e.markets : e.markets.filter((mk) => marketCat(mk, e.sport) === m.cat);
  return `${m.cat === 'todos' && e.status === 'scheduled' ? picksSection() : ''}<div class="market-cats">${chips}</div>${marketBlocks(e, shown)}`;
}

function marketBlocks(e, markets) {
  const locked = !isOpen(e);
  // Presentation-only translations: provider codes, selection IDs and odds remain untouched.
  const displayMarketName = (value) => {
    const raw = String(value || '');
    const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (key === 'total e ambas marcam') return 'Total de golos e ambas marcam';
    if (key.includes('total por tempos')) return 'Total de golos por partes';
    if (key.includes('total de golos por tempos')) return 'Total de golos por partes';
    if (key === '3 vias total') return 'Total de golos — 3 opções';
    if (key.includes('expected goals') && key.includes('handikap')) return raw.replace(/Expected Goals/i, 'Golos Esperados').replace(/Handikap/i, 'Handicap');
    if (key.includes('expected goals') && key.includes('totali')) return raw.replace(/Expected Goals/i, 'Golos Esperados').replace(/Totali/i, 'Total');
    // "Equipa 1", "Total Individual 1", "Total 2"… → the team's name.
    const team = (n) => String((n === '1' ? e.home : e.away) || `Equipa ${n}`);
    return raw.replace(/\b(?:Equipa|Team)\s([12])\b/g, (_, n) => team(n))
      .replace(/\b(Individual|Total)(\s+3 vias)?\s([12])\b(?!\s*[.,]\d)/g, (_, w, v, n) => `${w}${v || ''} · ${team(n)}`);
  };
  const displaySelectionLabel = (value) => {
    let label = String(value ?? '');
    const replacements = [
      [/goal number\s*-\s*scored by kicking/ig, 'Golo marcado com o pé'],
      [/goal number\s*-\s*me kokë/ig, 'Golo marcado de cabeça'],
      [/goal number\s*-\s*to be scored from a direct free kick/ig, 'Golo de livre direto'],
      [/goal number\s*-\s*penalty/ig, 'Penálti'],
      [/goal number\s*-\s*own goal/ig, 'Autogolo'],
      [/both to score\s*\+\s*to/ig, 'Ambas marcam + Mais de'],
      [/both to score\s*\+\s*tu/ig, 'Ambas marcam + Menos de'],
      [/both to score/ig, 'Ambas marcam'],
      [/first half/ig, 'primeira parte'],
      [/second half/ig, 'segunda parte'],
      [/up to and including/ig, 'Até inclusive'],
      [/up to part time/ig, 'Até ao intervalo'],
      [/or after/ig, 'ou depois'],
      [/or fewer/ig, 'ou menos'],
      [/points or more/ig, 'pontos ou mais'],
      [/two goals will not be scored/ig, 'Não serão marcados dois golos'],
      [/three goals will not be scored/ig, 'Não serão marcados três golos'],
      [/four goals will not be scored/ig, 'Não serão marcados quatro golos'],
      [/no goals/ig, 'Nenhum golo'],
      [/não goals/ig, 'Nenhum golo'],
      [/team 1/ig, String(e.home || 'Equipa 1')],
      [/team 2/ig, String(e.away || 'Equipa 2')],
      [/corner awarded for time wasting by the portieri/ig, 'Canto assinalado por perda de tempo do guarda-redes'],
      [/2\+ canceled match goals/ig, 'Dois ou mais golos anulados no jogo']
    ];
    for (const [pattern, text] of replacements) label = label.replace(pattern, text);
    return label;
  };
  const btn = (s, label = displaySelectionLabel(s.label)) => {
    const off = locked || !s.active;
    return `<button class="odd-btn market-odd${inSlip(s.id) ? ' selected' : ''}${off ? ' locked' : ''}" data-sel="${s.id}" ${off ? 'disabled' : ''}>
      <small>${esc(String(label).replace(/\s*\(([+-]?\d+(?:[.,]\d+)?)\)/g, ' $1'))}</small>${off ? '🔒' : fmtOdds(s.odds)}</button>`;
  };
  // "Mais de (2.5)", "Exatamente (3)", "Menos de (2)": the option and its line.
  const withLine = (label) => {
    const m = /^(.*?)\s*\(\s*([+-]?\d+(?:[.,]\d+)?)\s*\)\s*$/.exec(label);
    return m && m[1] ? { base: m[1].trim(), line: m[2].replace(',', '.') } : null;
  };
  const shortBase = (b) => ({ 'mais de': 'Mais', 'menos de': 'Menos', exatamente: 'Exato' })[b.toLowerCase()] || b;
  const blocks = markets.map((mk) => {
    let grid;
    // Period markets carry "<n>:" before the code (set / half); the grids work on the code after it.
    const bare = (s) => s.code.replace(/^\d:/, '');
    // WinHouse's unmapped markets (x) also carry line-based prices: corners/cards totals,
    // first/second-half totals, and other Over/Under markets. Group paired outcomes by line just
    // like our native OU markets, without changing the provider feed or settlement rules.
    const providerLine = (s) => {
      const raw = String(s.label || s.code?.split('~').at(-1) || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const match = /^\s*(mais de|menos de|over|under|above|below)\s*\(?\s*(\d+(?:[.,]\d+)?)\s*\)?\s*$/i.exec(raw);
      if (!match) return null;
      return { side: /^(mais|over|above)/i.test(match[1]) ? 'over' : 'under', line: Number(match[2].replace(',', '.')) };
    };
    const providerLines = mk.market === 'x' ? mk.selections.map((s) => ({ s, parsed: providerLine(s) })) : [];
    const lineGroups = new Map();
    for (const item of providerLines) {
      if (!item.parsed) continue;
      if (!lineGroups.has(item.parsed.line)) lineGroups.set(item.parsed.line, {});
      lineGroups.get(item.parsed.line)[item.parsed.side] = item.s;
    }
    const hasProviderLinePairs = providerLines.length > 1 && providerLines.every((item) => item.parsed)
      && [...lineGroups.values()].some((pair) => pair.over && pair.under);
    if (hasProviderLinePairs) {
      const title = String(mk.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const unit = /corner|canto/.test(title) ? 'cantos'
        : /card|booking|cartao/.test(title) ? 'cartoes'
        : /goal|golo|half|tempo|parte/.test(title) ? 'golos' : '';
      grid = [...lineGroups.entries()].sort((a, b) => a[0] - b[0]).map(([line, pair]) => {
        const label = unit ? `${line} ${unit}` : `Linha ${line}`;
        return `<div class="market-line"><span class="market-line-label">${esc(label)}</span>
          <div class="odds two">${pair.over ? btn(pair.over, 'Mais') : '<span></span>'}${pair.under ? btn(pair.under, 'Menos') : '<span></span>'}</div></div>`;
      }).join('');
    } else if (mk.market === '1x2' || mk.market === 'dc' || (mk.market === 'pw' && mk.selections.some((s) => bare(s) === 'X'))) {
      // Full-time result and double chance by their codes: 1 · X · 2 and 1X · 12 · X2 (in that order).
      const order = mk.market === 'dc' ? ['1X', '12', 'X2'] : ['1', 'X', '2'];
      const sels = order.map((c) => mk.selections.find((s) => bare(s) === c)).filter(Boolean);
      grid = `<div class="odds">${sels.map((s) => btn(s, bare(s))).join('')}</div>`;
    } else if (mk.market === 'tou') {
      // Team totals ("1O1.5" = home over 1.5, "2U2" = away under 2): one section per team, home
      // first, Mais on the left and Menos on the right, one row per line.
      const unit = { basquetebol: 'pontos', tenis: 'jogos' }[e.sport] || 'golos';
      grid = [['1', e.home], ['2', e.away]].map(([side, team]) => {
        const mine = mk.selections.filter((s) => bare(s)[0] === side);
        if (!mine.length) return '';
        const lines = [...new Set(mine.map((s) => bare(s).slice(2)))].sort((a, b) => a - b);
        const rows = lines.map((line) => {
          const over = mine.find((s) => bare(s) === `${side}O${line}`);
          const under = mine.find((s) => bare(s) === `${side}U${line}`);
          return `<div class="market-line"><span class="market-line-label">${esc(`${line} ${Number(line) === 1 ? unit.replace(/s$/, '') : unit}`)}</span>
            <div class="odds two price-only">${over ? btn(over, '') : '<span></span>'}${under ? btn(under, '') : '<span></span>'}</div></div>`;
        }).join('');
        return `<div class="market-team">${esc(team)}</div>
          <div class="market-line market-line-head"><span></span><div class="odds two"><span>Mais</span><span>Menos</span></div></div>${rows}`;
      }).join('');
    } else if (mk.market === 'ou' || mk.market === 'gou' || mk.market === 'pou') {
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
      // Keep the provider's exact selections/IDs and odds; only make the line and team names clearer.
      const rows = [...new Set(mk.selections.filter((s) => bare(s)[0] === '1').map((s) => bare(s).slice(1)))];
      const handicapLabel = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return value;
        return n === 0 ? '0.0' : `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
      };
      const oppositeLine = (line) => (/^[+-]?0(?:\.0+)?$/.test(line) ? '+0' : `${line[0] === '-' ? '+' : '-'}${line.replace(/^[+-]/, '')}`);
      const homeRows = rows.map((line) => {
        const one = mk.selections.find((s) => bare(s) === `1${line}`);
        const opposite = oppositeLine(line);
        const two = mk.selections.find((s) => bare(s) === `2${opposite}`);
        return `<div class="odds two handicap-odds">${one ? btn(one, handicapLabel(line)) : '<span></span>'}${two ? btn(two, handicapLabel(opposite)) : '<span></span>'}</div>`;
      }).join('');
      grid = `<div class="handicap-teams"><span>${esc(tname(e, 'home'))}</span><span>${esc(tname(e, 'away'))}</span></div>${homeRows}`;
    } else {
      // The same option twice (same name and price) shows once.
      const seen = new Set();
      const sels = mk.selections.filter((s) => { const k = `${displaySelectionLabel(s.label)}|${s.odds}`; if (seen.has(k)) return false; seen.add(k); return true; });
      const parsed = sels.map((s) => ({ s, p: withLine(displaySelectionLabel(s.label)) }));
      const bases = [...new Set(parsed.map((x) => x.p?.base))];
      const lines = [...new Set(parsed.map((x) => x.p?.line))];
      // "Freiburg: Mais de (1.5)" — over/under per team: one block per team (home first), Mais on
      // the left and Menos on the right, one row per line.
      const perTeam = sels.map((s) => {
        const m = /^(.+?):\s*(mais de|menos de|over|under)\s*\(?\s*([+-]?\d+(?:[.,]\d+)?)\s*\)?\s*$/i.exec(displaySelectionLabel(s.label));
        return m ? { s, team: m[1].trim(), over: /^(mais|over)/i.test(m[2]), line: m[3].replace(',', '.') } : null;
      });
      const teams = [...new Set(perTeam.map((x) => x?.team))].sort((a, b) => (b === e.home) - (a === e.home));
      const byTeam = sels.map((s) => {
        const m = /^(.+?):\s*(.+)$/.exec(displaySelectionLabel(s.label));
        return m && [e.home, e.away].includes(m[1].trim()) ? { s, team: m[1].trim(), rest: m[2].trim() } : null;
      });
      const titleKey = String(mk.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const unitOf = () => (/corner|canto/.test(titleKey) ? 'cantos' : /card|booking|cartao/.test(titleKey) ? 'cartões' : 'golos');
      const lineName = (line, unit) => `${line} ${Number(line) === 1 ? unit.replace(/s$/, '').replace(/õe$/, 'ão') : unit}`;
      if (mk.market === 'x' && perTeam.length > 1 && perTeam.every(Boolean) && teams.length <= 2) {
        const unit = unitOf();
        grid = teams.map((team) => {
          const mine = perTeam.filter((x) => x.team === team);
          const rows = [...new Set(mine.map((x) => x.line))].sort((a, b) => a - b).map((line) => {
            const over = mine.find((x) => x.line === line && x.over);
            const under = mine.find((x) => x.line === line && !x.over);
            return `<div class="market-line"><span class="market-line-label">${esc(lineName(line, unit))}</span>
              <div class="odds two price-only">${over ? btn(over.s, '') : '<span></span>'}${under ? btn(under.s, '') : '<span></span>'}</div></div>`;
          }).join('');
          return `<div class="market-team">${esc(team)}</div>
            <div class="market-line market-line-head"><span></span><div class="odds two"><span>Mais</span><span>Menos</span></div></div>${rows}`;
        }).join('');
      } else if (mk.market === 'x' && byTeam.length > 1 && byTeam.every(Boolean) && new Set(byTeam.map((x) => x.team)).size === 2) {
        // "Freiburg: Sim", "Jablonec: 2 - 3"… any per-team options: one block per team, home first.
        grid = [e.home, e.away].map((team) => {
          const mine = byTeam.filter((x) => x.team === team);
          const cls = mine.some((x) => x.rest.length > 12) ? ' list' : mine.length === 2 ? ' two' : '';
          return `<div class="market-team">${esc(team)}</div><div class="odds${cls}">${mine.map((x) => btn(x.s, x.rest)).join('')}</div>`;
        }).join('');
      } else if (mk.market === 'x' && parsed.length > 2 && parsed.every((x) => x.p) && lines.length > 1 && bases.length <= 3) {
        // Options on lines (Mais / Exato / Menos): one row per line, the line on the left.
        const title = String(mk.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const unit = /corner|canto/.test(title) ? 'cantos' : /card|booking|cartao/.test(title) ? 'cartões' : /goal|golo|total|tempo|parte/.test(title) ? 'golos' : '';
        // The options named once on top (Mais · Exato · Menos); each row only the prices.
        const cols = bases.length === 2 ? ' two' : '';
        const head = `<div class="market-line market-line-head"><span></span><div class="odds${cols}">${bases.map((b) => `<span>${esc(shortBase(b))}</span>`).join('')}</div></div>`;
        grid = head + lines.sort((a, b) => a - b).map((line) => {
          const cells = bases.map((b) => { const x = parsed.find((y) => y.p.line === line && y.p.base === b); return x ? btn(x.s, '') : '<span></span>'; }).join('');
          const name = unit ? `${line} ${Number(line) === 1 ? unit.replace(/s$/, '').replace(/õe$/, 'ão') : unit}` : `Linha ${line}`;
          return `<div class="market-line"><span class="market-line-label">${esc(name)}</span>
            <div class="odds${cols} price-only">${cells}</div></div>`;
        }).join('');
      } else if (sels.some((s) => displaySelectionLabel(s.label).length > 12)) {
        // Long names (combined markets, team names): one option per row, the name in full.
        grid = `<div class="odds list">${sels.map((s) => btn(s)).join('')}</div>`;
      } else {
        grid = `<div class="odds${sels.length === 2 ? ' two' : ''}">${sels.map((s) => btn(s)).join('')}</div>`;
      }
    }
    return { name: displayMarketName(mk.name), grid };
  }).filter(Boolean);
  // The same market once per team ("Total Individual 3 vias · Freiburg" and "… · Jablonec",
  // "Freiburg Marca N Golos" and "Jablonec Marca N Golos"): one block, a section per team, home first.
  const teamRe = (t) => new RegExp(`(^|\\s·\\s|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\s)`);
  const keyOf = (name) => {
    for (const [side, team] of [['home', e.home], ['away', e.away]]) {
      if (team && teamRe(team).test(name)) return { side, team, key: name.replace(teamRe(team), '$1{T}') };
    }
    return null;
  };
  const tagged = blocks.map((b) => ({ ...b, k: keyOf(b.name) }));
  const used = new Set();
  return tagged.map((b, i) => {
    if (used.has(i)) return '';
    const j = b.k ? tagged.findIndex((o, n) => n !== i && !used.has(n) && o.k && o.k.key === b.k.key && o.k.side !== b.k.side) : -1;
    if (j < 0) return `<div class="market-block"><div class="market-head">${esc(b.name)}</div>${b.grid}</div>`;
    used.add(j);
    const [home, away] = b.k.side === 'home' ? [b, tagged[j]] : [tagged[j], b];
    const title = b.k.key.replace(/\s·\s\{T\}/, '').replace(/^\{T\}\s/, 'Equipa ').replace('{T}', 'Equipa').replace(/\s+/g, ' ').trim();
    return `<div class="market-block"><div class="market-head">${esc(title)}</div>
      <div class="market-team">${esc(tname(e, 'home'))}</div>${home.grid}<div class="market-team">${esc(tname(e, 'away'))}</div>${away.grid}</div>`;
  }).join('');
}

// The statistics tab of a football match: the live statistics, then H2H (head-to-head and each
// team's last five games) and the league table. A menu entry only shows when it has data.
function matchStatsView(e) {
  const m = state.match;
  const ins = m.insights || {};
  const tabs = [];
  if (e.status !== 'scheduled') tabs.push(['aovivo', e.status === 'live' ? 'Ao vivo' : 'Jogo']);
  if (ins.h2h || ins.form?.home || ins.form?.away || ins.venue) tabs.push(['h2h', 'H2H']);
  if (ins.standings?.rows?.length) tabs.push(['classificacao', 'Classificação']);
  if (!tabs.length) {
    return ins.loading ? '<div class="loading">A carregar estatísticas…</div>' : '<div class="panel empty">As estatísticas aparecem quando o jogo começar.</div>';
  }
  if (!tabs.some(([k]) => k === m.statTab)) m.statTab = tabs[0][0];
  const menu = tabs.length > 1 ? `<div class="market-cats stat-tabs">${tabs.map(([k, l]) => `<button class="${m.statTab === k ? 'active' : ''}" data-stat-tab="${k}">${l}</button>`).join('')}</div>` : '';
  const body = m.statTab === 'h2h' ? h2hView(e, ins) : m.statTab === 'classificacao' ? standingsView(e, ins.standings) : liveStatsView(e);
  return menu + body;
}

const RESULT_LABEL = { W: 'V', D: 'E', L: 'D' };
const shortDate = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''; };

function h2hView(e, ins) {
  const h = ins.h2h;
  const pct = (n) => (h.total ? Math.round((n / h.total) * 100) : 0);
  const direct = h ? `<div class="panel"><h3>Confronto direto · ${h.total} jogo${h.total === 1 ? '' : 's'}</h3>
    <div class="h2h-sum"><div><b>${h.homeWins}</b><span>${esc(tname(e, 'home'))}</span></div><div><b>${h.draws}</b><span>Empates</span></div><div><b>${h.awayWins}</b><span>${esc(tname(e, 'away'))}</span></div></div>
    <div class="h2h-bar"><i class="h" data-w="${pct(h.homeWins)}"></i><i class="d" data-w="${pct(h.draws)}"></i><i class="a" data-w="${pct(h.awayWins)}"></i></div>
    <p class="muted h2h-goals">Golos: ${h.homeGoals} - ${h.awayGoals} · média ${h.avgGoals} por jogo</p>
    ${h.recent.map((r) => `<div class="h2h-game"><span class="muted">${esc(shortDate(r.date))}</span><span class="h2h-teams">${esc(r.home)} <b>${r.homeScore} - ${r.awayScore}</b> ${esc(r.away)}</span></div>`).join('')}
  </div>` : '';
  const form = (side) => {
    const f = ins.form?.[side];
    if (!f) return '';
    return `<div class="panel"><h3>${esc(tname(e, side))} · últimos ${f.games.length} jogos</h3>
      <div class="form-sum"><span class="fr W">${f.won} V</span><span class="fr D">${f.drawn} E</span><span class="fr L">${f.lost} D</span></div>
      ${f.games.map((g) => `<div class="h2h-game"><span class="fr ${g.result}">${RESULT_LABEL[g.result]}</span><span class="h2h-teams">${g.home ? 'vs' : 'em'} ${esc(g.opponent)} <b>${esc(g.score)}</b></span><span class="muted">${esc(shortDate(g.date))}</span></div>`).join('')}
    </div>`;
  };
  return `<div class="insight-stack">${direct}${venueView(e, ins.venue)}${form('home')}${form('away')}</div>`;
}

/** At home and away: the home side's record at home next to the away side's record away. */
function venueView(e, v) {
  if (!v) return '';
  const side = (s, name, where) => {
    if (!s) return `<div class="venue-col"><h4>${esc(name)} <small class="muted">${where}</small></h4><p class="muted">Sem dados.</p></div>`;
    const pct = (n) => (s.played ? Math.round((n / s.played) * 100) : 0);
    return `<div class="venue-col"><h4>${esc(name)} <small class="muted">${where}</small></h4>
      <div class="form-sum"><span class="fr W">${s.won} V</span><span class="fr D">${s.drawn} E</span><span class="fr L">${s.lost} D</span></div>
      <div class="h2h-bar"><i class="h" data-w="${pct(s.won)}"></i><i class="d" data-w="${pct(s.drawn)}"></i><i class="l" data-w="${pct(s.lost)}"></i></div>
      <p class="muted h2h-goals">${s.source === 'season' ? 'Época' : `Últimos ${s.played} jogos`}: ${pct(s.won)}% de vitórias${s.goalsFor !== null && s.goalsFor !== undefined ? ` · golos ${s.goalsFor}-${s.goalsAgainst}` : ''}</p>
      ${s.games.map((g) => `<div class="h2h-game"><span class="fr ${g.result}">${RESULT_LABEL[g.result]}</span><span class="h2h-teams">${g.home ? 'vs' : 'em'} ${esc(g.opponent)} <b>${esc(g.score)}</b></span><span class="muted">${esc(shortDate(g.date))}</span></div>`).join('')}
    </div>`;
  };
  return `<div class="panel"><h3>Em casa e fora</h3><div class="venue-grid">${side(v.home, tname(e, 'home'), 'em casa')}${side(v.away, tname(e, 'away'), 'fora')}</div></div>`;
}

function standingsView(e, t) {
  const key = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const side = (r) => r.side || (key(r.team) === key(e.home) ? 'home' : key(r.team) === key(e.away) ? 'away' : null);
  // Geral / Casa / Fora: the same table, with each team's games at home or away only (when the
  // league table splits them), ranked by those points.
  const split = t.rows.some((r) => r.home && r.away);
  const view = split && ['home', 'away'].includes(state.match.standView) ? state.match.standView : 'all';
  const rows = view === 'all' ? t.rows : t.rows.filter((r) => r[view]).map((r) => ({ ...r, ...r[view] }))
    .sort((x, y) => (y.points - x.points) || ((y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst)) || (y.goalsFor - x.goalsFor))
    .map((r, i) => ({ ...r, position: i + 1 }));
  const menu = split ? `<div class="market-cats stand-tabs">${[['all', 'Geral'], ['home', 'Casa'], ['away', 'Fora']]
    .map(([k, l]) => `<button class="${view === k ? 'active' : ''}" data-stand-view="${k}">${l}</button>`).join('')}</div>` : '';
  return `<div class="panel"><h3>${esc(t.name || 'Classificação')}</h3>${menu}<div class="table-wrap"><table class="standings">
    <thead><tr><th>#</th><th>Equipa</th><th class="num">J</th><th class="num"><span class="fr W">V</span></th><th class="num"><span class="fr D">E</span></th><th class="num"><span class="fr L">D</span></th><th class="num">G</th><th class="num">Pts</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="${side(r) ? 'ours' : ''}"><td>${r.position}</td><td class="st-team">${esc(r.team)}</td><td class="num">${r.played ?? ''}</td>
      <td class="num"><span class="fr W">${r.won ?? 0}</span></td><td class="num"><span class="fr D">${r.drawn ?? 0}</span></td><td class="num"><span class="fr L">${r.lost ?? 0}</span></td>
      <td class="num">${r.goalsFor ?? ''}-${r.goalsAgainst ?? ''}</td><td class="num"><b>${r.points ?? ''}</b></td></tr>`).join('')}</tbody>
  </table></div></div>`;
}

function liveStatsView(e) {
  const x = state.match.extras;
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
    <span class="inc-icon">${INCIDENT_ICON[i.type] || '•'}</span><span>${esc(i.player || '')}${i.side ? ` <small class="muted">(${esc(tname(e, i.side))})</small>` : ''}</span></div>`).join('');
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
    <thead><tr>${t.columns.map(([, l], i) => `<th${i ? ' class="num"' : ''}>${esc(l === 'Casa' ? tname(e, 'home') : l === 'Fora' ? tname(e, 'away') : l)}</th>`).join('')}</tr></thead>
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
  break_points_won_pct: 'Break points convertidos (%)', breaks: 'Breaks', service_points_won: 'Pontos ganhos no serviço',
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
  return `<div class="trk" data-kind="football">
    <div class="trk-head"><span class="trk-team"><i class="trk-dot home"></i>${esc(tname(e, 'home'))}</span>
      <span class="trk-score"><b id="trkHomeScore">${e.homeScore ?? 0}</b><span>-</span><b id="trkAwayScore">${e.awayScore ?? 0}</b><small id="trkClock">${esc(e.clock || '')}</small></span>
      <span class="trk-team away">${esc(tname(e, 'away'))}<i class="trk-dot away"></i></span></div>
    <div class="trk-turf"><div class="trk-pitch" id="trkPitch">
      <div class="trk-mark" aria-hidden="true">BET<span>62</span></div>
      <div class="trk-arrow" id="trkArrow"></div>
      <i class="trk-half"></i><i class="trk-circle"></i><i class="trk-spot"></i>
      <i class="trk-box l"></i><i class="trk-box r"></i><i class="trk-six l"></i><i class="trk-six r"></i>
      <i class="trk-pen l"></i><i class="trk-pen r"></i><i class="trk-arc l"></i><i class="trk-arc r"></i>
      ${flags}
      <div class="trk-goal l"><i></i></div><div class="trk-goal r"><i></i></div>
      <div class="trk-trails" id="trkTrails"></div>
      <div class="trk-3d" id="trk3dHost"></div>
      <div class="trk-ball" id="trkBall">${BALL_SVG}</div>
      <div class="trk-badge" id="trkBadge"><i class="trk-badge-bar"></i><div><b id="trkBadgeTeam"></b><small id="trkBadgeText"></small></div></div>
      <p class="trk-3d-off">Campo 3D indisponível neste aparelho.</p>
      <div class="trk-clip" id="trkClip" aria-hidden="true"><video id="trkClipVideo" muted playsinline preload="none" disablepictureinpicture></video>
        <div class="trk-clip-goal"><b id="trkClipLabel">GOLO!</b><span>BET62</span></div></div>
    </div></div>
    <p class="trk-note" id="trkNote"></p>
  </div>`;
}

function tennisWidget(e) {
  return `<div class="trk" data-kind="tennis">${expandBtn()}
    <div class="trk-head"><span class="trk-team">${sideBadge(e, 'home', 'mini')}${esc(tname(e, 'home'))}</span>
      <span class="trk-score"><b id="trkSetLabel">S1</b><small id="trkPoint">—</small></span>
      <span class="trk-team away">${esc(tname(e, 'away'))}${sideBadge(e, 'away', 'mini')}</span></div>
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
  const kind = e?.status !== 'live' || (e.sport === 'tenis' && !TENNIS_COURT) ? null
    : e.liveTracker ? 'football' : e.sport === 'tenis' ? 'tennis' : null;
  if (!kind) {
    drop3D();
    m.widget?.remove();
    m.widget = null;
    if (m.streamEl?.parentElement) m.streamEl.remove();
    return;
  }
  if (!m.widget || m.widgetKind !== kind) {
    drop3D();
    m.widget?.remove();
    const holder = document.createElement('div');
    holder.innerHTML = kind === 'football' ? footballWidget(e) : tennisWidget(e);
    m.widget = holder.firstElementChild;
    m.widgetKind = kind;
    if (kind === 'football') warmClips();
  }
  if (slot && m.widget.parentElement !== slot) slot.replaceChildren(m.widget);
  if (kind === 'football') { updateTracker({ instant: true }); updateActionsList(); ensure3D(); } else updateTennisCourt();
}

// ---------- the football pitch in 3D (public/trk3d.js, loaded when first needed) ----------
// The football tracker is 3D only (the 2D drawing is hidden and not driven); a device that cannot
// draw it gets a short note in its place, the statistics and actions below stay.
let pitch3dModule = null;
let pitch3dFailed = false;

function ensure3D() {
  const m = state.match;
  const w = m.widget;
  if (!w || m.widgetKind !== 'football') return;
  w.classList.toggle('no3d', pitch3dFailed);
  if (m.pitch3d || m.pitch3dLoading || pitch3dFailed) return;
  m.pitch3dLoading = true;
  (pitch3dModule ||= import('./trk3d.js')).then(({ createPitch3D }) => {
    m.pitch3dLoading = false;
    if (m.widget !== w || m.pitch3d) return;
    const badge = $('#trkBadge', w);
    const quality = qualityTier({
      coarse: !!window.matchMedia?.('(pointer: coarse)').matches, width: window.innerWidth,
      cores: navigator.hardwareConcurrency || 4, saveData: !!navigator.connection?.saveData, memory: navigator.deviceMemory || 4,
    });
    const pitch = createPitch3D($('#trk3dHost', w), {
      quality,
      // The label follows the ball as the camera sees it.
      onFrame: ({ x, y }) => {
        badge.style.left = `${Math.min(80, Math.max(20, x))}%`;
        badge.style.top = `${Math.min(96, Math.max(26, y))}%`;
      },
    });
    if (!pitch) { pitch3dFailed = true; w.classList.add('no3d'); return; }
    m.pitch3d = pitch;
    updateTracker({ instant: true });
  }).catch(() => { m.pitch3dLoading = false; pitch3dFailed = true; pitch3dModule = null; w.classList.add('no3d'); });
}

function drop3D() {
  const m = state.match;
  m.pitch3d?.destroy();
  m.pitch3d = null;
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
  const p3 = m.pitch3d;
  if (!b || b.x === undefined || b.x === null) {
    ball.classList.add('idle');
    arrow.style.clipPath = 'polygon(0 0, 0 0, 0 0)';
    badge.classList.remove('on');
    p3?.setBall({ hidden: true });
    return;
  }
  // After a goal's clip: the ball back on the centre spot for the kick-off (no "GOLO!" left on the
  // pitch while the tracker has nothing newer to say).
  if (b.situation === 'goal' && m.kickoff) {
    ball.classList.remove('idle');
    ball.classList.add('instant', 'resting');
    ball.style.left = '50%';
    ball.style.top = '50%';
    arrow.style.clipPath = 'polygon(0 0, 0 0, 0 0)';
    const ko = m.kickoff.side;
    badge.classList.toggle('on', !!ko);
    badge.classList.toggle('away', ko === 'away');
    badge.classList.remove('hot');
    $('#trkBadgeTeam', w).textContent = ko === 'away' ? tname(e, 'away') : ko === 'home' ? tname(e, 'home') : '';
    $('#trkBadgeText', w).textContent = 'Pontapé de saída';
    badge.style.left = '50%';
    badge.style.top = '30%';
    p3?.setBall({ x: 50, y: 50, side: ko || 'home', resting: true, instant: true });
    m.prevBall = null;
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
    p3?.setBall({ x: 50, y: 50, resting: true, instant: true });
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
  const tier = zoneTier(b.situation, depth);
  const near = side === 'home' ? 0 : 100;
  const dir = b.x >= near ? 1 : -1;
  const body = dir === 1 ? Math.max(near, b.x - 6) : Math.min(near, b.x + 6);
  arrow.style.clipPath = `polygon(${near}% 0%, ${body}% 0%, ${b.x}% 50%, ${body}% 100%, ${near}% 100%)`;
  arrow.className = `trk-arrow ${side} ${tier}`;
  p3?.setBall({ x: b.x, y: b.y, side, tier, situation: b.situation, instant });

  // Situation badge floating near the ball.
  badge.classList.add('on');
  badge.classList.toggle('away', side === 'away');
  badge.classList.toggle('hot', danger);
  $('#trkBadgeTeam', w).textContent = tname(e, side === 'away' ? 'away' : 'home');
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

// ---------- 3D clips over the mini-pitch (goal celebration, corner) ----------
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The clips are fetched once, in the background, when a live mini-pitch first opens (not on data saver). */
let clipsWarm = false;
let clipExt;
const clipExtension = () => {
  if (clipExt === undefined) {
    const probe = document.createElement('video');
    clipExt = typeof probe.canPlayType === 'function' ? clipFormat((t) => probe.canPlayType(t)) : null;
  }
  return clipExt;
};
function warmClips() {
  if (clipsWarm || navigator.connection?.saveData || !clipExtension()) return;
  clipsWarm = true;
  for (const { src } of Object.values(CLIPS)) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = `${src}.${clipExtension()}`;
    document.head.append(link);
  }
}

/**
 * Score seen on the match page: a goal starts the celebration. The highest score seen per side is
 * kept, so the polled score and the live one disagreeing for a moment never celebrate a goal twice.
 */
function noteScore(d, { quiet = false } = {}) {
  const m = state.match;
  const now = { home: Number(d.homeScore) || 0, away: Number(d.awayScore) || 0 };
  const who = quiet || d.status !== 'live' || !d.liveTracker ? null : scorer(m.score, now);
  m.score = m.score ? { home: Math.max(m.score.home, now.home), away: Math.max(m.score.away, now.away) } : now;
  if (who) celebrateGoal(who);
}

/**
 * The goal clip, held on its celebration until the tracker shows the game going again; then the 2D
 * pitch shows play as it is (or, when the hold ran out with the tracker still on "goal", the ball on
 * the centre spot for the kick-off of the side that conceded).
 */
function celebrateGoal(side) {
  const m = state.match;
  const kickoff = side === 'home' ? 'away' : side === 'away' ? 'home' : null;
  playClip('goal', {
    hold: true,
    onEnd: () => { if (m.ball?.situation === 'goal') { m.kickoff = { side: kickoff }; updateTracker({ instant: true }); } },
  });
}

/**
 * Plays one clip over the pitch and goes back to the 2D view when it ends. Skipped (straight to
 * `onEnd`) when nobody would see it: tab hidden, video view open, reduced motion, no codec. A clip that
 * does not start within 3 s (slow network, autoplay refused) is dropped; a tap closes it. With `hold`
 * (the goal), the clip stops on the ball resting in the net with a "GOLO!" moving over it — no replay —
 * until `m.clipHold.release()` (markets open again, the game going again) or GOAL_HOLD.maxMs; a VAR
 * review keeps it and says so.
 */
function playClip(kind, { onEnd, hold = false } = {}) {
  const m = state.match;
  const clip = CLIPS[kind];
  m.clipGate ||= createClipGate();
  if (!clip || !m.clipGate.want(kind)) return;
  const w = m.widget;
  const box = w && $('#trkClip', w);
  const video = w && $('#trkClipVideo', w);
  if (!video || m.widgetKind !== 'football' || !w.isConnected || document.hidden || reducedMotion() || !clipExtension()) {
    m.clipGate.start(kind, 0);
    onEnd?.();
    return;
  }
  m.clipGate.start(kind, hold ? GOAL_HOLD.maxMs : clip.ms + 4500);
  clearTimeout(m.clipTimer);
  const token = {};
  m.clipToken = token;
  const label = $('#trkClipLabel', w);
  box.classList.remove('held', 'var');
  // Held: frozen once the ball is in the net; released early the clip just plays to its end.
  m.clipHold = hold ? {
    since: Date.now(), sawGoal: false, restarted: false, frozen: false,
    release: () => { if (m.clipHold?.frozen) finish(); else if (m.clipHold) m.clipHold.restarted = true; },
    var: (on) => { box.classList.toggle('var', on); if (label) label.textContent = on ? 'REVISÃO VAR' : 'GOLO!'; },
  } : null;
  const finish = () => {
    if (m.clipToken !== token) return;
    m.clipToken = null;
    m.clipHold = null;
    clearTimeout(m.clipTimer);
    m.clipGate?.stop();
    box.classList.remove('on', 'held', 'var');
    video.ontimeupdate = null;
    video.pause();
    onEnd?.();
  };
  video.ontimeupdate = () => {
    const h = m.clipHold;
    if (m.clipToken !== token || !h || h.frozen || h.restarted || video.currentTime < GOAL_HOLD.freezeAt - 0.25) return;
    // The ball at rest in the net, before the clip's own text: the picture stops, our "GOLO!" moves.
    h.frozen = true;
    video.pause();
    video.currentTime = GOAL_HOLD.freezeAt;
    if (label) label.textContent = 'GOLO!';
    box.classList.add('held');
  };
  video.onended = () => { if (m.clipToken === token && !m.clipHold?.frozen) finish(); };
  video.onerror = finish;
  // (the box may still be showing a clip this one cut short: started is per clip)
  let started = false;
  video.onplaying = () => {
    if (m.clipToken !== token || started) return;
    started = true;
    box.classList.add('on');
    clearTimeout(m.clipTimer);
    m.clipTimer = setTimeout(finish, hold ? GOAL_HOLD.maxMs : clip.ms + 1500);
  };
  box.onclick = finish;
  m.clipTimer = setTimeout(finish, 3000);
  video.muted = true;
  const src = `${clip.src}.${clipExtension()}`;
  if (video.getAttribute('src') !== src) video.src = src;
  else video.currentTime = 0;
  video.play()?.catch?.(finish);
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

/** Light theme from 07:00 to 21:00 (the visitor's clock), dark otherwise; no switch to press. */
function applyTheme() {
  const h = new Date().getHours();
  const light = h >= 7 && h < 21;
  document.documentElement.classList.toggle('light', light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#ffffff' : '#1e2329');
}

async function init() {
  applyTheme();
  setInterval(applyTheme, 60_000);
  const referred = captureReferral();
  bindChrome();
  autoMode();
  renderSlip();
  // The board is asked for at once, alongside the settings and the account (not after them).
  const boardReq = api('/api/events');
  boardReq.catch(() => {});
  const [config] = await Promise.all([api('/api/config').catch(() => null), refreshMe()]);
  state.config = config;
  // A new deploy changes the version: reload once so nobody keeps an old page open for hours.
  setInterval(async () => {
    try {
      const c = await api('/api/config');
      if (state.config?.version && c.version && c.version !== state.config.version && !state.casinoSession) window.location.reload();
    } catch { /* offline for a moment */ }
  }, 5 * 60_000);
  // Maintenance switched on or off in the admin: the screen comes and goes within a minute.
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const c = await api('/api/config');
      if (JSON.stringify(c.maintenance || null) !== JSON.stringify(state.config?.maintenance || null)) {
        state.config = { ...state.config, maintenance: c.maintenance || null };
        showMaintenance(currentRoute().page);
      }
      // The live provider went down or came back: the live page says so.
      if (!!c.liveDown !== !!state.config?.liveDown) {
        state.config = { ...state.config, liveDown: !!c.liveDown };
        if (currentRoute().page === 'ao-vivo') render({ keepScroll: true });
      }
    } catch { /* offline for a moment */ }
  }, 60_000);
  if (config) $('#stake').min = config.minStake;
  // A game left open when the tab was closed: bring that balance back now.
  if (state.user?.casinoActive && !(currentRoute().page === 'casino' && currentRoute().sub === 'jogar')) closeCasino();
  render();
  if (referred && !state.user) openAuth('register');
  setTimeout(askPromos, 4000);
  // The casino's lists wait for the board, unless the casino is the page opened.
  const casinoFirst = currentRoute().page === 'casino';
  if (casinoFirst) { loadCasino({ reset: true }); loadCasinoLobby(); }
  await refreshEvents({ prefetched: boardReq });
  document.dispatchEvent(new Event('bet62:ready'));
  if (!casinoFirst) { loadCasino({ reset: true }); loadCasinoLobby(); }
  loadLeagues();
  setInterval(() => { if (!document.hidden && !playingCasino()) loadLeagues(); }, 60_000);
  // My bets: scores, clocks and cash-out values kept fresh while the tickets are on screen.
  setInterval(() => {
    const { page, sub } = currentRoute();
    if (!document.hidden && state.user && (page === 'apostas' || (page === 'perfil' && sub === 'apostas'))) loadBets({ quiet: true });
  }, 10_000);
  // Live events refresh every 10s; the rest of the board rides along.
  setInterval(() => { if (!document.hidden && !playingCasino()) refreshEvents(); }, 5_000);
  // Keep the balance fresh (settlements and admin credits happen server-side).
  setInterval(() => { if (!document.hidden && state.user && !playingCasino()) refreshMe(); }, 20_000);
  // Back to the page: refresh everything right away (hidden tab, reopened app, back/forward cache).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) resume(); });
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
}

init();
