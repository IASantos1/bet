import { useRef } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';

interface WorldCupBannerProps {
  variant?: 'compact' | 'hero';
}

export default function WorldCupBanner({ variant = 'compact' }: WorldCupBannerProps) {
  const { setSelectedCategory } = useApp();
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 7;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -5;
    el.style.transform = `perspective(1200px) rotateX(${y}deg) rotateY(${x}deg) scale(1.015)`;
  };
  const handleLeave = () => {
    if (wrapRef.current) {
      wrapRef.current.style.transform =
        'perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)';
    }
  };

  const isHero = variant === 'hero';

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={() => setSelectedCategory('copa-do-mundo')}
      className="relative w-full overflow-hidden rounded-2xl cursor-pointer select-none"
      style={{
        transition: 'transform 0.2s ease',
        boxShadow:
          '0 24px 60px rgba(0,0,0,0.7), 0 4px 20px rgba(212,151,43,0.4), inset 0 0 0 1px rgba(255,215,120,0.25)',
      }}
    >
      <img
        src="/assets/copa-do-mundo-2026.jpeg"
        alt="Copa do Mundo 2026 – BET62"
        draggable={false}
        className={`w-full object-cover object-center ${isHero ? 'max-h-[340px]' : 'max-h-[200px] sm:max-h-[260px] md:max-h-[300px]'}`}
        style={{ display: 'block' }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.40) 45%, rgba(0,0,0,0.10) 100%)',
        }}
      />

      <div
        className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,215,80,0.7) 30%, rgba(255,215,80,0.9) 50%, rgba(255,215,80,0.7) 70%, transparent 100%)',
          boxShadow: '0 0 12px 2px rgba(255,200,40,0.5)',
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none opacity-0 hover:opacity-100"
        style={{
          background:
            'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.07) 50%, transparent 62%)',
          transition: 'opacity 0.3s',
        }}
      />

      <div className="absolute bottom-0 left-0 right-0 px-4 py-4 flex items-end justify-between pointer-events-none">
        <div className="space-y-0.5">
          <div
            className="text-[10px] font-black uppercase tracking-[0.22em] leading-none"
            style={{ color: 'rgba(255,215,80,0.85)' }}
          >
            FIFA ·{' '}
            <span className="text-white/60">EUA · CANADÁ · MÉXICO</span>
          </div>
          <div
            className={`font-black uppercase leading-none tracking-tight ${isHero ? 'text-2xl md:text-3xl' : 'text-lg md:text-2xl'}`}
            style={{ color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}
          >
            Copa do Mundo{' '}
            <span
              style={{
                color: '#ffd040',
                textShadow: '0 0 18px rgba(255,200,40,0.8), 0 2px 8px rgba(0,0,0,0.7)',
              }}
            >
              2026
            </span>
          </div>
          <div className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.60)' }}>
            48 selecções · 104 jogos · começa 11 junho
          </div>
        </div>

        <button
          type="button"
          onClick={(ev) => { ev.stopPropagation(); setSelectedCategory('copa-do-mundo'); }}
          className="pointer-events-auto shrink-0 ml-3 flex items-center gap-1.5 rounded-xl px-4 py-2.5 font-black uppercase text-[11px] tracking-wide"
          style={{
            background: 'linear-gradient(135deg, #f5c018 0%, #e8a000 100%)',
            color: '#1a0a00',
            boxShadow: '0 4px 18px rgba(245,192,24,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
            border: '1px solid rgba(255,230,100,0.4)',
          }}
        >
          <span>🏆</span>
          <span>Aposte Agora</span>
        </button>
      </div>

      <span
        className="absolute right-4 top-4 pointer-events-none"
        style={{ animation: 'wcPulse 2.4s ease-in-out infinite' }}
      >
        <span
          className="block w-2.5 h-2.5 rounded-full"
          style={{ background: 'rgba(255,215,80,0.85)', boxShadow: '0 0 8px 3px rgba(255,200,50,0.5)' }}
        />
      </span>

      <style>{`
        @keyframes wcPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.3; transform:scale(1.8); }
        }
      `}</style>
    </div>
  );
}
