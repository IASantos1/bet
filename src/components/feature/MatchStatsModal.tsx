
import { useState, useEffect, useCallback } from 'react';
import {
  fetchLiveStatistics,
  fetchH2H,
  fetchLeagueStandings,
  fetchTeamForm,
  findFixtureId,
  type LiveStatistics,
  type H2HData,
  type LeagueStandings,
  type TeamForm
} from '../../services/realStatsApi';

interface MatchStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: {
    id: number | string;
    homeTeam: string;
    awayTeam: string;
    homeScore?: number;
    awayScore?: number;
    league: string;
    sport: string;
    time?: string;
    status?: string;
    fixtureId?: number;
  } | null;
}

export default function MatchStatsModal({ isOpen, onClose, match }: MatchStatsModalProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'results' | 'standings'>('live');
  const [liveStats, setLiveStats] = useState<LiveStatistics | null>(null);
  const [h2hData, setH2HData] = useState<H2HData | null>(null);
  const [standings, setStandings] = useState<LeagueStandings | null>(null);
  const [homeForm, setHomeForm] = useState<TeamForm | null>(null);
  const [awayForm, setAwayForm] = useState<TeamForm | null>(null);
  const [loading, setLoading] = useState<{ live: boolean; h2h: boolean; standings: boolean; form: boolean }>({
    live: false,
    h2h: false,
    standings: false,
    form: false
  });
  const [errors, setErrors] = useState<{ live: string | null; h2h: string | null; standings: string | null }>({
    live: null,
    h2h: null,
    standings: null
  });
  const [fixtureId, setFixtureId] = useState<number | null>(null);

  // Buscar fixture ID
  const loadFixtureId = useCallback(async () => {
    if (!match) return;
    
    // Se já temos o fixtureId do match, usar
    if (match.fixtureId) {
      setFixtureId(match.fixtureId);
      return;
    }

    // Extrair ID numérico se existir
    const idStr = String(match.id);
    if (idStr.startsWith('api1-')) {
      const num = parseInt(idStr.replace('api1-', ''), 10);
      if (!isNaN(num)) {
        setFixtureId(num);
        return;
      }
    }

    // Buscar fixture ID pela API
    const id = await findFixtureId(match.homeTeam, match.awayTeam);
    if (id) {
      setFixtureId(id);
    }
  }, [match]);

  // Carregar estatísticas ao vivo
  const loadLiveStats = useCallback(async () => {
    if (!fixtureId) return;
    
    setLoading(prev => ({ ...prev, live: true }));
    setErrors(prev => ({ ...prev, live: null }));
    
    try {
      const stats = await fetchLiveStatistics(fixtureId);
      setLiveStats(stats);
      if (!stats) {
        setErrors(prev => ({ ...prev, live: 'Estatísticas não disponíveis' }));
      }
    } catch {
      setErrors(prev => ({ ...prev, live: 'Erro ao carregar estatísticas' }));
    } finally {
      setLoading(prev => ({ ...prev, live: false }));
    }
  }, [fixtureId]);

  // Carregar H2H
  const loadH2H = useCallback(async () => {
    if (!match) return;
    
    setLoading(prev => ({ ...prev, h2h: true }));
    setErrors(prev => ({ ...prev, h2h: null }));
    
    try {
      const [h2h, homeFormData, awayFormData] = await Promise.all([
        fetchH2H(match.homeTeam, match.awayTeam),
        fetchTeamForm(match.homeTeam, 5),
        fetchTeamForm(match.awayTeam, 5)
      ]);
      
      setH2HData(h2h);
      setHomeForm(homeFormData);
      setAwayForm(awayFormData);
      
      if (!h2h) {
        setErrors(prev => ({ ...prev, h2h: 'Confrontos diretos não disponíveis' }));
      }
    } catch {
      setErrors(prev => ({ ...prev, h2h: 'Erro ao carregar confrontos' }));
    } finally {
      setLoading(prev => ({ ...prev, h2h: false }));
    }
  }, [match]);

  // Carregar classificação
  const loadStandings = useCallback(async () => {
    if (!match) return;
    
    setLoading(prev => ({ ...prev, standings: true }));
    setErrors(prev => ({ ...prev, standings: null }));
    
    try {
      const standingsData = await fetchLeagueStandings(match.league);
      setStandings(standingsData);
      
      if (!standingsData) {
        setErrors(prev => ({ ...prev, standings: 'Classificação não disponível' }));
      }
    } catch {
      setErrors(prev => ({ ...prev, standings: 'Erro ao carregar classificação' }));
    } finally {
      setLoading(prev => ({ ...prev, standings: false }));
    }
  }, [match]);

  // Efeitos
  useEffect(() => {
    if (isOpen && match) {
      loadFixtureId();
    }
  }, [isOpen, match, loadFixtureId]);

  useEffect(() => {
    if (isOpen && fixtureId && activeTab === 'live') {
      loadLiveStats();
    }
  }, [isOpen, fixtureId, activeTab, loadLiveStats]);

  useEffect(() => {
    if (isOpen && match && activeTab === 'results' && !h2hData) {
      loadH2H();
    }
  }, [isOpen, match, activeTab, h2hData, loadH2H]);

  useEffect(() => {
    if (isOpen && match && activeTab === 'standings' && !standings) {
      loadStandings();
    }
  }, [isOpen, match, activeTab, standings, loadStandings]);

  // Auto-refresh para estatísticas ao vivo
  useEffect(() => {
    if (!isOpen || activeTab !== 'live' || !fixtureId) return;
    
    const interval = setInterval(() => {
      loadLiveStats();
    }, 30000); // 30 segundos
    
    return () => clearInterval(interval);
  }, [isOpen, activeTab, fixtureId, loadLiveStats]);

  // Reset ao fechar
  useEffect(() => {
    if (!isOpen) {
      setLiveStats(null);
      setH2HData(null);
      setStandings(null);
      setHomeForm(null);
      setAwayForm(null);
      setFixtureId(null);
      setErrors({ live: null, h2h: null, standings: null });
    }
  }, [isOpen]);

  if (!isOpen || !match) return null;

  const isLive = match.status === 'AO VIVO' || match.homeScore !== undefined;

  // Componente de barra de progresso
  const StatBar = ({ 
    label, 
    homeValue, 
    awayValue, 
    homeColor = 'bg-amber-500', 
    awayColor = 'bg-red-500',
    showPercentage = false 
  }: { 
    label: string; 
    homeValue: number; 
    awayValue: number; 
    homeColor?: string; 
    awayColor?: string;
    showPercentage?: boolean;
  }) => {
    const total = homeValue + awayValue || 1;
    const homePercent = (homeValue / total) * 100;
    const awayPercent = (awayValue / total) * 100;

    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-white font-semibold text-sm">{showPercentage ? `${homeValue}%` : homeValue}</span>
          <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">{label}</span>
          <span className="text-white font-semibold text-sm">{showPercentage ? `${awayValue}%` : awayValue}</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-gray-700/50 gap-0.5">
          <div 
            className={`${homeColor} transition-all duration-500 rounded-l-full`} 
            style={{ width: `${homePercent}%` }}
          ></div>
          <div 
            className={`${awayColor} transition-all duration-500 rounded-r-full`} 
            style={{ width: `${awayPercent}%` }}
          ></div>
        </div>
      </div>
    );
  };

  // Loading component
  const LoadingSpinner = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-12">
      <i className="ri-loader-4-line text-4xl text-amber-500 animate-spin mb-3"></i>
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  );

  // Error component
  const ErrorMessage = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
    <div className="flex flex-col items-center justify-center py-12">
      <i className="ri-error-warning-line text-4xl text-gray-600 mb-3"></i>
      <p className="text-gray-400 text-sm mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg cursor-pointer whitespace-nowrap transition-colors"
      >
        <i className="ri-refresh-line mr-1"></i>
        Tentar novamente
      </button>
    </div>
  );

  // Renderizar estatísticas ao vivo
  const renderLiveStats = () => {
    if (loading.live && !liveStats) {
      return <LoadingSpinner message="A carregar estatísticas..." />;
    }

    if (errors.live && !liveStats) {
      return <ErrorMessage message={errors.live} onRetry={loadLiveStats} />;
    }

    if (!liveStats) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <i className="ri-bar-chart-box-line text-4xl text-gray-600 mb-3"></i>
          <p className="text-gray-400 text-sm">Estatísticas não disponíveis</p>
          <p className="text-gray-500 text-xs mt-1">As estatísticas aparecem após o início do jogo</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Indicador de dados reais */}
        <div className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <i className="ri-check-double-line text-emerald-400"></i>
          <span className="text-xs text-emerald-300">Dados reais da <strong>API-Football</strong></span>
          {loading.live && <i className="ri-loader-4-line text-emerald-400 animate-spin ml-2"></i>}
        </div>

        {/* Gráfico de Posse de Bola */}
        <div className="bg-[#252542] rounded-xl p-4">
          <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
            <i className="ri-pie-chart-line"></i>
            Posse de Bola
          </h3>
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle cx="48" cy="48" r="40" stroke="#374151" strokeWidth="8" fill="none" />
                  <circle 
                    cx="48" cy="48" r="40" 
                    stroke="#f59e0b" 
                    strokeWidth="8" 
                    fill="none"
                    strokeDasharray={`${liveStats.possession.home * 2.51} 251`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-amber-400">{liveStats.possession.home}%</span>
                </div>
              </div>
              <p className="text-white text-xs mt-2 font-medium truncate max-w-[100px]">{match.homeTeam}</p>
            </div>
            <div className="text-gray-500 text-2xl font-light">vs</div>
            <div className="text-center">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle cx="48" cy="48" r="40" stroke="#374151" strokeWidth="8" fill="none" />
                  <circle 
                    cx="48" cy="48" r="40" 
                    stroke="#ef4444" 
                    strokeWidth="8" 
                    fill="none"
                    strokeDasharray={`${liveStats.possession.away * 2.51} 251`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-red-400">{liveStats.possession.away}%</span>
                </div>
              </div>
              <p className="text-white text-xs mt-2 font-medium truncate max-w-[100px]">{match.awayTeam}</p>
            </div>
          </div>
        </div>

        {/* Ataques */}
        {(liveStats.dangerousAttacks.home > 0 || liveStats.dangerousAttacks.away > 0 || liveStats.attacks.home > 0) && (
          <div className="bg-[#252542] rounded-xl p-4">
            <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
              <i className="ri-sword-line"></i>
              Ataques
            </h3>
            {(liveStats.dangerousAttacks.home > 0 || liveStats.dangerousAttacks.away > 0) && (
              <StatBar label="Ataques Perigosos" homeValue={liveStats.dangerousAttacks.home} awayValue={liveStats.dangerousAttacks.away} homeColor="bg-red-500" awayColor="bg-red-700" />
            )}
            <StatBar label="Ataques" homeValue={liveStats.attacks.home} awayValue={liveStats.attacks.away} />
          </div>
        )}

        {/* Remates */}
        <div className="bg-[#252542] rounded-xl p-4">
          <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
            <i className="ri-focus-3-line"></i>
            Remates
          </h3>
          <StatBar label="Remates Totais" homeValue={liveStats.totalShots.home} awayValue={liveStats.totalShots.away} />
          <StatBar label="Remates à Baliza" homeValue={liveStats.shotsOnTarget.home} awayValue={liveStats.shotsOnTarget.away} homeColor="bg-green-500" awayColor="bg-green-700" />
          <StatBar label="Remates para Fora" homeValue={liveStats.shotsOffTarget.home} awayValue={liveStats.shotsOffTarget.away} homeColor="bg-gray-500" awayColor="bg-gray-600" />
          {(liveStats.blockedShots.home > 0 || liveStats.blockedShots.away > 0) && (
            <StatBar label="Remates Bloqueados" homeValue={liveStats.blockedShots.home} awayValue={liveStats.blockedShots.away} homeColor="bg-purple-500" awayColor="bg-purple-700" />
          )}
          <StatBar label="Defesas" homeValue={liveStats.saves.home} awayValue={liveStats.saves.away} homeColor="bg-blue-500" awayColor="bg-blue-700" />
        </div>

        {/* Passes */}
        {(liveStats.passes.home > 0 || liveStats.passes.away > 0) && (
          <div className="bg-[#252542] rounded-xl p-4">
            <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
              <i className="ri-arrow-right-line"></i>
              Passes
            </h3>
            <StatBar label="Passes Totais" homeValue={liveStats.passes.home} awayValue={liveStats.passes.away} />
            <StatBar label="Precisão de Passe" homeValue={liveStats.passAccuracy.home} awayValue={liveStats.passAccuracy.away} showPercentage homeColor="bg-teal-500" awayColor="bg-teal-700" />
          </div>
        )}

        {/* Outras Estatísticas */}
        <div className="bg-[#252542] rounded-xl p-4">
          <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
            <i className="ri-bar-chart-grouped-line"></i>
            Outras Estatísticas
          </h3>
          <StatBar label="Cantos" homeValue={liveStats.corners.home} awayValue={liveStats.corners.away} homeColor="bg-purple-500" awayColor="bg-purple-700" />
          <StatBar label="Faltas" homeValue={liveStats.fouls.home} awayValue={liveStats.fouls.away} homeColor="bg-orange-500" awayColor="bg-orange-700" />
          <StatBar label="Foras de Jogo" homeValue={liveStats.offsides.home} awayValue={liveStats.offsides.away} />
        </div>

        {/* Cartões */}
        <div className="bg-[#252542] rounded-xl p-4">
          <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
            <i className="ri-rectangle-line"></i>
            Disciplina
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between bg-[#1a1a2e] rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-5 bg-yellow-400 rounded-sm"></div>
                <span className="text-gray-400 text-xs">Amarelos</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-bold">{liveStats.yellowCards.home}</span>
                <span className="text-gray-500">-</span>
                <span className="text-white font-bold">{liveStats.yellowCards.away}</span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-[#1a1a2e] rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-5 bg-red-500 rounded-sm"></div>
                <span className="text-gray-400 text-xs">Vermelhos</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-bold">{liveStats.redCards.home}</span>
                <span className="text-gray-500">-</span>
                <span className="text-white font-bold">{liveStats.redCards.away}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Renderizar resultados e H2H
  const renderResults = () => {
    if (loading.h2h && !h2hData) {
      return <LoadingSpinner message="A carregar confrontos diretos..." />;
    }

    if (errors.h2h && !h2hData) {
      return <ErrorMessage message={errors.h2h} onRetry={loadH2H} />;
    }

    return (
      <div className="space-y-6">
        {/* Indicador de dados reais */}
        {h2hData && (
          <div className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <i className="ri-check-double-line text-emerald-400"></i>
            <span className="text-xs text-emerald-300">Dados reais da <strong>API-Football</strong></span>
          </div>
        )}

        {/* Probabilidade de Vitória */}
        {h2hData && (
          <div className="bg-[#252542] rounded-xl p-4">
            <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
              <i className="ri-percent-line"></i>
              Probabilidade de Vitória (baseada no H2H)
            </h3>
            <div className="flex items-center justify-between mb-3">
              <div className="text-center flex-1">
                <div className="text-3xl font-bold text-amber-400">{h2hData.winProbability.home}%</div>
                <p className="text-xs text-gray-400 mt-1 truncate">{match.homeTeam}</p>
              </div>
              <div className="text-center px-4">
                <div className="text-2xl font-bold text-gray-400">{h2hData.winProbability.draw}%</div>
                <p className="text-xs text-gray-500 mt-1">Empate</p>
              </div>
              <div className="text-center flex-1">
                <div className="text-3xl font-bold text-red-400">{h2hData.winProbability.away}%</div>
                <p className="text-xs text-gray-400 mt-1 truncate">{match.awayTeam}</p>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden">
              <div className="bg-amber-500 transition-all" style={{ width: `${h2hData.winProbability.home}%` }}></div>
              <div className="bg-gray-500 transition-all" style={{ width: `${h2hData.winProbability.draw}%` }}></div>
              <div className="bg-red-500 transition-all" style={{ width: `${h2hData.winProbability.away}%` }}></div>
            </div>
          </div>
        )}

        {/* Forma Recente */}
        {(homeForm || awayForm) && (
          <div className="bg-[#252542] rounded-xl p-4">
            <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
              <i className="ri-run-line"></i>
              Forma Recente (Últimos 5 jogos)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {homeForm && (
                <div className="bg-[#1a1a2e] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-3">
                    {homeForm.teamLogo && <img src={homeForm.teamLogo} alt="" className="w-5 h-5 object-contain" />}
                    <span className="text-white text-xs font-medium truncate">{match.homeTeam}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    {homeForm.form.map((result, i) => (
                      <span 
                        key={i} 
                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold
                          ${result === 'W' ? 'bg-green-500 text-white' : 
                            result === 'D' ? 'bg-gray-500 text-white' : 'bg-red-500 text-white'}`}
                      >
                        {result === 'W' ? 'V' : result === 'D' ? 'E' : 'D'}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span className="text-green-400">{homeForm.wins}V</span>
                    <span>{homeForm.draws}E</span>
                    <span className="text-red-400">{homeForm.losses}D</span>
                    <span>|</span>
                    <span>{homeForm.goalsScored}GM</span>
                    <span>{homeForm.goalsConceded}GS</span>
                  </div>
                </div>
              )}
              {awayForm && (
                <div className="bg-[#1a1a2e] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-3">
                    {awayForm.teamLogo && <img src={awayForm.teamLogo} alt="" className="w-5 h-5 object-contain" />}
                    <span className="text-white text-xs font-medium truncate">{match.awayTeam}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    {awayForm.form.map((result, i) => (
                      <span 
                        key={i} 
                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold
                          ${result === 'W' ? 'bg-green-500 text-white' : 
                            result === 'D' ? 'bg-gray-500 text-white' : 'bg-red-500 text-white'}`}
                      >
                        {result === 'W' ? 'V' : result === 'D' ? 'E' : 'D'}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span className="text-green-400">{awayForm.wins}V</span>
                    <span>{awayForm.draws}E</span>
                    <span className="text-red-400">{awayForm.losses}D</span>
                    <span>|</span>
                    <span>{awayForm.goalsScored}GM</span>
                    <span>{awayForm.goalsConceded}GS</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Histórico H2H */}
        {h2hData && (
          <div className="bg-[#252542] rounded-xl p-4">
            <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
              <i className="ri-history-line"></i>
              Confrontos Diretos (H2H)
            </h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#1a1a2e] rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{h2hData.homeWins}</div>
                <p className="text-[10px] text-gray-400 mt-1 truncate">{match.homeTeam}</p>
              </div>
              <div className="bg-[#1a1a2e] rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-400">{h2hData.draws}</div>
                <p className="text-[10px] text-gray-400 mt-1">Empates</p>
              </div>
              <div className="bg-[#1a1a2e] rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-400">{h2hData.awayWins}</div>
                <p className="text-[10px] text-gray-400 mt-1 truncate">{match.awayTeam}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 text-xs text-gray-400 border-t border-gray-700 pt-3">
              <span><strong className="text-white">{h2hData.totalMatches}</strong> jogos</span>
              <span>•</span>
              <span><strong className="text-amber-400">{h2hData.homeGoals}</strong> golos {match.homeTeam.split(' ')[0]}</span>
              <span>•</span>
              <span><strong className="text-red-400">{h2hData.awayGoals}</strong> golos {match.awayTeam.split(' ')[0]}</span>
            </div>
          </div>
        )}

        {/* Últimos Confrontos */}
        {h2hData && h2hData.recentMatches.length > 0 && (
          <div className="bg-[#252542] rounded-xl p-4">
            <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
              <i className="ri-calendar-event-line"></i>
              Últimos Confrontos
            </h3>
            <div className="space-y-2">
              {h2hData.recentMatches.map((game, index) => {
                const homeWon = game.homeScore > game.awayScore;
                const awayWon = game.awayScore > game.homeScore;
                const isDraw = game.homeScore === game.awayScore;
                
                return (
                  <div key={index} className="bg-[#1a1a2e] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-500">{game.date}</span>
                      <span className="text-[10px] text-amber-400/70">{game.competition}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        {game.homeTeamLogo && <img src={game.homeTeamLogo} alt="" className="w-4 h-4 object-contain" />}
                        <span className={`text-sm font-medium truncate ${homeWon ? 'text-green-400' : 'text-white'}`}>
                          {game.homeTeam}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-3">
                        <span className={`text-lg font-bold ${homeWon ? 'text-green-400' : isDraw ? 'text-gray-400' : 'text-white'}`}>
                          {game.homeScore}
                        </span>
                        <span className="text-gray-500">-</span>
                        <span className={`text-lg font-bold ${awayWon ? 'text-green-400' : isDraw ? 'text-gray-400' : 'text-white'}`}>
                          {game.awayScore}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-1 justify-end">
                        <span className={`text-sm font-medium truncate text-right ${awayWon ? 'text-green-400' : 'text-white'}`}>
                          {game.awayTeam}
                        </span>
                        {game.awayTeamLogo && <img src={game.awayTeamLogo} alt="" className="w-4 h-4 object-contain" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!h2hData && !loading.h2h && (
          <div className="flex flex-col items-center justify-center py-12">
            <i className="ri-sword-line text-4xl text-gray-600 mb-3"></i>
            <p className="text-gray-400 text-sm">Confrontos diretos não disponíveis</p>
          </div>
        )}
      </div>
    );
  };

  // Renderizar classificação
  const renderStandings = () => {
    if (loading.standings && !standings) {
      return <LoadingSpinner message="A carregar classificação..." />;
    }

    if (errors.standings && !standings) {
      return <ErrorMessage message={errors.standings} onRetry={loadStandings} />;
    }

    if (!standings) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <i className="ri-trophy-line text-4xl text-gray-600 mb-3"></i>
          <p className="text-gray-400 text-sm">Classificação não disponível</p>
        </div>
      );
    }

    const homeTeamPosition = standings.standings.find(t => 
      t.team.toLowerCase().includes(match.homeTeam.toLowerCase()) ||
      match.homeTeam.toLowerCase().includes(t.team.toLowerCase())
    );
    const awayTeamPosition = standings.standings.find(t => 
      t.team.toLowerCase().includes(match.awayTeam.toLowerCase()) ||
      match.awayTeam.toLowerCase().includes(t.team.toLowerCase())
    );

    return (
      <div className="space-y-4">
        {/* Indicador de dados reais */}
        <div className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <i className="ri-check-double-line text-emerald-400"></i>
          <span className="text-xs text-emerald-300">Dados reais da <strong>API-Football</strong></span>
        </div>

        {/* Posições das Equipas */}
        <div className="bg-[#252542] rounded-xl p-4">
          <h3 className="text-amber-400 font-bold text-sm mb-4 flex items-center gap-2">
            <i className="ri-medal-line"></i>
            Posição na Tabela
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {homeTeamPosition && (
              <div className="bg-[#1a1a2e] rounded-lg p-4 text-center">
                {homeTeamPosition.teamLogo && (
                  <img src={homeTeamPosition.teamLogo} alt="" className="w-10 h-10 object-contain mx-auto mb-2" />
                )}
                <div className="text-4xl font-bold text-amber-400 mb-1">{homeTeamPosition.position}º</div>
                <p className="text-xs text-white font-medium truncate">{match.homeTeam}</p>
                <p className="text-[10px] text-gray-400 mt-1">{homeTeamPosition.points} pts</p>
              </div>
            )}
            {awayTeamPosition && (
              <div className="bg-[#1a1a2e] rounded-lg p-4 text-center">
                {awayTeamPosition.teamLogo && (
                  <img src={awayTeamPosition.teamLogo} alt="" className="w-10 h-10 object-contain mx-auto mb-2" />
                )}
                <div className="text-4xl font-bold text-red-400 mb-1">{awayTeamPosition.position}º</div>
                <p className="text-xs text-white font-medium truncate">{match.awayTeam}</p>
                <p className="text-[10px] text-gray-400 mt-1">{awayTeamPosition.points} pts</p>
              </div>
            )}
          </div>
        </div>

        {/* Tabela Classificativa */}
        <div className="bg-[#252542] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-3">
            {standings.leagueLogo && (
              <img src={standings.leagueLogo} alt="" className="w-6 h-6 object-contain" />
            )}
            <div>
              <h3 className="text-amber-400 font-bold text-sm">{standings.leagueName}</h3>
              <p className="text-[10px] text-gray-500">{standings.country} • Época {standings.season}/{standings.season + 1}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#1a1a2e]">
                <tr className="text-gray-400">
                  <th className="py-2 px-2 text-left">#</th>
                  <th className="py-2 px-2 text-left">Equipa</th>
                  <th className="py-2 px-1 text-center">J</th>
                  <th className="py-2 px-1 text-center">V</th>
                  <th className="py-2 px-1 text-center">E</th>
                  <th className="py-2 px-1 text-center">D</th>
                  <th className="py-2 px-1 text-center">GM</th>
                  <th className="py-2 px-1 text-center">GS</th>
                  <th className="py-2 px-1 text-center">DG</th>
                  <th className="py-2 px-2 text-center">Pts</th>
                  <th className="py-2 px-2 text-center hidden sm:table-cell">Forma</th>
                </tr>
              </thead>
              <tbody>
                {standings.standings.slice(0, 12).map((team) => {
                  const isHomeTeam = team.team.toLowerCase().includes(match.homeTeam.toLowerCase()) ||
                                    match.homeTeam.toLowerCase().includes(team.team.toLowerCase());
                  const isAwayTeam = team.team.toLowerCase().includes(match.awayTeam.toLowerCase()) ||
                                    match.awayTeam.toLowerCase().includes(team.team.toLowerCase());
                  const isHighlighted = isHomeTeam || isAwayTeam;
                  
                  return (
                    <tr 
                      key={team.position} 
                      className={`
                        border-b border-gray-800/50 transition-colors
                        ${isHighlighted ? 'bg-amber-500/10' : 'hover:bg-gray-800/30'}
                      `}
                    >
                      <td className="py-2 px-2">
                        <span className={`
                          w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                          ${team.position <= 4 ? 'bg-green-500/20 text-green-400' : 
                            team.position <= 6 ? 'bg-blue-500/20 text-blue-400' : 
                            team.position >= standings.standings.length - 2 ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-300'}
                        `}>
                          {team.position}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {team.teamLogo && (
                            <img src={team.teamLogo} alt="" className="w-4 h-4 object-contain" />
                          )}
                          <span className={`
                            font-medium truncate max-w-[100px]
                            ${isHomeTeam ? 'text-amber-400' : isAwayTeam ? 'text-red-400' : 'text-white'}
                          `}>
                            {team.team}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center text-gray-400">{team.played}</td>
                      <td className="py-2 px-1 text-center text-green-400">{team.won}</td>
                      <td className="py-2 px-1 text-center text-gray-400">{team.drawn}</td>
                      <td className="py-2 px-1 text-center text-red-400">{team.lost}</td>
                      <td className="py-2 px-1 text-center text-gray-300">{team.goalsFor}</td>
                      <td className="py-2 px-1 text-center text-gray-300">{team.goalsAgainst}</td>
                      <td className="py-2 px-1 text-center">
                        <span className={team.goalDifference > 0 ? 'text-green-400' : team.goalDifference < 0 ? 'text-red-400' : 'text-gray-400'}>
                          {team.goalDifference > 0 ? '+' : ''}{team.goalDifference}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="font-bold text-white">{team.points}</span>
                      </td>
                      <td className="py-2 px-2 hidden sm:table-cell">
                        <div className="flex items-center justify-center gap-0.5">
                          {team.form.slice(0, 5).map((result, i) => (
                            <span 
                              key={i} 
                              className={`
                                w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold
                                ${result === 'W' ? 'bg-green-500 text-white' : 
                                  result === 'D' ? 'bg-gray-500 text-white' : 'bg-red-500 text-white'}
                              `}
                            >
                              {result === 'W' ? 'V' : result === 'D' ? 'E' : 'D'}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-[#1a1a2e] flex items-center justify-center gap-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span> Champions League</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-full"></span> Europa League</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full"></span> Despromoção</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 sm:p-4 md:p-8" onClick={onClose}>
      <div 
        className="bg-[#1a1a2e] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl rounded-xl overflow-hidden shadow-2xl border border-amber-500/20 flex flex-col"
        style={{ maxHeight: 'calc(100vh - 40px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 shrink-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <i className="ri-bar-chart-2-line text-white text-xl"></i>
              <span className="text-white font-bold">Estatísticas</span>
              {fixtureId && (
                <span className="text-white/60 text-xs bg-black/20 px-2 py-0.5 rounded">
                  ID: {fixtureId}
                </span>
              )}
            </div>
            <button 
              onClick={onClose} 
              className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white transition-colors bg-black/20 rounded-lg hover:bg-black/30 cursor-pointer"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
          
          {/* Match Info */}
          <div className="px-4 pb-4">
            <div className="text-[10px] text-white/70 mb-2">{match.league}</div>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-white font-bold text-lg truncate">{match.homeTeam}</div>
                <div className="text-white/80 text-sm">vs {match.awayTeam}</div>
              </div>
              {isLive && (
                <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-lg">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-white font-bold text-2xl">{match.homeScore ?? 0}</span>
                  <span className="text-white/60">-</span>
                  <span className="text-white font-bold text-2xl">{match.awayScore ?? 0}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-[#1a1a2e] shrink-0">
          <button
            onClick={() => setActiveTab('live')}
            className={`
              flex-1 py-3 px-4 text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2
              ${activeTab === 'live' 
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}
            `}
          >
            <i className="ri-bar-chart-box-line"></i>
            <span className="hidden sm:inline">ESTATÍSTICAS</span>
            <span className="sm:hidden">STATS</span>
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`
              flex-1 py-3 px-4 text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2
              ${activeTab === 'results' 
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}
            `}
          >
            <i className="ri-history-line"></i>
            <span>RESULTADO</span>
          </button>
          <button
            onClick={() => setActiveTab('standings')}
            className={`
              flex-1 py-3 px-4 text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2
              ${activeTab === 'standings' 
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}
            `}
          >
            <i className="ri-trophy-line"></i>
            <span className="hidden sm:inline">CLASSIFICAÇÕES</span>
            <span className="sm:hidden">TABELA</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#252542 transparent' }}>
          {activeTab === 'live' && renderLiveStats()}
          {activeTab === 'results' && renderResults()}
          {activeTab === 'standings' && renderStandings()}
        </div>
      </div>
    </div>
  );
}
