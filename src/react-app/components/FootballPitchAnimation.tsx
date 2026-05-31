// FootballPitchAnimation — fully event-driven (no perpetual ball motion)
// Ball moves ONLY when StatPal sends a relevant event:
//   • goal → 3D flight to goal + net flex + score flash
//   • big chance → ball pulses near opponent's goal
//   • corner → ball at correct corner with highlighted arc
//   • substitution → bottom-left overlay (out/in players)
//   • cards / VAR / fouls → badge overlay, ball stationary
import { useEffect, useRef, memo, useState } from 'react';

interface FootballPitchAnimationProps {
  homeName: string;
  awayName: string;
  isLive?: boolean;
  score?: string;
  statusLabel?: string;
  timer?: string;
  sport?: string;
  matchEvents?: any[];
  liveStats?: any[] | null;
}

type SportType = 'football' | 'basketball' | 'tennis' | 'volleyball' | 'handball' | 'hockey' | 'default';

function detectSport(sport?: string): SportType {
  const s = String(sport || '').toLowerCase();
  if (s.includes('basket')) return 'basketball';
  if (s.includes('tennis')) return 'tennis';
  if (s.includes('volley')) return 'volleyball';
  if (s.includes('hand'))   return 'handball';
  if (s.includes('hock'))   return 'hockey';
  return 'football';
}

// ─────────────────────────────────────────────────────────────────────
// Event parsing
// ─────────────────────────────────────────────────────────────────────
type BallMode =
  | { kind: 'idle' }
  | { kind: 'big_chance'; side: 'left' | 'right' }
  | { kind: 'goal'; side: 'left' | 'right'; phase: 'flying' | 'scored' }
  | { kind: 'corner'; corner: 'tl' | 'tr' | 'bl' | 'br' }
  | { kind: 'card'; color: 'yellow' | 'red' }
  | { kind: 'var' }
  | { kind: 'subst'; out: string; in_: string; teamSide: 'home' | 'away' };

interface ParsedEvent {
  mode: BallMode;
  badge: { icon: string; label: string } | null;
  /** Duration to hold the visual before returning to idle (ms) */
  durationMs: number;
}

