import { useRef } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';
import { usePromotionProgress } from '@/react-app/hooks/usePromotionProgress';
import { Link } from 'react-router-dom';

/* ─────────────────────────────────────────────
   Floating particles background
───────────────────────────────────────────── */
function Particles() {
  const particles = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    size: 2 + Math.random() * 4,
    duration: 8 + Math.random() * 14,
    delay: Math.random() * 10,
    opacity: 0.15 + Math.random() * 0.35,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-yellow-400"
          style={{
            left: `${p.x}%`,
            bottom: '-10px',
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `floatUp ${p.duration}s ${p.delay}s infinite linear`,
          }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Rotating football SVG
───────────────────────────────────────────── */
function RotatingBall({ size = 80, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      style={{ animation: 'rotateBall 8s linear infinite', ...style }}
    >
      <circle cx="40" cy="40" r="38" fill="#111" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      <path
        d="M40 4 L52 20 L48 38 L32 38 L28 20 Z"
        fill="rgba(255,255,255,0.08)"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
      <path
        d="M52 20 L70 28 L68 46 L52 52 L48 38 Z"
        fill="rgba(255,255,255,0.05)"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
      />
      <path
        d="M10 28 L28 20 L32 38 L20 50 L8 42 Z"
        fill="rgba(255,255,255,0.05)"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
      />
      <path
        d="M20 50 L32 38 L48 38 L52 52 L36 62 Z"
        fill="rgba(255,255,255,0.08)"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
      <circle cx="40" cy="40" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   3-D style promo card
───────────────────────────────────────────── */
interface PromoCardProps {
  icon: string;
  tag: string;
  title: string;
  subtitle: string;
  highlight: string;
  gradient: string;
  glowColor: string;
  delay?: number;
}

function PromoCard({ icon, tag, title, subtitle, highlight, gradient, glowColor, delay = 0 }: PromoCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 20;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -20;
    el.style.transform = `perspective(700px) rotateX(${y}deg) rotateY(${x}deg) scale(1.03)`;
  };

  const handleLeave = () => {
    if (ref.current) ref.current.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg) scale(1)';
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="relative rounded-2xl overflow-hidden cursor-pointer group"
      style={{
        background: gradient,
        boxShadow: `0 8px 40px ${glowColor}22, 0 2px 8px rgba(0,0,0,0.5)`,
        transition: 'transform 0.15s ease, box-shadow 0.3s ease',
        animationDelay: `${delay}ms`,
        animation: `fadeSlideUp 0.6s ${delay}ms both`,
      }}
    >
      {/* Shimmer sweep */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none" />

      {/* Glow border on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ boxShadow: `inset 0 0 0 1.5px ${glowColor}55` }}
      />

      <div className="relative z-10 p-5">
        <div className="flex items-start justify-between mb-3">
          <span
            className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
            style={{ background: `${glowColor}28`, color: glowColor, border: `1px solid ${glowColor}40` }}
          >
            {tag}
          </span>
          <span className="text-3xl select-none" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}>{icon}</span>
        </div>

        <h3 className="text-white font-bold text-lg leading-tight mb-1">{title}</h3>
        <p className="text-white/55 text-xs mb-3">{subtitle}</p>

        <div
          className="text-xl font-black tracking-tight"
          style={{ color: glowColor, textShadow: `0 0 20px ${glowColor}80` }}
        >
          {highlight}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Promotions page
───────────────────────────────────────────── */
export default function Promotions() {
  const { user } = useApp();
  const { progress, loading } = usePromotionProgress(user?.id);

  const bonusReceived = Math.min(progress.deposit, 100);
  const rolloverTarget = bonusReceived * 5;
  const rolloverPct = Math.min((progress.staked / (rolloverTarget || 1)) * 100, 100);
  const depositBlocked = progress.staked < rolloverTarget;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080d18] flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-yellow-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const promos: PromoCardProps[] = [
    {
      icon: '🚀',
      tag: 'MÚLTIPLAS',
      title: 'Múltipla Turbinada',
      subtitle: '4 ou mais seleções',
      highlight: '+50% nos ganhos',
      gradient: 'linear-gradient(135deg, #0f0c29 0%, #302b63 100%)',
      glowColor: '#a78bfa',
      delay: 100,
    },
    {
      icon: '⚽',
      tag: 'SEGURO',
      title: 'Empate Anula',
      subtitle: 'Jogo terminar 0-0',
      highlight: 'Dinheiro de Volta',
      gradient: 'linear-gradient(135deg, #0a2010 0%, #0f3d1f 100%)',
      glowColor: '#4ade80',
      delay: 200,
    },
    {
      icon: '🛡️',
      tag: 'ACCA',
      title: 'Seguro ACCA',
      subtitle: 'Múltipla de 5+ jogos',
      highlight: 'Freebet se falhar 1',
      gradient: 'linear-gradient(135deg, #1a0800 0%, #3d1800 100%)',
      glowColor: '#fb923c',
      delay: 300,
    },
    {
      icon: '💰',
      tag: 'CASHOUT',
      title: 'Cashout Disponível',
      subtitle: 'Levante a qualquer momento',
      highlight: 'Controlo Total',
      gradient: 'linear-gradient(135deg, #00101a 0%, #001f35 100%)',
      glowColor: '#38bdf8',
      delay: 400,
    },
    {
      icon: '⚡',
      tag: 'ODDS BOOST',
      title: 'Odds Aumentadas',
      subtitle: 'Seleções especiais diárias',
      highlight: 'Até +200% de odds',
      gradient: 'linear-gradient(135deg, #1a0010 0%, #35001f 100%)',
      glowColor: '#f472b6',
      delay: 500,
    },
    {
      icon: '🎯',
      tag: 'DIÁRIO',
      title: 'Desafio do Dia',
      subtitle: 'Completa o desafio diário',
      highlight: '5€ em Freebets',
      gradient: 'linear-gradient(135deg, #0d1a00 0%, #1f3500 100%)',
      glowColor: '#a3e635',
      delay: 600,
    },
  ];

  return (
    <div className="min-h-screen bg-[#080d18] text-white" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── Global keyframe styles ── */}
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-100vh) scale(0.6); opacity: 0; }
        }
        @keyframes rotateBall {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes floatY {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-18px); }
        }
        @keyframes floatY2 {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50%      { transform: translateY(-12px) rotate(8deg); }
        }
        @keyframes pulseGold {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes countup {
          from { opacity: 0.3; }
          to   { opacity: 1; }
        }
        .gold-text {
          background: linear-gradient(90deg, #fbbf24, #f59e0b, #fde68a, #f59e0b, #fbbf24);
          background-size: 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
        .glow-red { text-shadow: 0 0 30px rgba(239,68,68,0.6), 0 0 60px rgba(239,68,68,0.3); }
      `}</style>

      {/* ────────── HERO ────────── */}
      <section className="relative min-h-[520px] flex flex-col items-center justify-center overflow-hidden px-4 pt-16 pb-12">

        {/* Deep gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1e] via-[#0d1528] to-[#110820]" />

        {/* Grid lines */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Radial glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-yellow-500/8 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-purple-600/6 blur-2xl pointer-events-none" />

        {/* Floating particles */}
        <Particles />

        {/* Floating balls — decorative */}
        <div className="absolute top-12 right-8 opacity-20 hidden md:block" style={{ animation: 'floatY 6s ease-in-out infinite' }}>
          <RotatingBall size={64} />
        </div>
        <div className="absolute bottom-16 left-10 opacity-15 hidden md:block" style={{ animation: 'floatY2 8s ease-in-out infinite' }}>
          <RotatingBall size={44} />
        </div>

        {/* Coin decorations */}
        <div className="absolute top-20 left-1/4 text-3xl opacity-20 select-none hidden lg:block" style={{ animation: 'floatY2 7s ease-in-out infinite' }}>🪙</div>
        <div className="absolute bottom-20 right-1/4 text-2xl opacity-15 select-none hidden lg:block" style={{ animation: 'floatY 9s ease-in-out infinite' }}>⭐</div>
        <div className="absolute top-32 right-1/3 text-xl opacity-10 select-none hidden lg:block" style={{ animation: 'floatY2 5s ease-in-out infinite' }}>💎</div>

        {/* Hero content */}
        <div className="relative z-10 text-center max-w-3xl mx-auto" style={{ animation: 'fadeSlideUp 0.7s ease both' }}>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-yellow-400 text-xs font-bold uppercase tracking-widest">Promoções Exclusivas</span>
          </div>

          {/* Main heading */}
          <h1 className="text-5xl md:text-7xl font-black mb-4 leading-none tracking-tight">
            <span className="gold-text">BÓNUS</span>
            <br />
            <span className="text-white">& OFERTAS</span>
          </h1>

          <p className="text-white/50 text-base md:text-lg mb-8 max-w-xl mx-auto">
            Multiplica os teus ganhos com as melhores promoções de apostas desportivas em Portugal.
          </p>

          {/* CTA */}
          <Link
            to="/deposit"
            className="group relative inline-flex items-center gap-3 px-8 py-3.5 rounded-xl font-bold text-sm uppercase tracking-widest overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              boxShadow: '0 8px 32px rgba(220,38,38,0.4), 0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <span className="relative z-10 text-white">Depositar Agora</span>
            <svg className="w-4 h-4 text-white relative z-10 group-hover:translate-x-1 transition-transform" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ────────── WELCOME BONUS HERO CARD ────────── */}
      <section className="px-4 -mt-4 pb-8 max-w-5xl mx-auto">
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #0f1c0f 0%, #0a1a24 40%, #1a0a20 100%)',
            boxShadow: '0 0 0 1px rgba(255,215,0,0.12), 0 20px 60px rgba(0,0,0,0.6)',
            animation: 'fadeSlideUp 0.8s 0.1s both',
          }}
        >
          {/* Golden shimmer top border */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />

          {/* Glow orb */}
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-yellow-500/5 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full bg-red-600/5 blur-3xl pointer-events-none" />

          {/* Floating ball decoration */}
          <div className="absolute right-6 top-6 opacity-25 hidden md:block" style={{ animation: 'floatY 5s ease-in-out infinite' }}>
            <RotatingBall size={100} />
          </div>

          <div className="relative z-10 p-8 md:p-10">
            <div className="flex flex-col md:flex-row gap-8 items-start">

              {/* Left column */}
              <div className="flex-1">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-4 border"
                  style={{ background: 'rgba(250,204,21,0.1)', color: '#facc15', borderColor: 'rgba(250,204,21,0.25)' }}>
                  🔥 Oferta de Boas-Vindas
                </span>

                <h2 className="text-3xl md:text-4xl font-black text-white mb-2 leading-tight">
                  Bónus de
                  <br />
                  <span className="gold-text">Boas-Vindas</span>
                </h2>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-5xl font-black" style={{ color: '#facc15', textShadow: '0 0 30px rgba(250,204,21,0.4)' }}>100%</span>
                  <span className="text-2xl font-bold text-white/60">até 100€</span>
                </div>

                <p className="text-white/50 text-sm mb-6 leading-relaxed max-w-md">
                  Faz o teu primeiro depósito e recebe o dobro para apostar. Depósito mínimo 10€ · Rollover 5x sobre o bónus.
                </p>

                {!user ? (
                  <button
                    onClick={() => document.dispatchEvent(new CustomEvent('open-auth-modal'))}
                    className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm overflow-hidden transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #facc15, #f59e0b)', color: '#1a0a00', boxShadow: '0 6px 24px rgba(250,204,21,0.35)' }}
                  >
                    <span className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                    <span className="relative z-10">Registar e Receber</span>
                    <svg className="w-4 h-4 relative z-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" /></svg>
                  </button>
                ) : (
                  <Link
                    to="/deposit"
                    className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm overflow-hidden transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #facc15, #f59e0b)', color: '#1a0a00', boxShadow: '0 6px 24px rgba(250,204,21,0.35)' }}
                  >
                    <span className="relative z-10">Depositar Agora</span>
                    <svg className="w-4 h-4 relative z-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" /></svg>
                  </Link>
                )}
              </div>

              {/* Right column — Progress (only for logged in users) */}
              {user && (
                <div
                  className="flex-shrink-0 w-full md:w-72 rounded-2xl p-5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white font-bold text-sm">O teu progresso</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: progress.deposit > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)', color: progress.deposit > 0 ? '#4ade80' : 'rgba(255,255,255,0.4)' }}
                    >
                      {progress.deposit > 0 ? '● Ativo' : 'Pendente'}
                    </span>
                  </div>

                  {/* Deposit bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-white/40 mb-1.5">
                      <span>Depósito inicial</span>
                      <span className="text-white/70 font-mono">{progress.deposit.toFixed(2)}€</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: progress.deposit > 0 ? '100%' : '0%', background: 'linear-gradient(90deg, #4ade80, #22c55e)' }}
                      />
                    </div>
                  </div>

                  {/* Rollover bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-white/40 mb-1.5">
                      <span>Rollover ({progress.staked.toFixed(2)}€ / {rolloverTarget.toFixed(2)}€)</span>
                      <span className="font-mono text-yellow-400">{rolloverPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${rolloverPct}%`, background: 'linear-gradient(90deg, #facc15, #f59e0b)' }}
                      />
                    </div>
                  </div>

                  {/* Status message */}
                  {progress.deposit > 0 && (
                    <div
                      className="text-xs rounded-xl p-3 flex items-start gap-2"
                      style={{
                        background: depositBlocked ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
                        border: depositBlocked ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(74,222,128,0.2)',
                      }}
                    >
                      <span>{depositBlocked ? '🔒' : '✅'}</span>
                      <p style={{ color: depositBlocked ? '#fca5a5' : '#86efac' }}>
                        {depositBlocked
                          ? `Faltam ${Math.max(rolloverTarget - progress.staked, 0).toFixed(2)}€ de apostas para libertar o bónus`
                          : 'Requisitos cumpridos! O teu bónus está disponível.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ────────── STATS STRIP ────────── */}
      <section className="px-4 pb-10 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ animation: 'fadeSlideUp 0.7s 0.15s both' }}>
          {[
            { label: 'Desportos', value: '20+', icon: '🏆' },
            { label: 'Eventos/dia', value: '1000+', icon: '⚡' },
            { label: 'Mercados', value: '50+', icon: '📊' },
            { label: 'Pagamento', value: 'Imediato', icon: '💳' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl p-4 flex flex-col items-center text-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-2xl mb-1">{s.icon}</span>
              <span className="text-xl font-black text-white">{s.value}</span>
              <span className="text-white/40 text-xs">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ────────── PROMO CARDS GRID ────────── */}
      <section className="px-4 pb-12 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6" style={{ animation: 'fadeSlideUp 0.6s 0.2s both' }}>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12))' }} />
          <h2 className="text-white font-black text-lg uppercase tracking-widest">Outras Promoções</h2>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {promos.map((p) => (
            <PromoCard key={p.tag} {...p} />
          ))}
        </div>
      </section>

      {/* ────────── FREE BET BANNER ────────── */}
      <section className="px-4 pb-12 max-w-5xl mx-auto">
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #10003a 0%, #1e004a 50%, #2a0060 100%)',
            boxShadow: '0 0 0 1px rgba(167,139,250,0.15), 0 20px 60px rgba(0,0,0,0.5)',
            animation: 'fadeSlideUp 0.7s 0.3s both',
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent" />
          <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 p-8 flex flex-col md:flex-row items-center gap-6">
            <div className="text-6xl select-none" style={{ animation: 'floatY2 4s ease-in-out infinite' }}>🎯</div>

            <div className="flex-1 text-center md:text-left">
              <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-3"
                style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.25)' }}>
                Desafio Semanal
              </span>
              <h3 className="text-2xl md:text-3xl font-black text-white mb-2">
                Deposita 20€ →{' '}
                <span style={{ color: '#c4b5fd', textShadow: '0 0 20px rgba(167,139,250,0.5)' }}>10€ FREE BET</span>
              </h3>
              <p className="text-white/45 text-sm max-w-md">
                Faz 4 apostas qualificadas (mín. 1,50 de odd) e recebe 10€ em freebets automaticamente.
              </p>
            </div>

            <Link
              to="/deposit"
              className="group relative shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm overflow-hidden transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 6px 24px rgba(124,58,237,0.4)', color: '#fff' }}
            >
              <span className="absolute inset-0 bg-white/10 -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
              <span className="relative z-10">Depositar</span>
              <svg className="w-4 h-4 relative z-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ────────── TERMS ────────── */}
      <section className="px-4 pb-16 max-w-5xl mx-auto">
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            animation: 'fadeSlideUp 0.7s 0.4s both',
          }}
        >
          <h3 className="text-white/60 font-bold text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
            <span>📜</span> Termos & Condições
          </h3>
          <ul className="space-y-2 text-xs text-white/35 leading-relaxed">
            {[
              'Todas as promoções estão sujeitas aos Termos e Condições Gerais da plataforma.',
              'Depósito mínimo para bónus: 10€. Bónus máximo de boas-vindas: 100€.',
              'Rollover de 5x sobre o bónus antes de qualquer levantamento.',
              'O depósito fica bloqueado enquanto o rollover não for cumprido.',
              'O bónus expira 30 dias após o depósito inicial.',
              'Freebets não são sacáveis — apenas os lucros gerados são levantáveis.',
              'Promoções contínuas (ACCA, Empate Anula, Múltiplas Turbinadas) concedem freebets válidas por 7 dias.',
              'A plataforma reserva-se o direito de alterar ou cancelar promoções a qualquer momento.',
            ].map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-white/20">·</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
