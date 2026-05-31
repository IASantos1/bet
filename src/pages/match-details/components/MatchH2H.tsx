
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { 
  detectSportType,
  type SportType,
  type H2HData,
  type H2HMatch
} from '../../../services/multiSportStatsApi';
import { fetchH2H, fetchTeamForm } from '../../../services/realStatsApi';

interface MatchH2HProps {
  match: any;
}

interface FormMatch {
  opponent: string;
  opponentLogo?: string;
  result: 'W' | 'D' | 'L';
  score: string;
  date: string;
  isHome: boolean;
  competition?: string;
}

// Gerar dados mock de H2H
const generateMockH2H = (match: any): H2HData => {
  const competitions = [match.league, 'Taça', 'Champions League', 'Liga Europa'];
  const matches: H2HMatch[] = [];
  
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  
  for (let i = 0; i < 6; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - (i * 3 + Math.floor(Math.random() * 3)));
    
    const homeScore = Math.floor(Math.random() * 4);
    const awayScore = Math.floor(Math.random() * 4);
    const isHomeFirst = Math.random() > 0.5;
    
    if (homeScore > awayScore) {
      if (isHomeFirst) homeWins++;
      else awayWins++;
    } else if (awayScore > homeScore) {
      if (isHomeFirst) awayWins++;
      else homeWins++;
    } else {
      draws++;
    }
    
    matches.push({
      date: date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      competition: competitions[Math.floor(Math.random() * competitions.length)],
      homeTeam: isHomeFirst ? match.homeTeam : match.awayTeam,
      awayTeam: isHomeFirst ? match.awayTeam : match.homeTeam,
      homeScore,
      awayScore
    });
  }
  
  return {
    totalMatches: matches.length,
    homeWins,
    awayWins,
    draws,
    recentMatches: matches.sort((a, b) => 
      new Date(b.date.split('/').reverse().join('-')).getTime() - 
      new Date(a.date.split('/').reverse().join('-')).getTime()
    )
  };
};

// Gerar forma recente mock
const generateMockForm = (_teamName: string): FormMatch[] => {
  const opponents = ['Equipa A', 'Equipa B', 'Equipa C', 'Equipa D', 'Equipa E'];
  const form: FormMatch[] = [];
  
  for (let i = 0; i < 5; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (i * 7 + Math.floor(Math.random() * 5)));
    
    const teamScore = Math.floor(Math.random() * 4);
    const oppScore = Math.floor(Math.random() * 4);
    const matchIsHome = Math.random() > 0.5;
    
    let result: 'W' | 'D' | 'L';
    if (teamScore > oppScore) result = 'W';
    else if (teamScore < oppScore) result = 'L';
    else result = 'D';
    
    form.push({
      opponent: opponents[i],
      result,
      score: matchIsHome ? `${teamScore}-${oppScore}` : `${oppScore}-${teamScore}`,
      date: date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }),
      isHome: matchIsHome
    });
  }
  
  return form;
};