function parseEvent(ev: any, homeName: string): ParsedEvent | null {
  if (!ev) return null;
  const text = `${ev?.type || ''} ${ev?.detail || ''} ${ev?.text || ''} ${ev?.event || ''} ${ev?.description || ''}`.toLowerCase();
  const teamName = String(ev?.team?.name || ev?.team || '').toLowerCase();
  const homeNorm = String(homeName || '').toLowerCase().slice(0, 6);
  const isHome = !!(homeNorm && teamName && teamName.includes(homeNorm));

  // GOAL — home attacks right (side=right when scoring), away attacks left
  if (/\b(goal|gol)\b/.test(text) && !/disallow|cancel|anulad|missed|own/.test(text)) {
    return {
      mode: { kind: 'goal', side: isHome ? 'right' : 'left', phase: 'flying' },
      badge: { icon: '⚽', label: 'GOL!' },
      durationMs: 6000,
    };
  }

  // BIG CHANCE
  if (/big.*chance|grande.*chance|great.*chance|big_chance|attempt.*saved|shot.*saved/.test(text)) {
    return {
      mode: { kind: 'big_chance', side: isHome ? 'right' : 'left' },
      badge: { icon: '🔥', label: 'GRANDE CHANCE' },
      durationMs: 5000,
    };
  }

  // CORNER — pick corner based on which side attacks + which flank
  if (/corner|escanteio/i.test(text)) {
    // Home attacks right → corners are top-right or bottom-right
    // Pick by event count parity (deterministic)
    const flank = (Number(ev?.timer || ev?.minute || 0) % 2) === 0 ? 'top' : 'bottom';
    let corner: 'tl' | 'tr' | 'bl' | 'br';
    if (isHome) corner = flank === 'top' ? 'tr' : 'br';
    else        corner = flank === 'top' ? 'tl' : 'bl';
    return {
      mode: { kind: 'corner', corner },
      badge: { icon: '🚩', label: 'Escanteio' },
      durationMs: 5000,
    };
  }

  // SUBSTITUTION
  if (/substitut|substitui/i.test(text)) {
    const outName = String(ev?.assist?.name || ev?.player?.name || ev?.player_out || '').trim();
    const inName  = String(ev?.player_in || ev?.player?.in || ev?.detail?.split('→')?.[1] || '').trim();
    return {
      mode: { kind: 'subst', out: outName || 'Sai', in_: inName || 'Entra', teamSide: isHome ? 'home' : 'away' },
      badge: { icon: '🔄', label: 'Substituição' },
      durationMs: 7000,
    };
  }

  // CARDS
  if (/red.?card|cartão.?verm/i.test(text)) {
    return { mode: { kind: 'card', color: 'red' }, badge: { icon: '🟥', label: 'Vermelho' }, durationMs: 4000 };
  }
  if (/yellow.?card|cartão.?ama/i.test(text)) {
    return { mode: { kind: 'card', color: 'yellow' }, badge: { icon: '🟨', label: 'Amarelo' }, durationMs: 4000 };
  }

  // VAR
  if (/\bvar\b|video.?assist|review/i.test(text)) {
    return { mode: { kind: 'var' }, badge: { icon: '📺', label: 'VAR' }, durationMs: 5000 };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Field SVGs (unchanged)
// ─────────────────────────────────────────────────────────────────────
const FootballField = ({ activeCorner }: { activeCorner: 'tl' | 'tr' | 'bl' | 'br' | null }) => {
  const cornerHl = (key: 'tl' | 'tr' | 'bl' | 'br') => activeCorner === key;
  return (
    <g>
      <defs>
        <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a7a1a" />
          <stop offset="33%" stopColor="#1e8c1e" />
          <stop offset="66%" stopColor="#1a7a1a" />
          <stop offset="100%" stopColor="#1e8c1e" />
        </linearGradient>
        <radialGradient id="cornerGlow">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="300" height="180" fill="url(#pitchGrad)" rx="4" />
      {[20,40,60,80,100,120,140,160,180,200,220,240,260,280].map(x => (
        <line key={x} x1={x} y1="0" x2={x} y2="180" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
      ))}
      <rect x="8" y="8" width="284" height="164" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" rx="2" />
      <line x1="150" y1="8" x2="150" y2="172" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
      <circle cx="150" cy="90" r="26" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
      <circle cx="150" cy="90" r="2" fill="rgba(255,255,255,0.9)" />
      <rect x="8" y="55" width="48" height="70" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
      <rect x="244" y="55" width="48" height="70" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
      <rect x="8" y="70" width="22" height="40" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
      <rect x="270" y="70" width="22" height="40" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
      {/* Goals (frames) */}
      <rect x="0" y="76" width="8" height="28" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      <rect x="292" y="76" width="8" height="28" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      {/* Penalty spots */}
      <circle cx="56" cy="90" r="2.5" fill="rgba(255,255,255,0.7)" />
      <circle cx="244" cy="90" r="2.5" fill="rgba(255,255,255,0.7)" />
      {/* Corner arcs (highlighted when active) */}
      <path d="M8 8 A8 8 0 0 1 16 8"     stroke={cornerHl('tl') ? '#fbbf24' : 'rgba(255,255,255,0.6)'} strokeWidth={cornerHl('tl') ? 2 : 1} fill="none"/>
      <path d="M292 8 A8 8 0 0 0 284 8"  stroke={cornerHl('tr') ? '#fbbf24' : 'rgba(255,255,255,0.6)'} strokeWidth={cornerHl('tr') ? 2 : 1} fill="none"/>
      <path d="M8 172 A8 8 0 0 0 8 164"  stroke={cornerHl('bl') ? '#fbbf24' : 'rgba(255,255,255,0.6)'} strokeWidth={cornerHl('bl') ? 2 : 1} fill="none"/>
      <path d="M292 172 A8 8 0 0 1 284 172" stroke={cornerHl('br') ? '#fbbf24' : 'rgba(255,255,255,0.6)'} strokeWidth={cornerHl('br') ? 2 : 1} fill="none"/>
      {/* Glow at active corner */}
      {activeCorner && (() => {
        const pos = { tl: [8, 8], tr: [292, 8], bl: [8, 172], br: [292, 172] }[activeCorner] as [number, number];
        return <circle cx={pos[0]} cy={pos[1]} r="22" fill="url(#cornerGlow)">
          <animate attributeName="r" values="14;26;14" dur="1.4s" repeatCount="indefinite" />
        </circle>;
      })()}
      {/* Corner flags */}
      <line x1="8"   y1="8"   x2="8"   y2="0"   stroke="#ffdd44" strokeWidth="1.5" />
      <polygon points="8,0 14,3 8,6" fill="#e63000" />
      <line x1="292" y1="8"   x2="292" y2="0"   stroke="#ffdd44" strokeWidth="1.5" />
      <polygon points="292,0 286,3 292,6" fill="#e63000" />
      <line x1="8"   y1="172" x2="8"   y2="180" stroke="#ffdd44" strokeWidth="1.5" />
      <polygon points="8,180 14,177 8,174" fill="#e63000" />
      <line x1="292" y1="172" x2="292" y2="180" stroke="#ffdd44" strokeWidth="1.5" />
      <polygon points="292,180 286,177 292,174" fill="#e63000" />
    </g>
  );
};

const BasketballCourt = () => (
  <g>
    <rect width="300" height="180" fill="#c8692a" rx="4" />
    <rect x="5" y="5" width="290" height="170" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
    <line x1="150" y1="5" x2="150" y2="175" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
    <circle cx="150" cy="90" r="20" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
    <circle cx="150" cy="90" r="3" fill="rgba(255,255,255,0.9)" />
    <path d="M5 55 L75 55 L75 125 L5 125" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
    <path d="M295 55 L225 55 L225 125 L295 125" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
    <path d="M5 55 A35 35 0 0 1 5 125" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="5 3"/>
    <path d="M295 55 A35 35 0 0 0 295 125" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="5 3"/>
    <rect x="0" y="79" width="5" height="22" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
    <rect x="295" y="79" width="5" height="22" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
  </g>
);

const TennisCourt = () => (
  <g>
    <rect width="300" height="180" fill="#2e6ca8" rx="4" />
    <rect x="10" y="10" width="280" height="160" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
    <line x1="150" y1="10" x2="150" y2="170" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
    <line x1="10" y1="90" x2="290" y2="90" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />
    <line x1="10" y1="40" x2="290" y2="40" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
    <line x1="10" y1="140" x2="290" y2="140" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
    <line x1="150" y1="40" x2="150" y2="140" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
    <line x1="10" y1="90" x2="290" y2="90" stroke="rgba(255,255,255,0.5)" strokeWidth="3" />
  </g>
);

const VolleyballCourt = () => (
  <g>
    <rect width="300" height="180" fill="#8b4513" rx="4" />
    <rect x="10" y="15" width="280" height="150" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
    <line x1="150" y1="15" x2="150" y2="165" stroke="rgba(255,255,255,0.9)" strokeWidth="4" />
    <line x1="70"  y1="15" x2="70"  y2="165" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="4 3"/>
    <line x1="230" y1="15" x2="230" y2="165" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="4 3"/>
  </g>
);

const HandballCourt = () => (
  <g>
    <rect width="300" height="180" fill="#d4a020" rx="4" />
    <rect x="8" y="8" width="284" height="164" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
    <line x1="150" y1="8" x2="150" y2="172" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
    <path d="M8 62 A48 48 0 0 1 8 118"   fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
    <path d="M292 62 A48 48 0 0 0 292 118" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
    <rect x="0"   y="74" width="8" height="32" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
    <rect x="292" y="74" width="8" height="32" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
  </g>
);

const HockeyRink = () => (
  <g>
    <rect width="300" height="180" fill="#a8d4f0" rx="4" />
    <rect x="8" y="8" width="284" height="164" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" rx="20" />
    <line x1="150" y1="8" x2="150" y2="172" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
    <circle cx="150" cy="90" r="12" fill="none" stroke="rgba(255,0,0,0.7)" strokeWidth="1.5" />
    <line x1="80"  y1="8" x2="80"  y2="172" stroke="rgba(255,0,0,0.5)" strokeWidth="1" />
    <line x1="220" y1="8" x2="220" y2="172" stroke="rgba(255,0,0,0.5)" strokeWidth="1" />
    <rect x="0"   y="72" width="8" height="36" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
    <rect x="292" y="72" width="8" height="36" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
  </g>
);

const clean = (s: string) => s.replace(/\s*\(.*?\)/g, '').trim();

const BALL_CONFIG: Record<SportType, { r: number; fill: string; stroke: string; lines: boolean }> = {
  football:   { r: 6, fill: 'white',    stroke: '#111',    lines: true },
  basketball: { r: 7, fill: '#e87722',  stroke: '#5c3317', lines: false },
  tennis:     { r: 5, fill: '#d4e157',  stroke: '#827717', lines: false },
  volleyball: { r: 7, fill: 'white',    stroke: '#1565c0', lines: false },
  handball:   { r: 6, fill: '#c62828',  stroke: '#7f0000', lines: false },
  hockey:     { r: 5, fill: '#212121',  stroke: '#555',    lines: false },
  default:    { r: 6, fill: 'white',    stroke: '#111',    lines: true },
};

// Goal target positions for each side (inside the goal frame)
const GOAL_TARGETS = {
  left:  { x: 4,   y: 90 },
  right: { x: 296, y: 90 },
};
const BIG_CHANCE_TARGETS = {
  left:  { x: 35,  y: 90 },
  right: { x: 265, y: 90 },
};
const CORNER_POSITIONS = {
  tl: { x: 10, y: 10 },
  tr: { x: 290, y: 10 },
  bl: { x: 10, y: 170 },
  br: { x: 290, y: 170 },
};

function FootballPitchAnimation({
  homeName, awayName, isLive, score, statusLabel, timer, sport, matchEvents,
}: FootballPitchAnimationProps) {
  const sportType = detectSport(sport);
  const ball = BALL_CONFIG[sportType] || BALL_CONFIG.default;

  // ── State machine ──
  const [mode, setMode] = useState<BallMode>({ kind: 'idle' });
  const [badge, setBadge] = useState<{ icon: string; label: string } | null>(null);
  const [scoreFlash, setScoreFlash] = useState(false);
  const [netFlex, setNetFlex] = useState(false);
  const lastEventIdRef = useRef<string>('');
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();
  const goalPhaseTimer = useRef<ReturnType<typeof setTimeout>>();

  // Watch for new events and update state
  useEffect(() => {
    if (!isLive || !matchEvents?.length) return;
    const latest = matchEvents[matchEvents.length - 1];
    const id = `${latest?.timer || latest?.minute || latest?.time?.elapsed || ''}|${latest?.type || ''}|${latest?.detail || ''}|${latest?.player?.name || latest?.player || ''}`;
    if (id === lastEventIdRef.current) return;
    lastEventIdRef.current = id;

    const parsed = parseEvent(latest, homeName);
    if (!parsed) return;

    // Apply mode + badge
    setMode(parsed.mode);
    setBadge(parsed.badge);

    // Reset previous timers
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (goalPhaseTimer.current) clearTimeout(goalPhaseTimer.current);

    // Goal: phase transition flying → scored (net flex + score flash)
    if (parsed.mode.kind === 'goal') {
      setNetFlex(false);
      setScoreFlash(false);
      goalPhaseTimer.current = setTimeout(() => {
        setMode({ kind: 'goal', side: (parsed.mode as any).side, phase: 'scored' });
        setNetFlex(true);
        setScoreFlash(true);
        setTimeout(() => setNetFlex(false), 1200);
        setTimeout(() => setScoreFlash(false), 2000);
      }, 1400);
    }

    // Auto-return to idle
    resetTimer.current = setTimeout(() => {
      setMode({ kind: 'idle' });
      setBadge(null);
    }, parsed.durationMs);
  }, [matchEvents, isLive, homeName]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      if (goalPhaseTimer.current) clearTimeout(goalPhaseTimer.current);
    };
  }, []);

  // Compute ball position + visual state from mode
  const ballPos = (() => {
    switch (mode.kind) {
      case 'goal':       return GOAL_TARGETS[mode.side];
      case 'big_chance': return BIG_CHANCE_TARGETS[mode.side];
      case 'corner':     return CORNER_POSITIONS[mode.corner];
      default:           return { x: 150, y: 90 };
    }
  })();
  const isPulsing = mode.kind === 'big_chance' || mode.kind === 'corner';
  const isGoalFlying = mode.kind === 'goal' && (mode as any).phase === 'flying';
  const isGoalScored = mode.kind === 'goal' && (mode as any).phase === 'scored';
  const ballScale = isGoalFlying ? 1.6 : isGoalScored ? 1.3 : 1;
  const activeCorner = mode.kind === 'corner' ? mode.corner : null;

  const homeShort = clean(homeName).slice(0, 14);
  const awayShort = clean(awayName).slice(0, 14);

  const renderField = () => {
    switch (sportType) {
      case 'basketball': return <BasketballCourt />;
      case 'tennis':     return <TennisCourt />;
      case 'volleyball': return <VolleyballCourt />;
      case 'handball':   return <HandballCourt />;
      case 'hockey':     return <HockeyRink />;
      default:           return <FootballField activeCorner={activeCorner} />;
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none" style={{ minHeight: 180 }}>
      <svg
        viewBox="0 0 300 180"
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="ballShadow">
            <feDropShadow dx="1" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.5" />
          </filter>
          <filter id="goalGlow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="pulseGrad">
            <stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.85" />
            <stop offset="60%"  stopColor="#ef4444" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>
        </defs>

        {renderField()}

        {/* ── Goal nets (visible when flexing) ── */}
        {sportType === 'football' && (
          <>
            {/* Left net mesh (back of goal) */}
            <g opacity={netFlex && mode.kind === 'goal' && (mode as any).side === 'left' ? 1 : 0.25}>
              {[78, 84, 90, 96, 102].map(y => (
                <line key={`lnh${y}`} x1="0" y1={y} x2="8" y2={y} stroke="#fff" strokeWidth="0.4" />
              ))}
              {[1, 3, 5, 7].map(x => (
                <line key={`lnv${x}`} x1={x} y1="76" x2={x} y2="104" stroke="#fff" strokeWidth="0.4" />
              ))}
            </g>
            {/* Right net mesh */}
            <g opacity={netFlex && mode.kind === 'goal' && (mode as any).side === 'right' ? 1 : 0.25}>
              {[78, 84, 90, 96, 102].map(y => (
                <line key={`rnh${y}`} x1="292" y1={y} x2="300" y2={y} stroke="#fff" strokeWidth="0.4" />
              ))}
              {[293, 295, 297, 299].map(x => (
                <line key={`rnv${x}`} x1={x} y1="76" x2={x} y2="104" stroke="#fff" strokeWidth="0.4" />
              ))}
            </g>
            {/* Net "flex" bulge — visible only on goal score */}
            {netFlex && mode.kind === 'goal' && (mode as any).side === 'right' && (
              <path d="M 292 80 Q 304 90 292 100" fill="rgba(255,255,255,0.35)" stroke="#fff" strokeWidth="0.6">
                <animate attributeName="d" values="M 292 80 Q 292 90 292 100; M 292 80 Q 308 90 292 100; M 292 80 Q 296 90 292 100" dur="0.8s" repeatCount="2" />
              </path>
            )}
            {netFlex && mode.kind === 'goal' && (mode as any).side === 'left' && (
              <path d="M 8 80 Q -4 90 8 100" fill="rgba(255,255,255,0.35)" stroke="#fff" strokeWidth="0.6">
                <animate attributeName="d" values="M 8 80 Q 8 90 8 100; M 8 80 Q -8 90 8 100; M 8 80 Q 4 90 8 100" dur="0.8s" repeatCount="2" />
              </path>
            )}
          </>
        )}

        {/* ── Pulse glow under ball (big chance / corner) ── */}
        {isPulsing && (
          <circle cx={ballPos.x} cy={ballPos.y} r="14" fill="url(#pulseGrad)">
            <animate attributeName="r" values="8;22;8" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}

        {/* ── Ball ── */}
        <g
          style={{
            transition: isGoalFlying
              ? 'transform 1.4s cubic-bezier(0.5, -0.2, 0.7, 1)'  // 3D flight curve
              : 'transform 0.8s ease-in-out',
            transform: `translate(${ballPos.x - 150}px, ${ballPos.y - 90}px) scale(${ballScale})`,
            transformOrigin: '150px 90px',
            transformBox: 'view-box',
          } as any}
        >
          <circle
            cx={150} cy={90}
            r={ball.r}
            fill={ball.fill}
            stroke={ball.stroke}
            strokeWidth="0.8"
            filter={isGoalFlying || isGoalScored ? 'url(#goalGlow)' : 'url(#ballShadow)'}
          />
          {ball.lines && (
            <circle cx={150} cy={90} r={ball.r} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" strokeDasharray="4 3" />
          )}
        </g>

        {/* Pre-game indicator */}
        {!isLive && (
          <text x="150" y="30" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontWeight="bold" letterSpacing="2">
            PRÉ-JOGO
          </text>
        )}
      </svg>

      {/* ── Event badge (top-center) ── */}
      {badge && (
        <div className="absolute top-12 left-0 right-0 flex items-center justify-center z-20 pointer-events-none">
          <div className={`bg-black/75 text-white px-4 py-1.5 rounded-xl text-center shadow-xl backdrop-blur-sm
            ${mode.kind === 'goal' ? 'animate-bounce' : 'animate-pulse'}`}>
            <span className="text-lg mr-1.5">{badge.icon}</span>
            <span className="text-xs font-black uppercase tracking-widest text-yellow-300">{badge.label}</span>
          </div>
        </div>
      )}

      {/* ── Substitution overlay (bottom-left) ── */}
      {mode.kind === 'subst' && (
        <div className="absolute bottom-2 left-2 z-20 pointer-events-none animate-pulse">
          <div className="bg-black/85 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-lg border border-white/10">
            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              <span className="text-red-400">↓</span>
              <span className="text-red-300 max-w-[110px] truncate">{mode.out}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold mt-0.5">
              <span className="text-emerald-400">↑</span>
              <span className="text-emerald-300 max-w-[110px] truncate">{mode.in_}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Team names & score (with goal flash) ── */}
      <div className="relative z-10 w-full flex items-center justify-between px-3 pointer-events-none" style={{ paddingTop: 8 }}>
        <div className="text-left" style={{ maxWidth: '36%' }}>
          <div className="text-white font-bold text-xs md:text-sm leading-tight drop-shadow-lg truncate">{homeShort}</div>
        </div>

        <div className="text-center flex flex-col items-center gap-0.5">
          {isLive && score ? (
            <>
              <div className={`text-white font-black text-2xl md:text-3xl leading-none drop-shadow-lg tabular-nums transition-all duration-300
                ${scoreFlash ? 'scale-150 text-yellow-300 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]' : ''}`}>
                {score}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {statusLabel && <span className="text-[10px] font-bold bg-black/40 text-white px-2 py-0.5 rounded uppercase">{statusLabel}</span>}
                {timer && <span className="text-[10px] font-bold bg-red-600/90 text-white px-2 py-0.5 rounded">{timer}</span>}
                <span className="relative flex h-1.5 w-1.5 ml-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
              </div>
            </>
          ) : (
            <div className="text-white font-black text-xl drop-shadow-lg opacity-80">VS</div>
          )}
        </div>

        <div className="text-right" style={{ maxWidth: '36%' }}>
          <div className="text-white font-bold text-xs md:text-sm leading-tight drop-shadow-lg truncate">{awayShort}</div>
        </div>
      </div>
    </div>
  );
}

export default memo(FootballPitchAnimation);
