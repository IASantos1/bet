import { useState, useEffect } from 'react';

interface BasketballStats {
  // Pontos por Quarto
  quarters: {
    q1: { home: number; away: number };
    q2: { home: number; away: number };
    q3: { home: number; away: number };
    q4: { home: number; away: number };
    ot?: { home: number; away: number };
  };
  // Estatísticas Gerais
  points: { home: number; away: number };
  rebounds: { 
    home: { offensive: number; defensive: number; total: number }; 
    away: { offensive: number; defensive: number; total: number }; 
  };
  assists: { home: number; away: number };
  steals: { home: number; away: number };
  blocks: { home: number; away: number };
  turnovers: { home: number; away: number };
  fouls: { home: number; away: number };
  // Lançamentos
  fieldGoals: { 
    home: { made: number; attempted: number; percentage: number }; 
    away: { made: number; attempted: number; percentage: number }; 
  };
  threePointers: { 
    home: { made: number; attempted: number; percentage: number }; 
    away: { made: number; attempted: number; percentage: number }; 
  };
  freeThrows: { 
    home: { made: number; attempted: number; percentage: number }; 
    away: { made: number; attempted: number; percentage: number }; 
  };
  // Extras
  fastBreakPoints: { home: number; away: number };
  pointsInPaint: { home: number; away: number };
  secondChancePoints: { home: number; away: number };
  benchPoints: { home: number; away: number };
  biggestLead: { home: number; away: number };
  timeoutsRemaining: { home: number; away: number };
}

interface LiveMatchStatsBasketballProps {
  matchId: string;
  homeTeam?: string;
  awayTeam?: string;
  currentQuarter?: number;
  homeScore?: number;
  awayScore?: number;
}

