// ShotHeatmap — renders PitchAPI shots on a 105×68m football pitch projected
// onto a 300×180 SVG canvas (same viewBox scale as FootballPitchAnimation
// so they look visually identical when stacked).
//
// PitchAPI coordinate contract (NEVER invert):
//   x ∈ [0, 105] → 105m along the pitch, every shot attacks the goal at x=105.
//   y ∈ [0, 68]   → 68m across the pitch, centre line at y=34.
//   goal posts at y ∈ [30.34, 37.66] (7.32m opening centered on y=34).
//
// Each shot is rendered as:
//   • a filled circle at (x,y) — larger when xG is higher
//   • colour by outcome: goal green / saved yellow / miss red / post orange
//   • dashed line from (x,y) → (105, goal_crossed_y) when crossing position known
//   • small crosshair at (105, goal_crossed_y) with z shown as tooltip
import { useMemo } from 'react';
import type { PitchShot } from '../../shared/types';

export interface ShotHeatmapProps {
  shots?: PitchShot[] | null;
  darkMode?: boolean;
  showLegend?: boolean;
  maxShots?: number;
  /** Home attacks right (x=105), away attacks left. By default PitchAPI
   *  always reports shots from the shooter's perspective (goal at 105). Flip
   *  to render away shots on the left side for visual team separation. */
  mirrorAwayShots?: boolean;
}

const VIEW_W = 300;
const VIEW_H = 180;
const PITCH_W_M = 105;
const PITCH_H_M = 68;

function xMToSvg(x: number): number { return Math.max(0, Math.min(VIEW_W, (x / PITCH_W_M) * VIEW_W)); }
function yMToSvg(y: number): number { return Math.max(0, Math.min(VIEW_H, (y / PITCH_H_M) * VIEW_H)); }

function colourForShot(s: PitchShot, dark: boolean): { fill: string; stroke: string } {
  if (s.event_type === 'Goal') {
    return dark ? { fill: '#22c55e', stroke: '#86efac' } : { fill: '#16a34a', stroke: '#65a30d' };
  }
  if (s.event_type === 'Post') {
    return dark ? { fill: '#fb923c', stroke: '#fdba74' } : { fill: '#f97316', stroke: '#ea580c' };
  }
  if (s.event_type === 'AttemptSaved' || s.is_on_target) {
    return dark ? { fill: '#eab308', stroke: '#fde047' } : { fill: '#ca8a04', stroke: '#a16207' };
  }
  // Miss / blocked
  return dark ? { fill: '#ef4444', stroke: '#fca5a5' } : { fill: '#dc2626', stroke: '#991b1b' };
}

function radiusForShot(xg: number | undefined): number {
  const v = Number(xg) || 0.03;
  return 2 + Math.min(8, Math.sqrt(v) * 14);
}

