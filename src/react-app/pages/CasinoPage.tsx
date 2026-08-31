import { useApp } from '@/react-app/contexts/AppContext';

const CATEGORIES = [
  { icon: '🎰', label: 'Slots' },
  { icon: '🃏', label: 'Mesa' },
  { icon: '🎥', label: 'Casino Ao Vivo' },
  { icon: '🎲', label: 'Instantâneos' },
];

function Die({ size = 88, dark = false, pips, style }: { size?: number; dark?: boolean; pips: number[][]; style?: React.CSSProperties }) {
  return (
    <div
      className="die"
      style={{
        width: size,
        height: size,
        background: dark
          ? 'radial-gradient(circle at 30% 25%, #3a3f47 0%, #1c1f24 55%, #0c0d10 100%)'
          : 'radial-gradient(circle at 30% 25%, #ff8a80 0%, #ef4444 45%, #a91c1c 100%)',
        boxShadow: dark
          ? '0 14px 30px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.15)'
          : '0 14px 30px rgba(185,28,28,0.45), inset 0 1px 1px rgba(255,255,255,0.35)',
        ...style,
      }}
    >
      <div className="die-face">
        {pips.map(([x, y], i) => (
          <span
            key={i}
            className="die-pip"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              background: dark ? '#f4f4f5' : '#fff5f5',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CasinoPage() {
  const { darkMode } = useApp();

  return (
    <div className={darkMode ? 'bg-gray-900' : 'bg-gray-50'}>
      <style>{`
        @keyframes casinoFloat {
          0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)); }
          50% { transform: translateY(-8px) rotate(var(--r, 0deg)); }
        }
        .die { border-radius: 18%; position: relative; flex-shrink: 0; }
        .die-face { position: absolute; inset: 0; }
        .die-pip {
          position: absolute;
          width: 15%;
          height: 15%;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.35);
        }
        .chip {
          border-radius: 999px;
          flex-shrink: 0;
          background:
            repeating-conic-gradient(#fff 0deg 22.5deg, transparent 22.5deg 45deg),
            radial-gradient(circle, var(--chip-c, #dc2626) 62%, transparent 63%);
          box-shadow: 0 8px 18px rgba(0,0,0,0.4), inset 0 0 0 3px rgba(255,255,255,0.85), inset 0 0 0 6px var(--chip-c, #dc2626);
        }
      `}</style>

      {/* Hero — deliberately fixed dark/red regardless of site theme, same "always-branded"
          treatment as the promo cards on Home/Promotions: a casino floor doesn't go light mode. */}
      <section className="relative overflow-hidden px-4 pt-14 pb-16 text-center" style={{ background: 'radial-gradient(circle at 50% -10%, #2a0505 0%, #150202 45%, #0a0a0c 100%)' }}>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />

        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex items-center justify-center gap-8 mb-6" style={{ perspective: 500 }}>
            <Die size={78} pips={[[50, 50]]} style={{ animation: 'casinoFloat 5s ease-in-out infinite', ['--r' as any]: '-10deg', transform: 'rotate(-10deg)' }} />
            <Die size={92} pips={[[26, 26], [74, 26], [26, 50], [74, 50], [26, 74], [74, 74]]} style={{ animation: 'casinoFloat 6s ease-in-out infinite', animationDelay: '0.4s' }} />
            <Die size={64} dark pips={[[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]]} style={{ animation: 'casinoFloat 5.5s ease-in-out infinite', animationDelay: '0.8s', ['--r' as any]: '9deg', transform: 'rotate(9deg)' }} />
          </div>

          <svg width="34" height="34" viewBox="0 0 24 24" fill="#facc15" className="mx-auto mb-2" style={{ filter: 'drop-shadow(0 2px 6px rgba(250,204,21,0.4))' }}>
            <path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8Zm2.4 12h13.2v2H5.4v-2Z" />
          </svg>

          <h1
            className="font-black text-5xl tracking-tight leading-none mb-1"
            style={{
              fontFamily: 'Oswald, -apple-system, sans-serif',
              background: 'linear-gradient(180deg, #ffffff 0%, #d8d8dc 45%, #8c8c92 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: '0 4px 24px rgba(0,0,0,0.6)',
            }}
          >
            CASINO
          </h1>
          <div className="text-red-500 font-bold text-sm tracking-[0.3em] mb-6">BET62</div>

          <p className="text-gray-300 text-sm leading-relaxed max-w-sm mx-auto">
            Estamos a preparar o Casino BET62 — slots, mesa e casino ao vivo, diretamente na sua conta.
          </p>
        </div>
      </section>

      {/* Category preview — real content, honestly labeled: nothing here is playable yet. */}
      <section className="px-4 py-10 max-w-2xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map((c) => (
            <div
              key={c.label}
              className={`rounded-xl p-5 text-center ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm border`}
            >
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{c.label}</div>
              <div className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Em breve</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