// Gerar estatísticas realistas baseadas no placar
function generateRealisticStats(homeScore: number, awayScore: number, currentQuarter: number): BasketballStats {
  // Distribuir pontos pelos quartos jogados
  const quartersPlayed = Math.min(currentQuarter, 4);
  
  const generateQuarterScore = (teamScore: number, quarter: number): number => {
    if (quarter > quartersPlayed) return 0;
    const variance = Math.random() * 0.3 - 0.15;
    const baseScore = teamScore / quartersPlayed;
    return Math.max(0, Math.round(baseScore * (1 + variance)));
  };

  // Calcular pontos por quarto
  let homeQ1 = generateQuarterScore(homeScore, 1);
  let homeQ2 = generateQuarterScore(homeScore, 2);
  let homeQ3 = generateQuarterScore(homeScore, 3);
  let homeQ4 = generateQuarterScore(homeScore, 4);
  
  let awayQ1 = generateQuarterScore(awayScore, 1);
  let awayQ2 = generateQuarterScore(awayScore, 2);
  let awayQ3 = generateQuarterScore(awayScore, 3);
  let awayQ4 = generateQuarterScore(awayScore, 4);

  // Ajustar para o total correto
  const homeQuarterTotal = homeQ1 + homeQ2 + homeQ3 + homeQ4;
  const awayQuarterTotal = awayQ1 + awayQ2 + awayQ3 + awayQ4;
  
  if (homeQuarterTotal !== homeScore && quartersPlayed > 0) {
    const diff = homeScore - homeQuarterTotal;
    if (quartersPlayed === 4) homeQ4 += diff;
    else if (quartersPlayed === 3) homeQ3 += diff;
    else if (quartersPlayed === 2) homeQ2 += diff;
    else homeQ1 += diff;
  }
  
  if (awayQuarterTotal !== awayScore && quartersPlayed > 0) {
    const diff = awayScore - awayQuarterTotal;
    if (quartersPlayed === 4) awayQ4 += diff;
    else if (quartersPlayed === 3) awayQ3 += diff;
    else if (quartersPlayed === 2) awayQ2 += diff;
    else awayQ1 += diff;
  }

  // Estatísticas baseadas nos pontos
  const homeFGM = Math.round(homeScore * 0.38);
  const awayFGM = Math.round(awayScore * 0.38);
  const homeFGA = Math.round(homeFGM / (0.42 + Math.random() * 0.1));
  const awayFGA = Math.round(awayFGM / (0.42 + Math.random() * 0.1));
  
  const home3PM = Math.round(homeScore * 0.12);
  const away3PM = Math.round(awayScore * 0.12);
  const home3PA = Math.round(home3PM / (0.32 + Math.random() * 0.1));
  const away3PA = Math.round(away3PM / (0.32 + Math.random() * 0.1));
  
  const homeFTM = Math.round(homeScore * 0.15);
  const awayFTM = Math.round(awayScore * 0.15);
  const homeFTA = Math.round(homeFTM / (0.75 + Math.random() * 0.1));
  const awayFTA = Math.round(awayFTM / (0.75 + Math.random() * 0.1));

  // Ressaltos
  const homeOffReb = Math.round(8 + Math.random() * 6);
  const homeDefReb = Math.round(25 + Math.random() * 10);
  const awayOffReb = Math.round(8 + Math.random() * 6);
  const awayDefReb = Math.round(25 + Math.random() * 10);

  return {
    quarters: {
      q1: { home: Math.max(0, homeQ1), away: Math.max(0, awayQ1) },
      q2: { home: Math.max(0, homeQ2), away: Math.max(0, awayQ2) },
      q3: { home: Math.max(0, homeQ3), away: Math.max(0, awayQ3) },
      q4: { home: Math.max(0, homeQ4), away: Math.max(0, awayQ4) },
    },
    points: { home: homeScore, away: awayScore },
    rebounds: {
      home: { offensive: homeOffReb, defensive: homeDefReb, total: homeOffReb + homeDefReb },
      away: { offensive: awayOffReb, defensive: awayDefReb, total: awayOffReb + awayDefReb },
    },
    assists: { 
      home: Math.round(18 + Math.random() * 12), 
      away: Math.round(18 + Math.random() * 12) 
    },
    steals: { 
      home: Math.round(5 + Math.random() * 6), 
      away: Math.round(5 + Math.random() * 6) 
    },
    blocks: { 
      home: Math.round(3 + Math.random() * 5), 
      away: Math.round(3 + Math.random() * 5) 
    },
    turnovers: { 
      home: Math.round(10 + Math.random() * 8), 
      away: Math.round(10 + Math.random() * 8) 
    },
    fouls: { 
      home: Math.round(15 + Math.random() * 10), 
      away: Math.round(15 + Math.random() * 10) 
    },
    fieldGoals: {
      home: { made: homeFGM, attempted: homeFGA, percentage: Math.round((homeFGM / homeFGA) * 100) || 0 },
      away: { made: awayFGM, attempted: awayFGA, percentage: Math.round((awayFGM / awayFGA) * 100) || 0 },
    },
    threePointers: {
      home: { made: home3PM, attempted: home3PA, percentage: Math.round((home3PM / home3PA) * 100) || 0 },
      away: { made: away3PM, attempted: away3PA, percentage: Math.round((away3PM / away3PA) * 100) || 0 },
    },
    freeThrows: {
      home: { made: homeFTM, attempted: homeFTA, percentage: Math.round((homeFTM / homeFTA) * 100) || 0 },
      away: { made: awayFTM, attempted: awayFTA, percentage: Math.round((awayFTM / awayFTA) * 100) || 0 },
    },
    fastBreakPoints: { 
      home: Math.round(8 + Math.random() * 12), 
      away: Math.round(8 + Math.random() * 12) 
    },
    pointsInPaint: { 
      home: Math.round(homeScore * 0.4 + Math.random() * 10), 
      away: Math.round(awayScore * 0.4 + Math.random() * 10) 
    },
    secondChancePoints: { 
      home: Math.round(6 + Math.random() * 10), 
      away: Math.round(6 + Math.random() * 10) 
    },
    benchPoints: { 
      home: Math.round(homeScore * 0.3 + Math.random() * 10), 
      away: Math.round(awayScore * 0.3 + Math.random() * 10) 
    },
    biggestLead: { 
      home: Math.round(Math.max(0, (homeScore - awayScore) + Math.random() * 8)), 
      away: Math.round(Math.max(0, (awayScore - homeScore) + Math.random() * 8)) 
    },
    timeoutsRemaining: { 
      home: Math.round(2 + Math.random() * 3), 
      away: Math.round(2 + Math.random() * 3) 
    },
  };
}

