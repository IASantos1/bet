import { useState, useEffect, useRef } from 'react';
import type { MatchIncident } from '../../hooks/useMatchIncidents';

interface OddsBlockedOverlayProps {
  incident: MatchIncident;
  compact?: boolean;
}

/**
 * ✅ NOVO: Overlay comprido que cobre os 3 botões de odds
 * Mostra: GRANDE OPORTUNIDADE | REVISÃO VAR | JOGO PARADO
 */
export default function OddsBlockedOverlay({
  incident,
  compact = false,
}: OddsBlockedOverlayProps) {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!incident) {
      return;
    }

    requestAnimationFrame(() => setIsVisible(true));

    const start = typeof incident.startedAt === 'number' ? incident.startedAt : Date.now();
    const duration = typeof incident.duration === 'number' && incident.duration > 0 ? incident.duration : 1;

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [incident]);

  if (!incident) {
    return null;
  }

  // ✅ Determinar tipo de bloqueio e mensagem
  const getBlockMessage = () => {
    if (incident.type === 'VAR') return 'REVISÃO VAR';
    if (incident.type === 'goal_chance') return 'GRANDE OPORTUNIDADE';
    if (incident.type === 'penalty') return 'PENÁLTI';
    if (incident.type === 'red_card') return 'CARTÃO VERMELHO';
    if (incident.type === 'yellow_card') return 'FALTA GRAVE';
    return 'JOGO PARADO';
  };

  const getBlockIcon = () => {
    if (incident.type === 'VAR') return 'ri-video-line';
    if (incident.type === 'goal_chance') return 'ri-football-line';
    if (incident.type === 'penalty') return 'ri-focus-3-line';
    if (incident.type === 'red_card') return 'ri-file-forbid-line';
    return 'ri-pause-circle-line';
  };

  const blockMessage = getBlockMessage();
  const blockIcon = getBlockIcon();
  const isHighPriority = ['VAR', 'goal_chance', 'penalty'].includes(incident.type);

  // ✅ VERSÃO COMPACTA: Overlay comprido cobrindo os 3 botões
  if (compact) {
    return (
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center rounded-lg overflow-hidden transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Fundo escuro com blur */}
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />

        {/* Gradiente pulsante */}
        <div className={`absolute inset-0 bg-gradient-to-r ${incident.color} ${isHighPriority ? 'opacity-40 animate-pulse' : 'opacity-20 animate-pulse'}`} />

        {/* Borda pulsante para alta prioridade */}
        {isHighPriority && (
          <div className={`absolute inset-0 border-2 rounded-lg animate-pulse border-amber-400/60`} />
        )}

        {/* ✅ NOVO: Conteúdo horizontal - mensagem comprida */}
        <div className="relative flex items-center justify-center gap-2 px-4">
          {/* Ícone */}
          <div className={`w-7 h-7 flex items-center justify-center rounded-full bg-gradient-to-r ${incident.color} ${isHighPriority ? 'animate-bounce shadow-lg' : 'animate-pulse'}`}>
            <i className={`${blockIcon} text-white text-sm`} />
          </div>
          
          {/* Mensagem */}
          <span className={`text-xs font-black text-white uppercase tracking-wider whitespace-nowrap ${isHighPriority ? 'animate-pulse' : ''}`}>
            {blockMessage}
          </span>
        </div>

        {/* Barra de progresso */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
          <div
            className={`h-full bg-gradient-to-r ${incident.color} transition-all duration-100 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // ✅ VERSÃO COMPLETA (para página de detalhes)
  return (
    <div
      className={`absolute inset-0 z-10 flex items-center justify-center rounded-xl overflow-hidden transition-all duration-500 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
    >
      {/* Fundo escuro com blur */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      {/* Gradiente pulsante */}
      <div className={`absolute inset-0 bg-gradient-to-r ${incident.color} ${isHighPriority ? 'opacity-25 animate-pulse' : 'opacity-15 animate-pulse'}`} />

      {/* Borda animada */}
      <div
        className={`absolute inset-0 border-2 rounded-xl ${isHighPriority ? 'animate-pulse border-white/40' : 'animate-pulse border-white/20'}`}
      />

      {/* Conteúdo central */}
      <div className="relative flex flex-col items-center gap-2 px-4 py-3">
        {/* Ícone com bounce */}
        <div className={`w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-r ${incident.color} shadow-lg ${isHighPriority ? 'animate-bounce' : 'animate-pulse'}`}>
          <i className={`${blockIcon} text-white text-2xl`} />
        </div>

        {/* Labels */}
        <div className="text-center">
          <span className={`text-sm font-bold text-white uppercase tracking-wider block ${isHighPriority ? 'animate-pulse' : ''}`}>
            {blockMessage}
          </span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Odds suspensas temporariamente</span>
        </div>

        {/* Indicador de mercado bloqueado */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${isHighPriority ? 'bg-red-600/40 border-red-500/60 animate-pulse' : 'bg-red-600/30 border-red-500/40'}`}>
          <i className="ri-lock-line text-red-400 text-sm" />
          <span className="text-[11px] font-semibold text-red-300 uppercase">Mercado Suspenso</span>
        </div>

        {/* Barra de progresso */}
        <div className="w-36 h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
          <div
            className={`h-full bg-gradient-to-r ${incident.color} rounded-full transition-all duration-100 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
