
/**
 * 🎯 Página de Demonstração do Complete Sportsbook Engine
 *
 * Mostra o motor unificado em ação:
 * - Transição automática PRE_MATCH → LIVE
 * - Margem dinâmica
 * - Impacto de volume (pré-jogo)
 * - Pressão ofensiva (ao vivo)
 * - Histórico de movimentação
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { useTheme } from '../../contexts/ThemeContext';
import { useCompleteSportsbookEngine } from '../../hooks/useCompleteSportsbookEngine';
import type { MatchState } from '../../services/engine/completeSportsbookEngine';

export default function EngineDemo() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  // Estado inicial do jogo (começa 5h30m antes do início)
  const [matchState, setMatchState] = useState<MatchState>({
    matchId: 'DEMO_MATCH_001',
    startTime: Date.now() + 5 * 60 * 60 * 1000 + 30 * 60 * 1000, // 5h30m
    homeRating: 1820,
    awayRating: 1750,
    homeScore: 0,
    awayScore: 0,
    homePressure: 0.5,
    awayPressure: 0.5,
    totalMatchedHome: 50000, // €50k apostado na casa
    totalMatchedAway: 30000, // €30k apostado fora
    currentMinute: 0,
  });

  const {
    odds,
    mode,
    margin,
    overround,
    minutesToStart,
    currentMinute,
    isRunning,
    updateState,
    getOddsChange,
  } = useCompleteSportsbookEngine(matchState, { autoStart: true });

  // Simulação de eventos
  const simulateGoal = (team: 'home' | 'away') => {
    setMatchState(prev => ({
      ...prev,
      homeScore: team === 'home' ? prev.homeScore + 1 : prev.homeScore,
      awayScore: team === 'away' ? prev.awayScore + 1 : prev.awayScore,
    }));
  };

  const simulatePressure = (team: 'home' | 'away', value: number) => {
    setMatchState(prev => ({
      ...prev,
      homePressure: team === 'home' ? value : prev.homePressure,
      awayPressure: team === 'away' ? value : prev.awayPressure,
    }));
  };

  const simulateVolume = (team: 'home' | 'away', amount: number) => {
    setMatchState(prev => ({
      ...prev,
      totalMatchedHome: team === 'home' ? prev.totalMatchedHome + amount : prev.totalMatchedHome,
      totalMatchedAway: team === 'away' ? prev.totalMatchedAway + amount : prev.totalMatchedAway,
    }));
  };

  const skipToKickoff = () => {
    setMatchState(prev => ({
      ...prev,
      startTime: Date.now() - 1000, // Começou há 1 segundo
      currentMinute: 1,
    }));
  };

  const advanceTime = (minutes: number) => {
    setMatchState(prev => ({
      ...prev,
      currentMinute: (prev.currentMinute || 0) + minutes,
    }));
  };

  // Atualizar engine quando o estado muda
  useEffect(() => {
    updateState(matchState);
  }, [matchState, updateState]);

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getChangeIcon = (market: 'home' | 'draw' | 'away') => {
    const change = getOddsChange(market);
    if (change === 'up') return '↑';
    if (change === 'down') return '↓';
    return '→';
  };

  const getChangeColor = (market: 'home' | 'draw' | 'away') => {
    const change = getOddsChange(market);
    if (change === 'up') return 'text-green-500';
    if (change === 'down') return 'text-red-500';
    return 'text-gray-500';
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-100'}`}>
      <Header activeTab="sports" onSportsClick={() => {}} onLiveClick={() => {}} />

      <main className="pt-16 pb-8 px-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className={`flex items-center gap-2 px-4 py-2 ${
              theme === 'dark'
                ? 'bg-gray-800 hover:bg-gray-700 text-white'
                : 'bg-white hover:bg-gray-50 text-gray-700'
            } rounded-lg cursor-pointer transition-colors mb-4`}
          >
            <i className="ri-arrow-left-line"></i>
            Voltar
          </button>

          <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>
            🎯 Complete Sportsbook Engine
          </h1>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Motor unificado de odds pré-jogo e ao vivo com transição automática
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Estado do Jogo */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status Card */}
            <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        mode === 'LIVE'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {mode === 'LIVE' ? '🔴 AO VIVO' : '⏰ PRÉ-JOGO'}
                    </span>
                    {isRunning && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                        ✅ Motor Ativo
                      </span>
                    )}
                  </div>
                  <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Benfica vs Porto
                  </h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {mode === 'PRE_MATCH' && minutesToStart !== undefined && `Início em ${formatTime(minutesToStart)}`}
                    {mode === 'LIVE' && `${currentMinute || 0}'`}
                  </p>
                </div>

                {mode === 'LIVE' && (
                  <div className="text-center">
                    <div className={`text-5xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {matchState.homeScore} - {matchState.awayScore}
                    </div>
                  </div>
                )}
              </div>

              {/* Odds Display */}
              <div className="grid grid-cols-3 gap-4">
                {(['home', 'draw', 'away'] as const).map((market, idx) => (
                  <div
                    key={market}
                    className={`${
                      theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                    } border rounded-lg p-4 text-center`}
                  >
                    <div className={`text-xs font-semibold mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {idx === 0 ? 'Casa' : idx === 1 ? 'Empate' : 'Fora'}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {odds?.[market]?.toFixed(2) || '-.--'}
                      </span>
                      <span className={`text-2xl font-bold ${getChangeColor(market)}`}>
                        {getChangeIcon(market)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Métricas */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className={`${theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-100'} rounded-lg p-4`}>
                  <div className={`text-xs font-semibold mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    Margem da Casa
                  </div>
                  <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>
                    {(margin * 100).toFixed(1)}%
                  </div>
                </div>

                <div className={`${theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-100'} rounded-lg p-4`}>
                  <div className={`text-xs font-semibold mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    Overround
                  </div>
                  <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
                    {overround.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Controles de Simulação */}
            <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
              <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>
                🎮 Controles de Simulação
              </h3>

              {mode === 'PRE_MATCH' && (
                <div className="space-y-4">
                  <div>
                    <label className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2 block`}>
                      Volume de Apostas
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => simulateVolume('home', 10000)}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        +€10k Casa
                      </button>
                      <button
                        onClick={() => simulateVolume('away', 10000)}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        +€10k Fora
                      </button>
                    </div>
                    <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-2`}>
                      Casa: €{(matchState.totalMatchedHome / 1000).toFixed(0)}k | Fora: €{(matchState.totalMatchedAway / 1000).toFixed(0)}k
                    </div>
                  </div>

                  <button
                    onClick={skipToKickoff}
                    className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors"
                  >
                    ⚡ Saltar para Início do Jogo
                  </button>
                </div>
              )}

              {mode === 'LIVE' && (
                <div className="space-y-4">
                  <div>
                    <label className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2 block`}>
                      Golos
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => simulateGoal('home')}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        ⚽ Golo Casa
                      </button>
                      <button
                        onClick={() => simulateGoal('away')}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        ⚽ Golo Fora
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2 block`}>
                      Pressão Ofensiva
                    </label>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Casa</span>
                          <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                            {(matchState.homePressure * 100).toFixed(0)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={matchState.homePressure}
                          onChange={e => simulatePressure('home', parseFloat(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Fora</span>
                          <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                            {(matchState.awayPressure * 100).toFixed(0)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={matchState.awayPressure}
                          onChange={e => simulatePressure('away', parseFloat(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2 block`}>
                      Tempo
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => advanceTime(5)}
                        className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        +5 min
                      </button>
                      <button
                        onClick={() => advanceTime(15)}
                        className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        +15 min
                      </button>
                      <button
                        onClick={() => advanceTime(30)}
                        className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        +30 min
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Coluna 2: Informações */}
          <div className="space-y-6">
            {/* Como Funciona */}
            <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
              <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>
                ℹ️ Como Funciona
              </h3>
              <div className={`space-y-3 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <div>
                  <div className="font-semibold mb-1">PRÉ-JOGO</div>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Margem diminui ao aproximar-se do jogo</li>
                    <li>Volume de apostas move as odds</li>
                    <li>Rating das equipas define base</li>
                    <li>Atualização mais frequente perto do início</li>
                  </ul>
                </div>

                <div>
                  <div className="font-semibold mb-1">AO VIVO</div>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Placar atual tem grande impacto</li>
                    <li>Pressão ofensiva ajusta probabilidades</li>
                    <li>Tempo restante aumenta peso do placar</li>
                    <li>Margem aumenta nos últimos 10 minutos</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Configuração Atual */}
            <div className={`${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
              <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>
                ⚙️ Configuração
              </h3>
              <div className={`space-y-2 text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <div className="flex justify-between">
                  <span>Modo:</span>
                  <span className="font-semibold">{mode || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Margem:</span>
                  <span className="font-semibold">{(margin * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Rating Casa:</span>
                  <span className="font-semibold">{matchState.homeRating}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rating Fora:</span>
                  <span className="font-semibold">{matchState.awayRating}</span>
                </div>
                {mode === 'LIVE' && (
                  <>
                    <div className="flex justify-between">
                      <span>Pressão Casa:</span>
                      <span className="font-semibold">{(matchState.homePressure * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pressão Fora:</span>
                      <span className="font-semibold">{(matchState.awayPressure * 100).toFixed(0)}%</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
