import { useEffect, useState } from 'react'

export function Bet62Intro() {
  const alreadySeen = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('bet62_intro_seen') === '1';
  const [phase, setPhase] = useState<'in' | 'hold' | 'out' | 'done'>(alreadySeen ? 'done' : 'in')

  useEffect(() => {
    if (alreadySeen) return;
    const t1 = setTimeout(() => setPhase('hold'), 300)
    const t2 = setTimeout(() => setPhase('out'), 900)
    const t3 = setTimeout(() => { setPhase('done'); sessionStorage.setItem('bet62_intro_seen', '1'); }, 1300)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  if (phase === 'done') return null

  const visible = phase !== 'out'
  const entered = phase === 'hold' || phase === 'out'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#C8102E',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.65s cubic-bezier(0.4,0,0.2,1)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'all' : 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          transform: entered ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.92)',
          opacity: entered ? 1 : 0,
          transition: 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
        }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'absolute',
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              animation: 'bet62-ping 1.4s ease-out infinite',
            }}
          />
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            }}
          >
            <span
              style={{
                fontSize: '28px',
                fontWeight: 900,
                color: '#C8102E',
                letterSpacing: '-1px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              B62
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '42px',
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '-1.5px',
              lineHeight: 1,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              textShadow: '0 2px 16px rgba(0,0,0,0.2)',
            }}
          >
            BET<span style={{ color: '#FFD700' }}>62</span>
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'rgba(255,255,255,0.75)',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              marginTop: '4px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            Apostas Desportivas
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.6)',
                animation: `bet62-bounce 1s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes bet62-ping {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes bet62-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
