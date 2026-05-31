import { memo, useMemo } from 'react';

interface MomentumPoint {
  minute: number;
  home: number;
  away: number;
}

interface LiveMomentumSticksGraphProps {
  darkMode: boolean;
  stats?: any;
  matchEvents?: any[];
  homeName?: string;
  awayName?: string;
  currentMinute?: number;
  statusKey?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const toNum = (v: any): number | null => {
  const n = Number(String(v ?? '').replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
};

const extractPair = (node: any): { home: number; away: number } | null => {
  if (!node || typeof node !== 'object') return null;
  const h = (node.home ?? node.local ?? node.team1 ?? node.t1 ?? node.a) as any;
  const a = (node.away ?? node.visitor ?? node.team2 ?? node.t2 ?? node.b) as any;
  const hn = typeof h === 'object' ? toNum(h.value ?? h.val ?? h.amount ?? h.count ?? h) : toNum(h);
  const an = typeof a === 'object' ? toNum(a.value ?? a.val ?? a.amount ?? a.count ?? a) : toNum(a);
  if (hn == null || an == null) return null;
  return { home: hn, away: an };
};

const findPairByLabel = (root: any, labelRegex: RegExp): { home: number; away: number } | null => {
  const stack: any[] = [root];
  const seen = new Set<any>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    if (typeof (cur as any).type === 'string' && labelRegex.test(String((cur as any).type))) {
      const p = extractPair(cur);
      if (p) return p;
      const p2 = extractPair((cur as any).values);
      if (p2) return p2;
    }
    if (typeof (cur as any).name === 'string' && labelRegex.test(String((cur as any).name))) {
      const p = extractPair(cur);
      if (p) return p;
      const p2 = extractPair((cur as any).values);
      if (p2) return p2;
    }

    for (const [k, v] of Object.entries(cur)) {
      if (labelRegex.test(k)) {
        const p = extractPair(v);
        if (p) return p;
      }
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
};

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
    const poss = findPairByLabel(stats, /possession/i);
    const attacks = findPairByLabel(stats, /dangerous.*attack|attacks?/i);
    const shots = findPairByLabel(stats, /total.*shots|shots?\s*total|shots$/i);
    const onTarget = findPairByLabel(stats, /shots?\s*on\s*target|on\s*target/i);

    const homeShots = shots ? shots.home : Number(stats?.shots?.home || stats?.onTarget?.home || 0);
    const awayShots = shots ? shots.away : Number(stats?.shots?.away || stats?.onTarget?.away || 0);
    const homeAttacks = attacks ? attacks.home : Number(stats?.attacks?.home || homeShots * 3);
    const awayAttacks = attacks ? attacks.away : Number(stats?.attacks?.away || awayShots * 3);
    const totalAttacks = homeAttacks + awayAttacks || 1;
    const possH = poss ? poss.home : null;
    const possRatio = possH != null ? clamp(possH / 100, 0.05, 0.95) : null;
    const attackRatio = clamp(homeAttacks / totalAttacks, 0.05, 0.95);
    const sot = onTarget ? onTarget : null;
    const sotTotal = sot ? (sot.home + sot.away) : 0;
    const sotRatio = sot && sotTotal > 0 ? clamp(sot.home / sotTotal, 0.05, 0.95) : attackRatio;

    homeRatio = (possRatio != null ? possRatio : attackRatio) * 0.55 + attackRatio * 0.25 + sotRatio * 0.20;
    awayRatio = 1 - homeRatio;
  }
  return { homeRatio, awayRatio };
}

function buildMomentumData(stats: any, endMin: number, axisMax: number): MomentumPoint[] {
  if (endMin <= 0) return [];
  const { homeRatio, awayRatio } = deriveRatios(stats);
  const points: MomentumPoint[] = [];
  const step = 2;
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

function LiveMomentumSticksGraph({
  darkMode, stats, matchEvents, homeName, awayName, currentMinute, statusKey,
}: LiveMomentumSticksGraphProps) {
  const status = String(statusKey || '').toUpperCase().trim();
  const minute = Math.max(0, Number(currentMinute) || 0);
  const isHT = status === 'HT' || status === 'INT' || /half.?time|intervalo/i.test(status);
  const isFT = ['FT', 'AET', 'PEN', 'FINISHED', 'ENDED', 'AFTER'].some(k => status.includes(k));
  const is1H = status === '1H' || status === '1' || (!isHT && !isFT && minute > 0 && minute <= 45);
  const is2H = status === '2H' || status === '2H' || status === '2' || status === 'ET' || status === 'P';
  const AXIS_MAX = Math.max(95, minute + 2, isFT ? 90 : 0);
  let endMin: number;
  if (isFT)       endMin = Math.max(minute, 90);
  else if (isHT)  endMin = Math.max(minute, 45);
  else if (is1H)  endMin = Math.min(minute, 50);
  else if (is2H)  endMin = Math.min(Math.max(minute, 45), 100);
  else            endMin = Math.min(minute, AXIS_MAX);

  const data = useMemo(() => buildMomentumData(stats, endMin, AXIS_MAX), [stats, endMin, AXIS_MAX]);

  const W = 320;
  const H = 120;
  const PAD_TOP = 30;
  const PAD = 10;
  const plotW = W - PAD * 2;
  const plotH = H - PAD - PAD_TOP;
  const minToX = (m: number) => PAD + (clamp(m, 0, AXIS_MAX) / AXIS_MAX) * plotW;
  const baseY = PAD_TOP + plotH / 2;
  const barW = 3.2;

  return (
    <div className={`rounded-xl overflow-hidden ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
      <div className="px-4 pt-3 pb-1">
        <div className="text-[11px] font-black uppercase tracking-widest text-red-600">Pressão em Tempo Real</div>
      </div>

      <div className="flex items-center justify-between px-4 -mt-0.5 pb-2">
        <span className={`text-xs font-bold truncate max-w-[40%] ${darkMode ? 'text-red-300' : 'text-red-600'}`}>{homeName || 'Casa'}</span>
        <span className={`text-xs font-bold truncate max-w-[40%] text-right ${darkMode ? 'text-green-300' : 'text-green-600'}`}>{awayName || 'Fora'}</span>
      </div>

      <div className="px-3 pb-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
          <line x1={PAD} y1={baseY} x2={W - PAD} y2={baseY} stroke={darkMode ? '#334155' : '#e5e7eb'} strokeWidth="1" />
          {data.map((p, idx) => {
            const x = minToX(p.minute);
            const d = clamp(p.home - 0.5, -0.5, 0.5);
            const h = Math.abs(d) * plotH;
            const y1 = baseY;
            const y2 = d >= 0 ? baseY - h : baseY + h;
            const stroke = d >= 0 ? '#ef4444' : '#22c55e';
            return (
              <line
                key={`${p.minute}-${idx}`}
                x1={x}
                y1={y1}
                x2={x}
                y2={y2}
                stroke={stroke}
                strokeWidth={barW}
                strokeLinecap="round"
                opacity={0.95}
              />
            );
          })}
          <text x={PAD} y={H - 6} fontSize="10" fill={darkMode ? '#94a3b8' : '#9ca3af'}>0'</text>
          <text x={W - PAD} y={H - 6} fontSize="10" fill={darkMode ? '#94a3b8' : '#9ca3af'} textAnchor="end">{Math.floor(endMin)}'</text>
        </svg>

        {(!Array.isArray(matchEvents) || matchEvents.length === 0) && (
          <div className={`text-center text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Nenhum evento registado neste momento.
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(LiveMomentumSticksGraph);
