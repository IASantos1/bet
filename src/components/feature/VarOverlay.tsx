
import { useState, useEffect, useCallback } from 'react';

interface VarOverlayProps {
  matchId: string;
  compact?: boolean;
}

export const VarOverlay = ({ matchId, compact = false }: VarOverlayProps) => {
  const [isLocked, setIsLocked] = useState(false);
  const [reason, setReason] = useState<string>('');
  const [duration, setDuration] = useState(0);
  const [isEntering, setIsEntering] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const handleLock = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail.matchId === matchId) {
        setIsExiting(false);
        setIsLocked(true);
        setReason(customEvent.detail.reason || 'Revisão VAR em curso');
        setDuration(0);
        setTimeout(() => setIsEntering(true), 50);

        interval = setInterval(() => {
          setDuration(prev => prev + 1);
        }, 1000);
      }
    };

    const handleUnlock = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail.matchId === matchId) {
        setIsExiting(true);
        setIsEntering(false);
        if (interval) clearInterval(interval);
        setTimeout(() => {
          setIsLocked(false);
          setReason('');
          setDuration(0);
          setIsExiting(false);
        }, 600);
      }
    };

    window.addEventListener('market-locked', handleLock);
    window.addEventListener('market-unlocked', handleUnlock);

    return () => {
      window.removeEventListener('market-locked', handleLock);
      window.removeEventListener('market-unlocked', handleUnlock);
      if (interval) clearInterval(interval);
    };
  }, [matchId]);

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  if (!isLocked) return null;

  const isVAR = reason.toLowerCase().includes('var');
  const isGoal = reason.toLowerCase().includes('gol');

  // ── Versão compacta (para MatchCard na homepage) ──
  if (compact) {
    return (
      <div
        className={`absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-xl transition-all duration-500 ${
          isEntering ? 'opacity-100' : isExiting ? 'opacity-0' : 'opacity-0'
        }`}
      >
        {/* Fundo escuro com blur */}
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

        {/* Gradiente animado */}
        <div className={`absolute inset-0 ${isVAR ? 'bg-gradient-to-br from-amber-600/20 via-transparent to-amber-600/20' : 'bg-gradient-to-br from-red-600/20 via-transparent to-red-600/20'} animate-pulse`} />

        {/* Borda pulsante */}
        <div className={`absolute inset-0 rounded-xl border-2 ${isVAR ? 'border-amber-500/50' : 'border-red-500/50'} animate-pulse`} />

        {/* Linhas de scan */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
            style={{ animation: 'varScanLine 2s linear infinite' }}
          />
        </div>

        {/* Conteúdo central */}
        <div className="relative flex flex-col items-center gap-1.5 px-3 py-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isVAR ? 'bg-amber-500/30 ring-2 ring-amber-400/50' : 'bg-red-500/30 ring-2 ring-red-400/50'}`}>
            <div className="relative">
              <i className={`${isVAR ? 'ri-video-line' : isGoal ? 'ri-football-line' : 'ri-lock-line'} text-xl text-white`}></i>
              <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 ${isVAR ? 'bg-amber-400' : 'bg-red-400'} rounded-full animate-ping`} />
            </div>
          </div>

          <div className="text-center">
            <div className={`text-[10px] font-black tracking-[0.2em] uppercase ${isVAR ? 'text-amber-400' : 'text-red-400'}`}>
              {isVAR ? 'VAR EM CURSO' : isGoal ? 'GOLO!' : 'SUSPENSO'}
            </div>
            <div className="text-[8px] text-white/60 font-medium mt-0.5">
              Apostas suspensas
            </div>
          </div>

          {/* Timer */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${isVAR ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
            <i className="ri-time-line text-white/70 text-[9px]"></i>
            <span className="text-white font-mono text-[10px] font-bold">{formatDuration(duration)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Versão completa (para a secção de mercados na página de detalhes) ──
  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-xl transition-all duration-500 ${
        isEntering ? 'opacity-100 scale-100' : isExiting ? 'opacity-0 scale-95' : 'opacity-0 scale-95'
      }`}
    >
      {/* Fundo escuro com blur forte */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-lg" />

      {/* Gradiente animado de fundo */}
      <div className={`absolute inset-0 ${isVAR ? 'bg-gradient-to-br from-amber-900/30 via-black/0 to-amber-900/30' : 'bg-gradient-to-br from-red-900/30 via-black/0 to-red-900/30'}`} />

      {/* Padrão de linhas diagonais */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 12px)',
        }}
      />

      {/* Borda animada */}
      <div className={`absolute inset-0 rounded-xl border-2 ${isVAR ? 'border-amber-500/40' : 'border-red-500/40'} animate-pulse`} />

      {/* Cantos decorativos */}
      {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
        <div key={i} className={`absolute ${pos} w-6 h-6`}>
          <div className={`absolute ${pos.includes('top') ? 'top-2' : 'bottom-2'} ${pos.includes('left') ? 'left-2' : 'right-2'} w-3 h-3 ${
            pos.includes('top') ? 'border-t-2' : 'border-b-2'
          } ${pos.includes('left') ? 'border-l-2' : 'border-r-2'} ${isVAR ? 'border-amber-400/60' : 'border-red-400/60'}`} />
        </div>
      ))}

      {/* Linha de scan animada */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute left-0 right-0 h-[1px] ${isVAR ? 'bg-gradient-to-r from-transparent via-amber-400/40 to-transparent' : 'bg-gradient-to-r from-transparent via-red-400/40 to-transparent'}`}
          style={{ animation: 'varScanLine 3s linear infinite' }}
        />
      </div>

      {/* Conteúdo central */}
      <div className="relative flex flex-col items-center gap-4 px-6 py-8 max-w-sm">
        {/* Badge superior */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${isVAR ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
          <span className={`w-2 h-2 rounded-full ${isVAR ? 'bg-amber-400' : 'bg-red-400'} animate-ping`} />
          <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isVAR ? 'text-amber-400' : 'text-red-400'}`}>
            Em direto
          </span>
        </div>

        {/* Ícone principal com anéis */}
        <div className="relative">
          {/* Anel exterior */}
          <div className={`absolute -inset-4 rounded-full border ${isVAR ? 'border-amber-500/20' : 'border-red-500/20'} animate-ping`} style={{ animationDuration: '2s' }} />
          {/* Anel médio */}
          <div className={`absolute -inset-2 rounded-full border ${isVAR ? 'border-amber-500/30' : 'border-red-500/30'} animate-pulse`} />
          {/* Ícone */}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
            isVAR
              ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30'
              : 'bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/30'
          }`}>
            <i className={`${isVAR ? 'ri-video-line' : isGoal ? 'ri-football-line' : 'ri-lock-line'} text-4xl text-white drop-shadow-lg`}></i>
          </div>
          {/* Indicador de gravação */}
          <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${isVAR ? 'bg-amber-500' : 'bg-red-500'}`}>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          </div>
        </div>

        {/* Título */}
        <div className="text-center">
          <h3 className="text-2xl font-black text-white tracking-wide mb-1">
            {isVAR ? 'VAR EM CURSO' : isGoal ? 'GOLO DETETADO' : 'MERCADO SUSPENSO'}
          </h3>
          <p className="text-white/60 text-sm font-medium">
            {reason}
          </p>
        </div>

        {/* Timer */}
        <div className={`flex items-center gap-3 px-5 py-2.5 rounded-xl ${
          isVAR ? 'bg-amber-500/15 border border-amber-500/25' : 'bg-red-500/15 border border-red-500/25'
        }`}>
          <i className={`ri-time-line text-lg ${isVAR ? 'text-amber-400' : 'text-red-400'}`}></i>
          <span className="text-white font-mono text-2xl font-black tracking-wider">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Mensagem de suspensão */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10">
          <i className="ri-lock-2-line text-white/50 text-sm"></i>
          <span className="text-white/50 text-xs font-semibold">
            Apostas temporariamente suspensas
          </span>
        </div>

        {/* Barra de progresso */}
        <div className="w-full max-w-[200px] h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isVAR ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
            style={{
              width: `${Math.min(100, (duration / 180) * 100)}%`,
              transition: 'width 1s linear',
            }}
          />
        </div>
      </div>
    </div>
  );
};