export default function MatchH2H({ match }: MatchH2HProps) {
  const { theme } = useTheme();
  const [h2hData, setH2hData] = useState<H2HData | null>(null);
  const [homeForm, setHomeForm] = useState<FormMatch[]>([]);
  const [awayForm, setAwayForm] = useState<FormMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'api' | 'mock'>('mock');
  const [_sportType, setSportType] = useState<SportType>('football');

  // Buscar dados reais da API
  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const sport = detectSportType(match);
      setSportType(sport);
      console.log(`⚔️ Buscando H2H: ${match.homeTeam} vs ${match.awayTeam} (${sport})`);

      // Tentar buscar H2H real da API
      const apiH2H = await fetchH2H(match.homeTeam, match.awayTeam);
      
      if (apiH2H && apiH2H.totalMatches > 0) {
        console.log(`✅ H2H real carregado: ${apiH2H.totalMatches} jogos`);
        setH2hData({
          totalMatches: apiH2H.totalMatches,
          homeWins: apiH2H.homeWins,
          awayWins: apiH2H.awayWins,
          draws: apiH2H.draws,
          recentMatches: apiH2H.recentMatches
        });
        setDataSource('api');
      } else {
        console.log('⚠️ H2H não disponível na API, usando mock');
        setH2hData(generateMockH2H(match));
        setDataSource('mock');
      }

      // Buscar forma recente das equipas
      const [homeFormData, awayFormData] = await Promise.all([
        fetchTeamForm(match.homeTeam, 5),
        fetchTeamForm(match.awayTeam, 5)
      ]);

      if (homeFormData && homeFormData.recentMatches.length > 0) {
        setHomeForm(homeFormData.recentMatches.map(m => ({
          opponent: m.opponent,
          opponentLogo: m.opponentLogo,
          result: m.result,
          score: m.isHome ? `${m.scored}-${m.conceded}` : `${m.conceded}-${m.scored}`,
          date: m.date,
          isHome: m.isHome,
          competition: m.competition
        })));
      } else {
        setHomeForm(generateMockForm(match.homeTeam));
      }

      if (awayFormData && awayFormData.recentMatches.length > 0) {
        setAwayForm(awayFormData.recentMatches.map(m => ({
          opponent: m.opponent,
          opponentLogo: m.opponentLogo,
          result: m.result,
          score: m.isHome ? `${m.scored}-${m.conceded}` : `${m.conceded}-${m.scored}`,
          date: m.date,
          isHome: m.isHome,
          competition: m.competition
        })));
      } else {
        setAwayForm(generateMockForm(match.awayTeam));
      }

    } catch (err) {
      console.error('❌ Erro ao buscar H2H:', err);
      setH2hData(generateMockH2H(match));
      setHomeForm(generateMockForm(match.homeTeam));
      setAwayForm(generateMockForm(match.awayTeam));
      setDataSource('mock');
    } finally {
      setLoading(false);
    }
  }, [match]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getResultColor = (result: 'W' | 'D' | 'L') => {
    switch (result) {
      case 'W': return 'bg-green-500';
      case 'D': return 'bg-amber-500';
      case 'L': return 'bg-red-500';
    }
  };

  const getFormFromMatches = (matches: FormMatch[]): ('W' | 'D' | 'L')[] => {
    return matches.slice(0, 5).map(m => m.result);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className={`flex items-center justify-center p-8 rounded-xl ${theme === 'dark' ? 'bg-gray-900/70' : 'bg-white'}`}>
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              A carregar confrontos...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!h2hData) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`flex items-center justify-between p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-900/70 border border-gray-800/50' : 'bg-white border border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${theme === 'dark' ? 'bg-cyan-500/10' : 'bg-cyan-50'}`}>
            <i className="ri-sword-line text-cyan-500 text-lg"></i>
          </div>
          <div>
            <h3 className={`font-bold text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Confrontos Diretos</h3>
            <p className={`text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
              {dataSource === 'api' ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Dados reais via API-Football
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                  Dados estimados
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${
            theme === 'dark' ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
          }`}
          title="Atualizar dados"
        >
          <i className="ri-refresh-line text-sm"></i>
        </button>
      </div>

      {/* H2H Summary */}
      <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-900/50 border border-gray-800/50' : 'bg-white border border-gray-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-center flex-1">
            <div className={`text-2xl font-black ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`}>{h2hData.homeWins}</div>
            <div className={`text-[10px] font-medium truncate px-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{match.homeTeam}</div>
          </div>
          <div className="text-center px-4">
            <div className={`text-2xl font-black ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>{h2hData.draws}</div>
            <div className={`text-[10px] font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Empates</div>
          </div>
          <div className="text-center flex-1">
            <div className={`text-2xl font-black ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>{h2hData.awayWins}</div>
            <div className={`text-[10px] font-medium truncate px-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{match.awayTeam}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className={`h-3 rounded-full overflow-hidden flex ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}`}>
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(h2hData.homeWins / h2hData.totalMatches) * 100}%` }}></div>
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${(h2hData.draws / h2hData.totalMatches) * 100}%` }}></div>
          <div className="h-full bg-red-500 transition-all" style={{ width: `${(h2hData.awayWins / h2hData.totalMatches) * 100}%` }}></div>
        </div>

        <p className={`text-center text-[10px] mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
          {h2hData.totalMatches} jogos analisados
        </p>
      </div>

      {/* H2H Matches List */}
      <div className={`rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-900/50 border border-gray-800/50' : 'bg-white border border-gray-200'}`}>
        <div className={`px-4 py-3 border-b ${theme === 'dark' ? 'border-gray-800/50' : 'border-gray-100'}`}>
          <h4 className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Histórico de Jogos</h4>
        </div>
        <div className={`divide-y ${theme === 'dark' ? 'divide-gray-800/30' : 'divide-gray-100'}`}>
          {h2hData.recentMatches.map((m, index) => {
            const isHomeWin = m.homeScore > m.awayScore;
            const isAwayWin = m.awayScore > m.homeScore;
            
            return (
              <div key={index} className={`px-4 py-3 ${theme === 'dark' ? 'hover:bg-gray-800/30' : 'hover:bg-gray-50'} transition-colors`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                    {m.date}
                  </span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                    {m.competition}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {m.homeTeamLogo && (
                      <img src={m.homeTeamLogo} alt="" className="w-5 h-5 object-contain" />
                    )}
                    <span className={`text-xs font-medium truncate ${
                      isHomeWin 
                        ? theme === 'dark' ? 'text-white' : 'text-gray-900'
                        : theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {m.homeTeam}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 flex-shrink-0">
                    <span className={`text-sm font-black ${isHomeWin ? 'text-green-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{m.homeScore}</span>
                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>-</span>
                    <span className={`text-sm font-black ${isAwayWin ? 'text-green-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{m.awayScore}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <span className={`text-xs font-medium truncate text-right ${
                      isAwayWin 
                        ? theme === 'dark' ? 'text-white' : 'text-gray-900'
                        : theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {m.awayTeam}
                    </span>
                    {m.awayTeamLogo && (
                      <img src={m.awayTeamLogo} alt="" className="w-5 h-5 object-contain" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Home Team Form */}
        <div className={`rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-900/50 border border-gray-800/50' : 'bg-white border border-gray-200'}`}>
          <div className={`px-4 py-3 border-b ${theme === 'dark' ? 'border-gray-800/50' : 'border-gray-100'}`}>
            <h4 className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Forma - {match.homeTeam}</h4>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {getFormFromMatches(homeForm).map((result, i) => (
                <div 
                  key={i}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${getResultColor(result)}`}
                >
                  {result}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {homeForm.slice(0, 3).map((f, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className={`text-[9px] px-1 py-0.5 rounded ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {f.isHome ? 'C' : 'F'}
                    </span>
                    {f.opponentLogo && (
                      <img src={f.opponentLogo} alt="" className="w-4 h-4 object-contain" />
                    )}
                    <span className={`text-[10px] truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {f.opponent}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold ${
                    f.result === 'W' ? 'text-green-500' : f.result === 'L' ? 'text-red-500' : 'text-amber-500'
                  }`}>
                    {f.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Away Team Form */}
        <div className={`rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-900/50 border border-gray-800/50' : 'bg-white border border-gray-200'}`}>
          <div className={`px-4 py-3 border-b ${theme === 'dark' ? 'border-gray-800/50' : 'border-gray-100'}`}>
            <h4 className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Forma - {match.awayTeam}</h4>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {getFormFromMatches(awayForm).map((result, i) => (
                <div 
                  key={i}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${getResultColor(result)}`}
                >
                  {result}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {awayForm.slice(0, 3).map((f, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className={`text-[9px] px-1 py-0.5 rounded ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {f.isHome ? 'C' : 'F'}
                    </span>
                    {f.opponentLogo && (
                      <img src={f.opponentLogo} alt="" className="w-4 h-4 object-contain" />
                    )}
                    <span className={`text-[10px] truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {f.opponent}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold ${
                    f.result === 'W' ? 'text-green-500' : f.result === 'L' ? 'text-red-500' : 'text-amber-500'
                  }`}>
                    {f.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Data Source Info */}
      <div className={`p-4 rounded-xl ${
        dataSource === 'api' 
          ? theme === 'dark' ? 'bg-green-500/5 border border-green-500/20' : 'bg-green-50 border border-green-200'
          : theme === 'dark' ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
      }`}>
        <div className="flex items-start gap-2">
          <i className={`ri-information-line text-sm ${
            dataSource === 'api'
              ? theme === 'dark' ? 'text-green-400' : 'text-green-600'
              : theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
          }`}></i>
          <p className={`text-[11px] ${
            dataSource === 'api'
              ? theme === 'dark' ? 'text-green-400/80' : 'text-green-700'
              : theme === 'dark' ? 'text-amber-400/80' : 'text-amber-700'
          }`}>
            {dataSource === 'api' 
              ? 'Dados de confrontos diretos e forma recente obtidos da API-Football. Inclui jogos oficiais de todas as competições.'
              : 'Dados baseados em análise histórica. Os confrontos reais podem variar.'
            }
          </p>
        </div>
      </div>
    </div>
  );
}