export default function ShotHeatmap({
  shots,
  darkMode = false,
  showLegend = true,
  maxShots = 200,
  mirrorAwayShots = true,
}: ShotHeatmapProps) {
  const items = useMemo<PitchShot[]>(() => {
    if (!Array.isArray(shots)) return [];
    const sorted = [...shots].sort((a, b) => (b.expected_goals || 0) - (a.expected_goals || 0));
    return sorted.slice(0, maxShots);
  }, [shots, maxShots]);

  const surfaceStroke = darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.85)';
  const surfaceFill = `url(#pitchGrad-${darkMode ? 'dark' : 'light'})`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto rounded-md">
        <defs>
          <linearGradient id={`pitchGrad-${darkMode ? 'dark' : 'light'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={darkMode ? '#0f3d0f' : '#1a7a1a'} />
            <stop offset="50%"  stopColor={darkMode ? '#134e13' : '#1e8c1e'} />
            <stop offset="100%" stopColor={darkMode ? '#0f3d0f' : '#1a7a1a'} />
          </linearGradient>
          <marker id="shotArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={darkMode ? '#ffffff' : '#ffffff'} opacity="0.7" />
          </marker>
        </defs>

        {/* Field outline */}
        <rect x="8" y="8" width="284" height="164" rx="4" fill={surfaceFill} />
        <rect x="8" y="8" width="284" height="164" fill="none" stroke={surfaceStroke} strokeWidth="1.5" rx="4" />

        {/* Midline + centre circle */}
        <line x1="150" y1="8" x2="150" y2="172" stroke={surfaceStroke} strokeWidth="1.5" />
        <circle cx="150" cy="90" r="26" fill="none" stroke={surfaceStroke} strokeWidth="1.5" />
        <circle cx="150" cy="90" r="2" fill={surfaceStroke} />

        {/* Penalty areas */}
        <rect x="8" y="55" width="48" height="70" fill="none" stroke={surfaceStroke} strokeWidth="1.5" />
        <rect x="244" y="55" width="48" height="70" fill="none" stroke={surfaceStroke} strokeWidth="1.5" />
        <rect x="8" y="70" width="22" height="40" fill="none" stroke={surfaceStroke} strokeWidth="1.2" />
        <rect x="270" y="70" width="22" height="40" fill="none" stroke={surfaceStroke} strokeWidth="1.2" />
        <circle cx="56" cy="90" r="2.5" fill={surfaceStroke} />
        <circle cx="244" cy="90" r="2.5" fill={surfaceStroke} />

        {/* Goals (narrow rectangles flush with field edges) */}
        <rect x="0" y="76" width="8" height="28" fill="rgba(255,255,255,0.12)" stroke={surfaceStroke} strokeWidth="1" />
        <rect x="292" y="76" width="8" height="28" fill="rgba(255,255,255,0.12)" stroke={surfaceStroke} strokeWidth="1" />

        {/* Shots */}
        {items.map((s) => {
          let xM = Number(s.x);
          let yM = Number(s.y);
          if (!Number.isFinite(xM) || !Number.isFinite(yM)) return null;
          const flip = mirrorAwayShots && s.teamSide === 'away';
          if (flip) xM = PITCH_W_M - xM;
          const cx = xMToSvg(xM);
          const cy = yMToSvg(yM);
          const { fill, stroke } = colourForShot(s, darkMode);
          const r = radiusForShot(s.expected_goals);

          let endCx: number | null = null;
          let endCy: number | null = null;
          if (typeof s.goal_crossed_y === 'number') {
            const goalX = flip ? 0 : PITCH_W_M;
            endCx = xMToSvg(goalX);
            const gyM = s.goal_crossed_y;
            // do not flip y goal cross — stays on same side of field as shot
            endCy = yMToSvg(gyM);
          }

          const title = [
            `${s.event_type ?? 'Shot'}${s.is_own_goal ? ' (OG)' : ''}`,
            s.player?.name ? s.player.name : null,
            typeof s.minute === 'number' ? `${s.minute}${typeof s.minute_added === 'number' ? `+${s.minute_added}` : ''}'` : null,
            `xG ${(s.expected_goals ?? 0).toFixed(2)}`,
            `@(${s.x?.toFixed(1)}, ${s.y?.toFixed(1)})m`,
            typeof s.goal_crossed_y === 'number' ? `gol Y=${s.goal_crossed_y.toFixed(1)}m${typeof s.goal_crossed_z === 'number' ? ` Z=${s.goal_crossed_z.toFixed(2)}m` : ''}` : null,
          ].filter(Boolean).join(' · ');

          return (
            <g key={s.id}>
              {endCx != null && endCy != null && (
                <line
                  x1={cx}
                  y1={cy}
                  x2={endCx}
                  y2={endCy}
                  stroke={stroke}
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  opacity="0.65"
                  markerEnd="url(#shotArrow)"
                />
              )}
              {endCx != null && endCy != null && (
                <g>
                  <line x1={endCx - 2.5} y1={endCy} x2={endCx + 2.5} y2={endCy} stroke={stroke} strokeWidth="1" />
                  <line x1={endCx} y1={endCy - 2.5} x2={endCx} y2={endCy + 2.5} stroke={stroke} strokeWidth="1" />
                </g>
              )}
              <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth="1" opacity="0.88">
                <title>{title}</title>
              </circle>
            </g>
          );
        })}
      </svg>

      {showLegend && (
        <div className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: darkMode ? '#22c55e' : '#16a34a' }} />
            Gol
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: darkMode ? '#eab308' : '#ca8a04' }} />
            Alvo / Defendida
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: darkMode ? '#fb923c' : '#f97316' }} />
            Travessão
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: darkMode ? '#ef4444' : '#dc2626' }} />
            Fora / Bloqueada
          </span>
          <span>Tamanho = xG</span>
          <span className="ml-auto">Campo 105×68m (metros reais, não normalizado)</span>
        </div>
      )}
    </div>
  );
}
