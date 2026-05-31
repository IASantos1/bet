// LiveMomentumGraph — progressive wave chart driven by match minute
//   • Lines start at 0' and GROW in real-time as the game progresses
//   • At halftime (HT) the line tip freezes and an "INT" badge pulses above
//   • Resumes drawing when 2H starts, until 90+ injury
//   • At full-time (FT) shows a static "FIM DE JOGO" badge
//   • Goal / yellow-card / red-card markers appear above the wave at their minute
import { memo, useMemo } from 'react';

interface MomentumPoint {
  minute: number;
  home: number;
  away: number;
}

interface MarkedEvent {
  minute: number;
  side: 'home' | 'away' | 'unknown';
  kind: 'goal' | 'yellow' | 'red';
}

interface LiveMomentumGraphProps {
  darkMode: boolean;
  stats?: any;
  matchEvents?: any[];
  homeName?: string;
  awayName?: string;
  currentMinute?: number;
  /** Status code: '1H' | 'HT' | '2H' | 'ET' | 'P' | 'FT' | 'AET' | 'PEN' | etc. */
  statusKey?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function extractMinute(ev: any): number | null {
  const sources = [ev?.minute, ev?.timer, ev?.time?.elapsed, ev?.elapsed];
  for (const s of sources) {
    const n = parseInt(String(s ?? '').replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > 0 && n <= 130) return n;
  }
  const text = `${ev?.text || ''} ${ev?.event || ''} ${ev?.detail || ''}`;
  const m = /(\d+)'/.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

function classifyEvent(ev: any): MarkedEvent['kind'] | null {
  const text = `${ev?.type || ''} ${ev?.detail || ''} ${ev?.text || ''} ${ev?.event || ''}`.toLowerCase();
  if (/red.?card|cartão.?verm/.test(text))   return 'red';
  if (/yellow.?card|cartão.?ama/.test(text)) return 'yellow';
  if (/\b(goal|gol)\b/.test(text) && !/disallow|cancel|anulad|missed|own/.test(text)) return 'goal';
  return null;
}

function classifyTeam(ev: any, homeName?: string): MarkedEvent['side'] {
  const teamName = String(ev?.team?.name || ev?.team || '').toLowerCase();
  const homeNorm = String(homeName || '').toLowerCase().slice(0, 6);
  if (!teamName) return 'unknown';
  if (homeNorm && teamName.includes(homeNorm)) return 'home';
  return 'away';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Smooth Catmull-Rom-ish bezier path
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function deriveRatios(stats: any): { homeRatio: number; awayRatio: number } {
  let homeRatio = 0.5;
  let awayRatio = 0.5;
  const arr = Array.isArray(stats) ? stats : null;
  if (arr) {
    const teamStats = (side: 'home' | 'away', regex: RegExp) => {
      const t = arr.find((s: any) => String(s?.team?.id || '').toLowerCase().includes(side));
      if (!t?.statistics) return 0;
      const it = t.statistics.find((x: any) => regex.test(String(x?.type || '')));
      if (!it) return 0;
      const v = String(it.value ?? '').replace('%', '');
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const possH = teamStats('home', /possession/i) || 50;
    const dangH = teamStats('home', /dangerous.*attack/i);
    const dangA = teamStats('away', /dangerous.*attack/i);
    const totDang = dangH + dangA;
    const dangBiasH = totDang > 0 ? dangH / totDang : 0.5;
    homeRatio = (possH / 100) * 0.6 + dangBiasH * 0.4;
    awayRatio = 1 - homeRatio;
  } else if (stats && typeof stats === 'object') {
    const homeShots = Number(stats?.shots?.home || stats?.onTarget?.home || 0);
    const awayShots = Number(stats?.shots?.away || stats?.onTarget?.away || 0);
    const homeAttacks = Number(stats?.attacks?.home || homeShots * 3);
    const awayAttacks = Number(stats?.attacks?.away || awayShots * 3);
    const totalAttacks = homeAttacks + awayAttacks || 1;
    homeRatio = homeAttacks / totalAttacks;
    awayRatio = awayAttacks / totalAttacks;
  }
  return { homeRatio, awayRatio };
}

// Build progressive momentum data — line only extends up to `endMin`
function buildMomentumData(stats: any, endMin: number, axisMax: number): MomentumPoint[] {
  if (endMin <= 0) return [];
  const { homeRatio, awayRatio } = deriveRatios(stats);
  const points: MomentumPoint[] = [];
  // Generate points every 3 minutes for smooth waves
  const step = 3;
  const deterministicFlow = (m: number) => {
    const t = m / Math.max(axisMax, 90);
    return 0.18 * Math.sin(t * Math.PI * 2.7 + 0.4) + 0.10 * Math.sin(t * Math.PI * 5.1 + 1.2);
  };
  const pushAt = (m: number) => {
    const flow = deterministicFlow(m);
    points.push({
      minute: m,
      home: clamp(homeRatio + flow, 0.08, 0.92),
      away: clamp(awayRatio - flow, 0.08, 0.92),
    });
  };
  for (let m = 0; m <= endMin; m += step) pushAt(m);
  if (points[points.length - 1]?.minute !== endMin) pushAt(endMin);
  return points;
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────
function LiveMomentumGraph({
  darkMode, stats, matchEvents, homeName, awayName, currentMinute, statusKey,
}: LiveMomentumGraphProps) {
  const status = String(statusKey || '').toUpperCase().trim();
  const minute = Math.max(0, Number(currentMinute) || 0);

  const isHT = status === 'HT' || status === 'INT' || /half.?time|intervalo/i.test(status);
  const isFT = ['FT', 'AET', 'PEN', 'FINISHED', 'ENDED', 'AFTER'].some(k => status.includes(k));
  const is1H = status === '1H' || status === '1' || (!isHT && !isFT && minute > 0 && minute <= 45);
  const is2H = status === '2H' || status === '2' || status === 'ET' || status === 'P';

  // Axis always shows 0 → 95' (90 + 5 injury room) — extends if game runs longer
  const AXIS_MAX = Math.max(95, minute + 2, isFT ? 90 : 0);

  // Where the line "tip" lives:
  //   1H : current minute (capped to 45 + 5 injury)
  //   HT : freeze at 45 (or last reported minute if > 45)
  //   2H : current minute
  //   FT : 90 (or current minute if extra time was played)
  let endMin: number;
  if (isFT)       endMin = Math.max(minute, 90);
  else if (isHT)  endMin = Math.max(minute, 45);
  else if (is1H)  endMin = Math.min(minute, 50);
  else if (is2H)  endMin = Math.min(Math.max(minute, 45), 100);
  else            endMin = Math.min(minute, AXIS_MAX);

  const data = useMemo(
    () => buildMomentumData(stats, endMin, AXIS_MAX),
    [stats, endMin, AXIS_MAX]
  );

  // Extract goal/card events with minute (only show those that already happened)
  const markedEvents = useMemo<MarkedEvent[]>(() => {
    if (!Array.isArray(matchEvents)) return [];
    const out: MarkedEvent[] = [];
    for (const ev of matchEvents) {
      const kind = classifyEvent(ev);
      if (!kind) continue;
      const min = extractMinute(ev);
      if (min == null) continue;
      if (min > endMin + 1) continue; // hide future markers
      out.push({ minute: min, kind, side: classifyTeam(ev, homeName) });
    }
    return out;
  }, [matchEvents, homeName, endMin]);

  // SVG geometry
  const W = 320;
  const H = 110;
  const PAD_TOP = 26;
  const PAD = 6;
  const plotW = W - PAD * 2;
  const plotH = H - PAD - PAD_TOP;
  const minToX = (m: number) => PAD + (clamp(m, 0, AXIS_MAX) / AXIS_MAX) * plotW;
  const valToY = (v: number) => PAD_TOP + plotH * (1 - v);

  const homePoints = data.map(p => ({ x: minToX(p.minute), y: valToY(p.home) }));
  const awayPoints = data.map(p => ({ x: minToX(p.minute), y: valToY(p.away) }));
  const homePath = smoothPath(homePoints);
  const awayPath = smoothPath(awayPoints);

  // Tip positions (dot at the end of each line)
  const tipX = data.length ? minToX(endMin) : PAD;
  const homeTipY = data.length ? valToY(data[data.length - 1].home) : valToY(0.5);
  const awayTipY = data.length ? valToY(data[data.length - 1].away) : valToY(0.5);

  // Halftime separator at minute 45
  const htX = minToX(45);

  return (
    <div className={`rounded-xl overflow-hidden ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className={`text-xs font-bold truncate max-w-[35%] ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{homeName || 'Casa'}</span>
        <div className="flex items-center gap-2">
          {isFT ? (
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 bg-gray-700/80 px-2 py-0.5 rounded">FIM</span>
          ) : isHT ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400 animate-pulse">INTERVALO</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className={`text-[10px] font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Momentum</span>
            </>
          )}
        </div>
        <span className={`text-xs font-bold truncate max-w-[35%] text-right ${darkMode ? 'text-red-400' : 'text-red-600'}`}>{awayName || 'Fora'}</span>
      </div>

      <div className="px-3 pb-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 110 }}>
          <defs>
            <linearGradient id="homeGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="awayGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Horizontal grid */}
          {[0.25, 0.5, 0.75].map(v => (
            <line key={v} x1={PAD} y1={valToY(v)} x2={W - PAD} y2={valToY(v)}
              stroke={darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" />
          ))}
          <line x1={PAD} y1={valToY(0.5)} x2={W - PAD} y2={valToY(0.5)}
            stroke={darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'}
            strokeWidth="1" strokeDasharray="3 3" />

          {/* Halftime separator at 45' */}
          <line x1={htX} y1={PAD_TOP} x2={htX} y2={H - PAD}
            stroke={darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'}
            strokeWidth="1" strokeDasharray="2 3" />
          <text x={htX} y={PAD_TOP - 16} textAnchor="middle" fontSize="7" fontWeight="bold"
            fill={darkMode ? '#9ca3af' : '#6b7280'}>HT</text>

          {/* Wave (only if we have at least 2 points) */}
          {data.length >= 2 && (
            <>
              {/* Closed area paths */}
              <path d={`${homePath} L${tipX.toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`} fill="url(#homeGrad2)" />
              <path d={`${awayPath} L${tipX.toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`} fill="url(#awayGrad2)" />
              {/* Lines */}
              <path d={homePath} fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d={awayPath} fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

              {/* Tip dots — pulse during live, frozen during HT, static at FT */}
              <circle cx={tipX} cy={homeTipY} r="3.2" fill="#3b82f6" stroke="#fff" strokeWidth="1.2">
                {!isHT && !isFT && (
                  <animate attributeName="r" values="2.6;4.2;2.6" dur="1.6s" repeatCount="indefinite" />
                )}
              </circle>
              <circle cx={tipX} cy={awayTipY} r="3.2" fill="#ef4444" stroke="#fff" strokeWidth="1.2">
                {!isHT && !isFT && (
                  <animate attributeName="r" values="2.6;4.2;2.6" dur="1.6s" repeatCount="indefinite" />
                )}
              </circle>

              {/* Vertical "now" cursor */}
              {!isFT && (
                <line x1={tipX} y1={PAD_TOP} x2={tipX} y2={H - PAD}
                  stroke={isHT ? '#fbbf24' : '#fff'}
                  strokeOpacity={isHT ? 0.7 : 0.45}
                  strokeWidth="1.5" strokeDasharray="2 2" />
              )}
            </>
          )}

          {/* Event markers ABOVE the chart with vertical drop line */}
          {markedEvents.map((ev, i) => {
            const x = minToX(ev.minute);
            const color = ev.kind === 'goal' ? '#10b981' : ev.kind === 'red' ? '#ef4444' : '#fbbf24';
            return (
              <g key={`mk${i}`}>
                <line x1={x} y1={PAD_TOP} x2={x} y2={H - PAD} stroke={color} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 2" />
                <circle cx={x} cy={14} r="6" fill={color} stroke="#fff" strokeWidth="1.2" />
                <text x={x} y={17} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#fff">
                  {ev.kind === 'goal' ? '⚽' : ev.kind === 'red' ? 'V' : 'A'}
                </text>
                <text x={x} y={26} textAnchor="middle" fontSize="7" fontWeight="bold"
                  fill={darkMode ? '#e5e7eb' : '#111'}>
                  {ev.minute}'
                </text>
              </g>
            );
          })}

          {/* Big "INT" pulse badge at the line tip during halftime */}
          {isHT && data.length >= 2 && (
            <g>
              <rect x={tipX - 16} y={PAD_TOP - 23} width="32" height="14" rx="3" fill="#fbbf24">
                <animate attributeName="opacity" values="1;0.45;1" dur="1.0s" repeatCount="indefinite" />
              </rect>
              <text x={tipX} y={PAD_TOP - 13} textAnchor="middle" fontSize="9" fontWeight="900" fill="#000">INT</text>
            </g>
          )}

          {/* "FIM DE JOGO" badge at FT */}
          {isFT && (
            <g>
              <rect x={W / 2 - 38} y={PAD_TOP - 22} width="76" height="14" rx="3" fill="#374151" stroke="#9ca3af" strokeWidth="0.5" />
              <text x={W / 2} y={PAD_TOP - 12} textAnchor="middle" fontSize="8" fontWeight="900" fill="#f3f4f6" letterSpacing="1">
                FIM DE JOGO
              </text>
            </g>
          )}
        </svg>

        {/* Minute axis */}
        <div className="flex justify-between mt-0.5 px-1">
          <span className={`text-[9px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>0'</span>
          <span className={`text-[9px] font-bold ${isHT ? 'text-yellow-500' : (darkMode ? 'text-gray-500' : 'text-gray-400')}`}>
            45{isHT && minute > 45 ? `+${minute - 45}` : ''}'
          </span>
          <span className={`text-[9px] font-bold ${
            isFT ? 'text-gray-300' : (darkMode ? 'text-yellow-400' : 'text-red-600')
          }`}>
            {isFT ? `FIM ${endMin}'` : `${minute || 90}'`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(LiveMomentumGraph);