export default function LiveMatchStatsBasketball({ 
  matchId, 
  homeTeam = 'Casa',
  awayTeam = 'Fora',
  currentQuarter = 2,
  homeScore = 54,
  awayScore = 48
}: LiveMatchStatsBasketballProps) {
  const [stats, setStats] = useState<BasketballStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumo' | 'quartos' | 'lançamentos' | 'avançado'>('resumo');

  useEffect(() => {
    // ✅ Simular carregamento de estatísticas
    setLoading(true);
    setError(null);
    
    const timer = setTimeout(() => {
      try {
        const generatedStats = generateRealisticStats(homeScore, awayScore, currentQuarter);
        setStats(generatedStats);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao gerar estatísticas:', err);
        setError('Erro ao carregar estatísticas');
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [matchId, homeScore, awayScore, currentQuarter]);

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="text-center py-6">
          <i className="ri-error-warning-line text-4xl text-gray-400 mb-2"></i>
          <p className="text-sm text-gray-600 mb-3">
            {error || 'Estatísticas não disponíveis'}
          </p>
            <button
            onClick={() => {
              setLoading(true);
              setError(null);
              setTimeout(() => {
                try {
                  const generatedStats = generateRealisticStats(homeScore, awayScore, currentQuarter);
                  setStats(generatedStats);
                  setLoading(false);
                } catch {
                  setError('Erro ao carregar estatísticas');
                  setLoading(false);
                }
              }, 500);
            }}
            className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line mr-2"></i>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const StatBar = ({ 
    homeValue, 
    awayValue, 
    label, 
    homeColor = 'bg-orange-500', 
    awayColor = 'bg-blue-500',
    showPercentage: _showPercentage = false,
    suffix = ''
  }: { 
    homeValue: number; 
    awayValue: number; 
    label: string;
    homeColor?: string;
    awayColor?: string;
    showPercentage?: boolean;
    suffix?: string;
  }) => {
    const total = homeValue + awayValue || 1;
    const homePercent = (homeValue / total) * 100;
    
    return (
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-700 mb-1">
          <span className="font-semibold">{homeValue}{suffix}</span>
          <span className="text-gray-500">{label}</span>
          <span className="font-semibold">{awayValue}{suffix}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden flex">
          <div
            className={`${homeColor} transition-all duration-500`}
            style={{ width: `${homePercent}%` }}
          ></div>
          <div className={`${awayColor} flex-1`}></div>
        </div>
      </div>
    );
  };

  const ShootingStatRow = ({
    label,
    home,
    away
  }: {
    label: string;
    home: { made: number; attempted: number; percentage: number };
    away: { made: number; attempted: number; percentage: number };
  }) => (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-100 last:border-0">
      <div className="text-center">
        <span className="text-sm font-semibold text-gray-800">{home.made}/{home.attempted}</span>
        <span className="text-xs text-gray-500 ml-1">({home.percentage}%)</span>
      </div>
      <div className="text-center text-xs text-gray-600 font-medium self-center">{label}</div>
      <div className="text-center">
        <span className="text-sm font-semibold text-gray-800">{away.made}/{away.attempted}</span>
        <span className="text-xs text-gray-500 ml-1">({away.percentage}%)</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3">
        <div className="flex items-center justify-between">
          <h4 className="text-white font-semibold text-sm flex items-center gap-2">
            <i className="ri-basketball-line"></i>
            Estatísticas ao Vivo
          </h4>
          <span className="text-orange-100 text-xs">
            Q{currentQuarter} • Atualizado agora
          </span>
        </div>
      </div>

      {/* Teams Header */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="text-center">
          <span className="text-xs font-semibold text-gray-800 truncate block">{homeTeam}</span>
        </div>
        <div className="text-center">
          <span className="text-lg font-bold text-gray-900">{homeScore} - {awayScore}</span>
        </div>
        <div className="text-center">
          <span className="text-xs font-semibold text-gray-800 truncate block">{awayTeam}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {[
          { id: 'resumo', label: 'Resumo', icon: 'ri-dashboard-line' },
          { id: 'quartos', label: 'Quartos', icon: 'ri-time-line' },
          { id: 'lançamentos', label: 'Lançamentos', icon: 'ri-focus-3-line' },
          { id: 'avançado', label: 'Avançado', icon: 'ri-bar-chart-line' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2 px-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <i className={tab.icon}></i>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Resumo Tab */}
        {activeTab === 'resumo' && (
          <div className="space-y-1">
            <StatBar 
              homeValue={stats.rebounds.home.total} 
              awayValue={stats.rebounds.away.total} 
              label="Ressaltos" 
            />
            <StatBar 
              homeValue={stats.assists.home} 
              awayValue={stats.assists.away} 
              label="Assistências" 
            />
            <StatBar 
              homeValue={stats.steals.home} 
              awayValue={stats.steals.away} 
              label="Roubos de Bola" 
            />
            <StatBar 
              homeValue={stats.blocks.home} 
              awayValue={stats.blocks.away} 
              label="Bloqueios" 
            />
            <StatBar 
              homeValue={stats.turnovers.home} 
              awayValue={stats.turnovers.away} 
              label="Perdas de Bola"
              homeColor="bg-red-400"
              awayColor="bg-red-300"
            />
            <StatBar 
              homeValue={stats.fouls.home} 
              awayValue={stats.fouls.away} 
              label="Faltas"
              homeColor="bg-yellow-500"
              awayColor="bg-yellow-400"
            />
          </div>
        )}

        {/* Quartos Tab */}
        {activeTab === 'quartos' && (
          <div>
            {/* Pontos por Quarto */}
            <div className="bg-gray-50 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Equipa</th>
                    <th className="py-2 px-2 text-center font-semibold text-gray-600">Q1</th>
                    <th className="py-2 px-2 text-center font-semibold text-gray-600">Q2</th>
                    <th className="py-2 px-2 text-center font-semibold text-gray-600">Q3</th>
                    <th className="py-2 px-2 text-center font-semibold text-gray-600">Q4</th>
                    <th className="py-2 px-3 text-center font-bold text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 px-3 font-medium text-gray-800 truncate max-w-[80px]">{homeTeam}</td>
                    <td className={`py-2 px-2 text-center ${currentQuarter >= 1 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {currentQuarter >= 1 ? stats.quarters.q1.home : '-'}
                    </td>
                    <td className={`py-2 px-2 text-center ${currentQuarter >= 2 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {currentQuarter >= 2 ? stats.quarters.q2.home : '-'}
                    </td>
                    <td className={`py-2 px-2 text-center ${currentQuarter >= 3 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {currentQuarter >= 3 ? stats.quarters.q3.home : '-'}
                    </td>
                    <td className={`py-2 px-2 text-center ${currentQuarter >= 4 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {currentQuarter >= 4 ? stats.quarters.q4.home : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-orange-600">{homeScore}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium text-gray-800 truncate max-w-[80px]">{awayTeam}</td>
                    <td className={`py-2 px-2 text-center ${currentQuarter >= 1 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {currentQuarter >= 1 ? stats.quarters.q1.away : '-'}
                    </td>
                    <td className={`py-2 px-2 text-center ${currentQuarter >= 2 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {currentQuarter >= 2 ? stats.quarters.q2.away : '-'}
                    </td>
                    <td className={`py-2 px-2 text-center ${currentQuarter >= 3 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {currentQuarter >= 3 ? stats.quarters.q3.away : '-'}
                    </td>
                    <td className={`py-2 px-2 text-center ${currentQuarter >= 4 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {currentQuarter >= 4 ? stats.quarters.q4.away : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-blue-600">{awayScore}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Ressaltos Detalhados */}
            <div className="bg-orange-50 rounded-lg p-3">
              <h5 className="text-xs font-semibold text-orange-800 mb-2 flex items-center gap-1">
                <i className="ri-basketball-line"></i>
                Ressaltos Detalhados
              </h5>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className="font-bold text-gray-800">{stats.rebounds.home.offensive}</div>
                  <div className="text-gray-500">Ofensivos</div>
                </div>
                <div className="text-center border-x border-orange-200">
                  <div className="font-bold text-gray-800">{stats.rebounds.home.defensive}</div>
                  <div className="text-gray-500">Defensivos</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-orange-600">{stats.rebounds.home.total}</div>
                  <div className="text-gray-500">Total</div>
                </div>
              </div>
              <div className="border-t border-orange-200 mt-2 pt-2">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-bold text-gray-800">{stats.rebounds.away.offensive}</div>
                  </div>
                  <div className="text-center border-x border-orange-200">
                    <div className="font-bold text-gray-800">{stats.rebounds.away.defensive}</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-blue-600">{stats.rebounds.away.total}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lançamentos Tab */}
        {activeTab === 'lançamentos' && (
          <div className="bg-gray-50 rounded-lg p-3">
            <ShootingStatRow 
              label="Field Goals" 
              home={stats.fieldGoals.home} 
              away={stats.fieldGoals.away} 
            />
            <ShootingStatRow 
              label="3 Pontos" 
              home={stats.threePointers.home} 
              away={stats.threePointers.away} 
            />
            <ShootingStatRow 
              label="Lances Livres" 
              home={stats.freeThrows.home} 
              away={stats.freeThrows.away} 
            />

            {/* Visual de Percentagens */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.fieldGoals.home.percentage}%</div>
                <div className="text-xs text-gray-500">FG% Casa</div>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${stats.fieldGoals.home.percentage}%` }}
                  ></div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.fieldGoals.away.percentage}%</div>
                <div className="text-xs text-gray-500">FG% Fora</div>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${stats.fieldGoals.away.percentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Avançado Tab */}
        {activeTab === 'avançado' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3">
                <div className="text-xs text-orange-600 font-medium mb-1">Pontos no Garrafão</div>
                <div className="flex justify-between items-end">
                  <span className="text-xl font-bold text-gray-800">{stats.pointsInPaint.home}</span>
                  <span className="text-sm text-gray-500">vs {stats.pointsInPaint.away}</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                <div className="text-xs text-blue-600 font-medium mb-1">Contra-Ataques</div>
                <div className="flex justify-between items-end">
                  <span className="text-xl font-bold text-gray-800">{stats.fastBreakPoints.home}</span>
                  <span className="text-sm text-gray-500">vs {stats.fastBreakPoints.away}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                <div className="text-xs text-green-600 font-medium mb-1">2ª Oportunidade</div>
                <div className="flex justify-between items-end">
                  <span className="text-xl font-bold text-gray-800">{stats.secondChancePoints.home}</span>
                  <span className="text-sm text-gray-500">vs {stats.secondChancePoints.away}</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
                <div className="text-xs text-purple-600 font-medium mb-1">Pontos do Banco</div>
                <div className="flex justify-between items-end">
                  <span className="text-xl font-bold text-gray-800">{stats.benchPoints.home}</span>
                  <span className="text-sm text-gray-500">vs {stats.benchPoints.away}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <div className="text-lg font-bold text-orange-600">+{stats.biggestLead.home}</div>
                  <div className="text-xs text-gray-500">Maior Vantagem</div>
                </div>
                <div className="w-px h-10 bg-gray-300"></div>
                <div className="text-center flex-1">
                  <div className="text-lg font-bold text-blue-600">+{stats.biggestLead.away}</div>
                  <div className="text-xs text-gray-500">Maior Vantagem</div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center bg-yellow-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <i className="ri-timer-line text-yellow-600"></i>
                <span className="text-xs font-medium text-gray-700">Timeouts Restantes</span>
              </div>
              <div className="flex gap-4">
                <span className="text-sm font-bold text-orange-600">{stats.timeoutsRemaining.home}</span>
                <span className="text-gray-400">|</span>
                <span className="text-sm font-bold text-blue-600">{stats.timeoutsRemaining.away}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { LiveMatchStatsBasketball };
