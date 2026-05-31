import React from 'react';
import type { Match } from '../../types/sports';

interface LiveMatchStatsCompactProps {
  match: Match;
}

const LiveMatchStatsCompact: React.FC<LiveMatchStatsCompactProps> = ({ match }) => {
  // Função para obter status formatado sem cronómetro ao vivo
  const getStatusDisplay = () => {
    if (!match.status) return 'Ao Vivo';
    
    const status = match.status.toLowerCase();
    
    // Futebol
    if (status.includes('1h') || status.includes('first half')) return '1º Tempo';
    if (status.includes('2h') || status.includes('second half')) return '2º Tempo';
    if (status.includes('ht') || status.includes('halftime')) return 'Intervalo';
    
    // Basquetebol
    if (status.includes('q1') || status.includes('1st quarter')) return '1º Período';
    if (status.includes('q2') || status.includes('2nd quarter')) return '2º Período';
    if (status.includes('q3') || status.includes('3rd quarter')) return '3º Período';
    if (status.includes('q4') || status.includes('4th quarter')) return '4º Período';
    
    // Basebol
    if (status.includes('inning')) {
      const inningMatch = status.match(/(\d+)/);
      if (inningMatch) return `${inningMatch[1]}ª Entrada`;
    }
    
    // Hóquei
    if (status.includes('p1') || status.includes('1st period')) return '1º Período';
    if (status.includes('p2') || status.includes('2nd period')) return '2º Período';
    if (status.includes('p3') || status.includes('3rd period')) return '3º Período';
    
    return 'Ao Vivo';
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
        <span className="text-xs font-medium text-red-700">
          {getStatusDisplay()}
        </span>
      </div>
      
      {(match.homeScore !== undefined && match.awayScore !== undefined) && (
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <span>{match.homeScore}</span>
          <span className="text-gray-400">-</span>
          <span>{match.awayScore}</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(LiveMatchStatsCompact);
