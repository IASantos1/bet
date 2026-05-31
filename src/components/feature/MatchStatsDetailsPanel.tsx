
/**
 * Painel de Estatísticas Detalhadas do Jogo
 * Mostra estatísticas reais da API-Football, escalações, eventos, H2H e Forma Recente
 */

import { useState, useEffect } from 'react';
import {
  useMatchStatistics,
  type TeamLineup,
  type MatchEvent,
  type HeadToHeadSummary,
  type HeadToHeadMatch,
  type TeamRecentForm,
  type RecentFormData,
} from '../../hooks/useMatchStatistics';
import { useProfile } from '../../hooks/useProfile';

interface MatchStatsDetailsPanelProps {
  matchId: string | number;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  isOpen: boolean;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ═══════════════════════════════════════════════════════════

const StatBar = ({
  label,
  homeValue,
  awayValue,
  icon,
  showPercentage = false,
  highlight = false,
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  icon: string;
  showPercentage?: boolean;
  highlight?: boolean;
}) => {
  const total = homeValue + awayValue;
  const homePercent = total > 0 ? (homeValue / total) * 100 : 50;

  return (
    <div className={`py-2.5 ${highlight ? 'bg-amber-500/10 rounded-lg px-3 -mx-3' : ''}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-bold text-white w-12 text-left">
          {showPercentage ? `${homeValue}%` : homeValue}
        </span>
        <div className="flex items-center gap-2 text-gray-400">
          <i className={`${icon} text-sm`}></i>
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className="text-sm font-bold text-white w-12 text-right">
          {showPercentage ? `${awayValue}%` : awayValue}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-700/50">
        <div
          className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${homePercent}%` }}
        />
        <div
          className="bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500"
          style={{ width: `${100 - homePercent}%` }}
        />
      </div>
    </div>
  );
};

const CardDisplay = ({
  homeYellow,
  awayYellow,
  homeRed,
  awayRed,
}: {
  homeYellow: number;
  awayYellow: number;
  homeRed: number;
  awayRed: number;
}) => (
  <div className="py-3">
    <div className="flex items-center justify-center gap-2 text-gray-400 mb-3">
      <i className="ri-rectangle-fill text-yellow-400 text-sm"></i>
      <span className="text-xs font-medium">Cartões</span>
      <i className="ri-rectangle-fill text-red-500 text-sm"></i>
    </div>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-5 bg-yellow-400 rounded-sm shadow-sm"></div>
          <span className="text-sm font-bold text-white">{homeYellow}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-5 bg-red-500 rounded-sm shadow-sm"></div>
          <span className="text-sm font-bold text-white">{homeRed}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-white">{awayYellow}</span>
          <div className="w-4 h-5 bg-yellow-400 rounded-sm shadow-sm"></div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-white">{awayRed}</span>
          <div className="w-4 h-5 bg-red-500 rounded-sm shadow-sm"></div>
        </div>
      </div>
    </div>
  </div>
);

// Componente de Escalação
const LineupDisplay = ({ lineup, isHome }: { lineup: TeamLineup; isHome: boolean }) => {
  const teamColor = isHome ? 'emerald' : 'blue';

  return (
    <div className={`bg-gray-800/50 rounded-xl p-4 border border-${teamColor}-500/20`}>
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700/50">
        {lineup.team.logo && (
          <img src={lineup.team.logo} alt={lineup.team.name} className="w-8 h-8 object-contain" />
        )}
        <div>
          <h4 className="text-white font-semibold text-sm">{lineup.team.name}</h4>
          <span className={`text-${teamColor}-400 text-xs font-medium`}>
            Formação: {lineup.formation}
          </span>
        </div>
      </div>

      {lineup.coach && (
        <div className="flex items-center gap-2 mb-4 bg-gray-900/50 rounded-lg p-2">
          {lineup.coach.photo && (
            <img src={lineup.coach.photo} alt={lineup.coach.name} className="w-8 h-8 rounded-full object-cover" />
          )}
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Treinador</span>
            <p className="text-white text-xs font-medium">{lineup.coach.name}</p>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h5 className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
          <i className="ri-team-line"></i>
          Titulares ({lineup.startXI.length})
        </h5>
        <div className="grid grid-cols-2 gap-1.5">
          {lineup.startXI.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2 bg-${teamColor}-500/10 rounded px-2 py-1.5`}
            >
              <span className={`text-${teamColor}-400 text-xs font-bold w-5`}>{item.player.number}</span>
              <span className="text-white text-xs truncate flex-1">{item.player.name}</span>
              <span className="text-gray-500 text-[10px]">{item.player.pos}</span>
            </div>
          ))}
        </div>
      </div>

      {lineup.substitutes.length > 0 && (
        <div>
          <h5 className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <i className="ri-arrow-left-right-line"></i>
            Suplentes ({lineup.substitutes.length})
          </h5>
          <div className="grid grid-cols-2 gap-1">
            {lineup.substitutes.slice(0, 10).map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-gray-700/30 rounded px-2 py-1">
                <span className="text-gray-500 text-xs font-bold w-5">{item.player.number}</span>
                <span className="text-gray-300 text-[11px] truncate flex-1">{item.player.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Componente de Evento
const EventItem = ({ event, homeTeamName }: { event: MatchEvent; homeTeamName: string }) => {
  const isHome = event.team.name === homeTeamName;

  const getEventStyle = () => {
    switch (event.type) {
      case 'Goal':
        return {
          icon: 'ri-football-fill',
          color: event.detail === 'Own Goal' ? 'text-red-500' : 'text-emerald-500',
          bg: event.detail === 'Own Goal' ? 'bg-red-500/20' : 'bg-emerald-500/20',
        };
      case 'Card':
        return {
          icon: 'ri-rectangle-fill',
          color: event.detail === 'Yellow Card' ? 'text-yellow-400' : 'text-red-500',
          bg: event.detail === 'Yellow Card' ? 'bg-yellow-400/20' : 'bg-red-500/20',
        };
      case 'subst':
        return { icon: 'ri-arrow-left-right-line', color: 'text-blue-400', bg: 'bg-blue-400/20' };
      case 'Var':
        return { icon: 'ri-vidicon-line', color: 'text-purple-400', bg: 'bg-purple-400/20' };
      default:
        return { icon: 'ri-information-line', color: 'text-gray-400', bg: 'bg-gray-400/20' };
    }
  };

  const style = getEventStyle();

  return (
    <div className={`flex items-start gap-3 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}>
      <div className={`flex-shrink-0 w-12 ${isHome ? 'text-left' : 'text-right'}`}>
        <span className="text-sm font-bold text-white">
          {event.time.elapsed}&apos;
          {event.time.extra && <span className="text-gray-500">+{event.time.extra}</span>}
        </span>
      </div>

      <div className={`flex-shrink-0 w-9 h-9 rounded-full ${style.bg} flex items-center justify-center`}>
        <i className={`${style.icon} ${style.color} text-lg`}></i>
      </div>

      <div className={`flex-1 ${isHome ? 'text-left' : 'text-right'}`}>
        <div className="text-sm font-semibold text-white">{event.player.name}</div>
        {event.type === 'subst' && event.assist.name && (
          <div
            className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"
            style={{ justifyContent: isHome ? 'flex-start' : 'flex-end' }}
          >
            <i className="ri-arrow-down-line text-red-400"></i>
            <span>{event.assist.name}</span>
          </div>
        )}
        {event.type === 'Goal' && event.assist.name && (
          <div className="text-xs text-gray-400 mt-0.5">Assistência: {event.assist.name}</div>
        )}
        <div className="text-xs text-gray-500 mt-0.5">
          {event.detail} • {event.team.name}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// COMPONENTE H2H - Confrontos Diretos
// ═══════════════════════════════════════════════════════════

const H2HMatchItem = ({ match }: { match: HeadToHeadMatch }) => {
  const date = new Date(match.fixture.date);
  const formattedDate = date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const homeGoals = match.goals.home ?? 0;
  const awayGoals = match.goals.away ?? 0;
  const isDraw = homeGoals === awayGoals;

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/30 hover:border-gray-600/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {match.league.logo && (
            <img src={match.league.logo} alt="" className="w-4 h-4 object-contain" />
          )}
          <span className="text-[10px] text-gray-400 truncate max-w-[160px]">{match.league.name}</span>
        </div>
        <span className="text-[10px] text-gray-500">{formattedDate}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex-1 flex items-center gap-2">
          {match.teams.home.logo && (
            <img src={match.teams.home.logo} alt="" className="w-5 h-5 object-contain" />
          )}
          <span
            className={`text-xs font-medium truncate ${
              match.teams.home.winner ? 'text-emerald-400' : isDraw ? 'text-gray-300' : 'text-gray-400'
            }`}
          >
            {match.teams.home.name}
          </span>
        </div>

        <div className="flex items-center gap-2 px-3">
          <span className={`text-sm font-bold ${match.teams.home.winner ? 'text-emerald-400' : 'text-white'}`}>
            {homeGoals}
          </span>
          <span className="text-gray-600 text-xs">-</span>
          <span className={`text-sm font-bold ${match.teams.away.winner ? 'text-emerald-400' : 'text-white'}`}>
            {awayGoals}
          </span>
        </div>

        <div className="flex-1 flex items-center gap-2 justify-end">
          <span
            className={`text-xs font-medium truncate ${
              match.teams.away.winner ? 'text-emerald-400' : isDraw ? 'text-gray-300' : 'text-gray-400'
            }`}
          >
            {match.teams.away.name}
          </span>
          {match.teams.away.logo && (
            <img src={match.teams.away.logo} alt="" className="w-5 h-5 object-contain" />
          )}
        </div>
      </div>

      {match.fixture.venue && (
        <div className="mt-2 flex items-center justify-center gap-1">
          <i className="ri-map-pin-line text-gray-600 text-[10px]"></i>
          <span className="text-[9px] text-gray-600">
            {match.fixture.venue.name}, {match.fixture.venue.city}
          </span>
        </div>
      )}
    </div>
  );
};

const H2HSummaryDisplay = ({
  h2h,
  homeTeam,
  awayTeam,
}: {
  h2h: HeadToHeadSummary;
  homeTeam: string;
  awayTeam: string;
}) => {
  const total = h2h.total;
  const homePercent = total > 0 ? Math.round((h2h.homeWins / total) * 100) : 0;
  const drawPercent = total > 0 ? Math.round((h2h.draws / total) * 100) : 0;
  const awayPercent = total > 0 ? Math.round((h2h.awayWins / total) * 100) : 0;

  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  h2h.matches.forEach((m) => {
    totalHomeGoals += m.goals.home ?? 0;
    totalAwayGoals += m.goals.away ?? 0;
  });
  const avgGoals = total > 0 ? ((totalHomeGoals + totalAwayGoals) / total).toFixed(1) : '0';

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/30">
        <div className="text-center mb-4">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Últimos {total} confrontos</span>
        </div>

        <div className="flex items-center gap-1 mb-4">
          <div
            className="h-8 bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-l-lg flex items-center justify-center transition-all duration-500"
            style={{ width: `${Math.max(homePercent, 8)}%` }}
          >
            <span className="text-white text-xs font-bold">{h2h.homeWins}</span>
          </div>
          {h2h.draws > 0 && (
            <div
              className="h-8 bg-gradient-to-r from-gray-500 to-gray-400 flex items-center justify-center transition-all duration-500"
              style={{ width: `${Math.max(drawPercent, 8)}%` }}
            >
              <span className="text-white text-xs font-bold">{h2h.draws}</span>
            </div>
          )}
          <div
            className="h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-r-lg flex items-center justify-center transition-all duration-500"
            style={{ width: `${Math.max(awayPercent, 8)}%` }}
          >
            <span className="text-white text-xs font-bold">{h2h.awayWins}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-500"></div>
            <span className="text-emerald-400 font-medium">{homeTeam}</span>
            <span className="text-gray-500">({homePercent}%)</span>
          </div>
          {h2h.draws > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gray-400"></div>
              <span className="text-gray-300 font-medium">Empates</span>
              <span className="text-gray-500">({drawPercent}%)</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span className="text-blue-400 font-medium">{awayTeam}</span>
            <span className="text-gray-500">({awayPercent}%)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800/40 rounded-lg p-3 text-center border border-gray-700/30">
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">Jogos</div>
        </div>
        <div className="bg-gray-800/40 rounded-lg p-3 text-center border border-gray-700/30">
          <div className="text-2xl font-bold text-amber-400">{avgGoals}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">Média Golos</div>
        </div>
        <div className="bg-gray-800/40 rounded-lg p-3 text-center border border-gray-700/30">
          <div className="text-2xl font-bold text-white">{totalHomeGoals + totalAwayGoals}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">Total Golos</div>
        </div>
      </div>

      <div>
        <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <i className="ri-history-line"></i>
          Histórico de Confrontos
        </h4>
        <div className="space-y-2">
          {h2h.matches.map((match, idx) => (
            <H2HMatchItem key={idx} match={match} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// COMPONENTE FORMA RECENTE
// ═══════════════════════════════════════════════════════════

const FormBadge = ({ result }: { result: 'W' | 'D' | 'L' }) => {
  const config = {
    W: { bg: 'bg-emerald-500', text: 'V', label: 'Vitória' },
    D: { bg: 'bg-amber-500', text: 'E', label: 'Empate' },
    L: { bg: 'bg-red-500', text: 'D', label: 'Derrota' },
  };
  const c = config[result];
  return (
    <div className={`w-8 h-8 ${c.bg} rounded-lg flex items-center justify-center shadow-lg`} title={c.label}>
      <span className="text-white text-xs font-bold">{c.text}</span>
    </div>
  );
};

const TeamFormCard = ({ teamForm, color }: { teamForm: TeamRecentForm; color: 'emerald' | 'blue' }) => {
  return (
    <div className={`bg-gray-800/50 rounded-xl p-4 border border-${color}-500/20`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700/50">
        {teamForm.teamLogo && (
          <img src={teamForm.teamLogo} alt={teamForm.teamName} className="w-8 h-8 object-contain" />
        )}
        <div>
          <h4 className="text-white font-semibold text-sm">{teamForm.teamName}</h4>
          <span className={`text-${color}-400 text-xs font-medium`}>Últimos 5 jogos</span>
        </div>
      </div>

      {/* Forma Visual */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {teamForm.form.map((result, idx) => (
          <FormBadge key={idx} result={result} />
        ))}
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-500/10 rounded-lg p-2 text-center border border-emerald-500/20">
          <div className="text-lg font-bold text-emerald-400">{teamForm.wins}</div>
          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Vitórias</div>
        </div>
        <div className="bg-amber-500/10 rounded-lg p-2 text-center border border-amber-500/20">
          <div className="text-lg font-bold text-amber-400">{teamForm.draws}</div>
          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Empates</div>
        </div>
        <div className="bg-red-500/10 rounded-lg p-2 text-center border border-red-500/20">
          <div className="text-lg font-bold text-red-400">{teamForm.losses}</div>
          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Derrotas</div>
        </div>
      </div>

      {/* Golos */}
      <div className="flex items-center justify-between bg-gray-900/50 rounded-lg p-3">
        <div className="text-center">
          <div className="text-sm font-bold text-white">{teamForm.goalsScored}</div>
          <div className="text-[9px] text-gray-500">Golos Marcados</div>
        </div>
        <div className="w-px h-8 bg-gray-700"></div>
        <div className="text-center">
          <div className="text-sm font-bold text-white">{teamForm.goalsConceded}</div>
          <div className="text-[9px] text-gray-500">Golos Sofridos</div>
        </div>
        <div className="w-px h-8 bg-gray-700"></div>
        <div className="text-center">
          <div className={`text-sm font-bold ${teamForm.goalsScored - teamForm.goalsConceded >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {teamForm.goalsScored - teamForm.goalsConceded >= 0 ? '+' : ''}{teamForm.goalsScored - teamForm.goalsConceded}
          </div>
          <div className="text-[9px] text-gray-500">Diferença</div>
        </div>
      </div>

      {/* Lista de Jogos */}
      <div className="mt-4 space-y-2">
        {teamForm.matches.map((match, idx) => {
          const date = new Date(match.fixture.date);
          const formattedDate = date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
          const isHome = match.teams.home.id === teamForm.teamId;
          const scored = isHome ? (match.goals.home ?? 0) : (match.goals.away ?? 0);
          const conceded = isHome ? (match.goals.away ?? 0) : (match.goals.home ?? 0);
          const opponent = isHome ? match.teams.away : match.teams.home;
          const result = scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';

          return (
            <div key={idx} className="flex items-center gap-2 bg-gray-800/40 rounded-lg p-2 border border-gray-700/20">
              <FormBadge result={result} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {opponent.logo && <img src={opponent.logo} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs text-white font-medium truncate">{isHome ? 'vs' : '@'} {opponent.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {match.league.logo && <img src={match.league.logo} alt="" className="w-3 h-3 object-contain" />}
                  <span className="text-[9px] text-gray-500 truncate">{match.league.name}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-white">{scored} - {conceded}</div>
                <div className="text-[9px] text-gray-500">{formattedDate}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RecentFormDisplay = ({ formData }: { formData: RecentFormData }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {formData.home && <TeamFormCard teamForm={formData.home} color="emerald" />}
        {formData.away && <TeamFormCard teamForm={formData.away} color="blue" />}
      </div>

      {!formData.home && !formData.away && (
        <div className="flex flex-col items-center justify-center py-12">
          <i className="ri-run-line text-4xl text-gray-600 mb-3"></i>
          <p className="text-gray-400 text-sm">Forma recente não disponível</p>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════

export default function MatchStatsDetailsPanel({
  matchId,
  homeTeam,
  awayTeam,
  homeTeamLogo,
  awayTeamLogo,
  isOpen,
  onClose,
}: MatchStatsDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'lineups' | 'events' | 'h2h' | 'form'>('stats');

  const { profile } = useProfile();
  const isAdminOrOperator = profile?.role === 'admin' || profile?.role === 'operator';

  const {
    statistics,
    lineups,
    events,
    loading,
    error,
    refresh,
    headToHead,
    h2hLoading,
    fetchH2H,
    recentForm,
    formLoading,
    fetchRecentForm,
  } = useMatchStatistics(isOpen ? matchId : null, true, 60000);

  // Buscar H2H quando a aba for selecionada
  useEffect(() => {
    if (activeTab === 'h2h' && !headToHead && !h2hLoading && homeTeam && awayTeam) {
      fetchH2H(homeTeam, awayTeam);
    }
  }, [activeTab, headToHead, h2hLoading, homeTeam, awayTeam, fetchH2H]);

  // Buscar Forma Recente quando a aba for selecionada
  useEffect(() => {
    if (activeTab === 'form' && !recentForm && !formLoading && homeTeam && awayTeam) {
      fetchRecentForm(homeTeam, awayTeam);
    }
  }, [activeTab, recentForm, formLoading, homeTeam, awayTeam, fetchRecentForm]);

  if (!isOpen) return null;

  const hasData = statistics || lineups.length > 0 || events.length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-2 md:p-4 animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-xl md:rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-emerald-500/30 shadow-2xl flex flex-col animate-[modalSlideUp_0.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 md:p-6 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <i className="ri-bar-chart-box-line"></i>
              Estatísticas do Jogo
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                disabled={loading}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
              >
                <i className={`ri-refresh-line text-white ${loading ? 'animate-spin' : ''}`}></i>
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-white text-xl"></i>
              </button>
            </div>
          </div>

          {/* Equipas */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {homeTeamLogo && (
                <img src={homeTeamLogo} alt={homeTeam} className="w-10 h-10 object-contain" />
              )}
              <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
              <span className="text-white font-semibold text-sm md:text-base truncate max-w-[120px] md:max-w-[180px]">
                {homeTeam}
              </span>
            </div>
            <span className="text-white/60 text-xs">VS</span>
            <div className="flex items-center gap-3">
              <span className="text-white font-semibold text-sm md:text-base truncate max-w-[120px] md:max-w-[180px]">
                {awayTeam}
              </span>
              <div className="w-3 h-3 rounded-full bg-blue-400"></div>
              {awayTeamLogo && (
                <img src={awayTeamLogo} alt={awayTeam} className="w-10 h-10 object-contain" />
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 mt-4 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveTab('stats')}
              className={`py-2 px-3 rounded-lg text-[11px] md:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'stats'
                  ? 'bg-white text-emerald-700'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <i className="ri-bar-chart-box-line mr-1"></i>
              Estatísticas
            </button>
            <button
              onClick={() => setActiveTab('form')}
              className={`py-2 px-3 rounded-lg text-[11px] md:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'form'
                  ? 'bg-white text-emerald-700'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <i className="ri-run-line mr-1"></i>
              Forma
            </button>
            <button
              onClick={() => setActiveTab('lineups')}
              className={`py-2 px-3 rounded-lg text-[11px] md:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'lineups'
                  ? 'bg-white text-emerald-700'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <i className="ri-team-line mr-1"></i>
              Escalações
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`py-2 px-3 rounded-lg text-[11px] md:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'events'
                  ? 'bg-white text-emerald-700'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <i className="ri-time-line mr-1"></i>
              Eventos ({events.length})
            </button>
            <button
              onClick={() => setActiveTab('h2h')}
              className={`py-2 px-3 rounded-lg text-[11px] md:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'h2h'
                  ? 'bg-white text-emerald-700'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <i className="ri-sword-line mr-1"></i>
              H2H
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Loading */}
          {loading && !hasData && activeTab !== 'h2h' && activeTab !== 'form' && (
            <div className="flex flex-col items-center justify-center py-12">
              <i className="ri-loader-4-line text-4xl text-emerald-500 animate-spin mb-3"></i>
              <p className="text-gray-400 text-sm">A carregar estatísticas...</p>
            </div>
          )}

          {/* Error */}
          {error && !hasData && activeTab !== 'h2h' && activeTab !== 'form' && (
            <div className="flex flex-col items-center justify-center py-12">
              <i className="ri-error-warning-line text-4xl text-red-500 mb-3"></i>
              <p className="text-gray-400 text-sm">{error}</p>
              <button
                onClick={refresh}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg cursor-pointer whitespace-nowrap"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Tab: Estatísticas */}
          {activeTab === 'stats' && (
            <>
              {statistics ? (
                <div className="space-y-1">
                  {isAdminOrOperator && (
                    <div className="flex items-center justify-center gap-2 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                      <i className="ri-check-double-line text-emerald-400"></i>
                      <span className="text-xs text-emerald-300">
                        Estatísticas reais da <strong>API-Football</strong>
                      </span>
                    </div>
                  )}

                  <StatBar label="Posse de Bola" homeValue={statistics.possession.home} awayValue={statistics.possession.away} icon="ri-football-line" showPercentage highlight />
                  {(statistics.dangerousAttacks.home > 0 || statistics.dangerousAttacks.away > 0) && (
                    <StatBar label="Ataques Perigosos" homeValue={statistics.dangerousAttacks.home} awayValue={statistics.dangerousAttacks.away} icon="ri-alarm-warning-line" highlight />
                  )}
                  <div className="border-t border-gray-700/50 my-3"></div>
                  <StatBar label="Remates Totais" homeValue={statistics.shots.home} awayValue={statistics.shots.away} icon="ri-focus-3-line" />
                  <StatBar label="Remates à Baliza" homeValue={statistics.shotsOnTarget.home} awayValue={statistics.shotsOnTarget.away} icon="ri-crosshair-2-line" />
                  <StatBar label="Remates Fora" homeValue={statistics.shotsOffTarget.home} awayValue={statistics.shotsOffTarget.away} icon="ri-close-circle-line" />
                  {(statistics.blockedShots.home > 0 || statistics.blockedShots.away > 0) && (
                    <StatBar label="Remates Bloqueados" homeValue={statistics.blockedShots.home} awayValue={statistics.blockedShots.away} icon="ri-shield-line" />
                  )}
                  <div className="border-t border-gray-700/50 my-3"></div>
                  <StatBar label="Cantos" homeValue={statistics.corners.home} awayValue={statistics.corners.away} icon="ri-corner-down-right-line" />
                  <StatBar label="Faltas" homeValue={statistics.fouls.home} awayValue={statistics.fouls.away} icon="ri-error-warning-line" />
                  <StatBar label="Foras de Jogo" homeValue={statistics.offsides.home} awayValue={statistics.offsides.away} icon="ri-flag-line" />
                  <div className="border-t border-gray-700/50 my-3"></div>
                  <StatBar label="Passes Totais" homeValue={statistics.passes.home} awayValue={statistics.passes.away} icon="ri-arrow-right-line" />
                  <StatBar label="Precisão de Passe" homeValue={statistics.passAccuracy.home} awayValue={statistics.passAccuracy.away} icon="ri-percent-line" showPercentage />
                  {(statistics.saves.home > 0 || statistics.saves.away > 0) && (
                    <StatBar label="Defesas do GR" homeValue={statistics.saves.home} awayValue={statistics.saves.away} icon="ri-hand-coin-line" />
                  )}
                  <CardDisplay
                    homeYellow={statistics.yellowCards.home}
                    awayYellow={statistics.yellowCards.away}
                    homeRed={statistics.redCards.home}
                    awayRed={statistics.redCards.away}
                  />
                </div>
              ) : !loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="ri-bar-chart-box-line text-4xl text-gray-600 mb-3"></i>
                  <p className="text-gray-400 text-sm">Estatísticas não disponíveis para este jogo</p>
                  <p className="text-gray-500 text-xs mt-1">As estatísticas aparecem após o início do jogo</p>
                </div>
              )}
            </>
          )}

          {/* Tab: Forma Recente */}
          {activeTab === 'form' && (
            <>
              {formLoading && !recentForm && (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="ri-loader-4-line text-4xl text-emerald-500 animate-spin mb-3"></i>
                  <p className="text-gray-400 text-sm">A carregar forma recente...</p>
                </div>
              )}

              {recentForm ? (
                <RecentFormDisplay formData={recentForm} />
              ) : !formLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="ri-run-line text-4xl text-gray-600 mb-3"></i>
                  <p className="text-gray-400 text-sm">Forma recente não disponível</p>
                  <button
                    onClick={() => fetchRecentForm(homeTeam, awayTeam)}
                    className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-refresh-line mr-1"></i>
                    Tentar novamente
                  </button>
                </div>
              )}
            </>
          )}

          {/* Tab: Escalações */}
          {activeTab === 'lineups' && (
            <>
              {lineups.length >= 2 ? (
                <div className="space-y-4">
                  {isAdminOrOperator && (
                    <div className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                      <i className="ri-check-double-line text-emerald-400"></i>
                      <span className="text-xs text-emerald-300">
                        Escalações reais da <strong>API-Football</strong>
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LineupDisplay lineup={lineups[0]} isHome={true} />
                    <LineupDisplay lineup={lineups[1]} isHome={false} />
                  </div>
                </div>
              ) : !loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="ri-team-line text-4xl text-gray-600 mb-3"></i>
                  <p className="text-gray-400 text-sm">Escalações não disponíveis</p>
                  <p className="text-gray-500 text-xs mt-1">As escalações são publicadas ~1h antes do jogo</p>
                </div>
              )}
            </>
          )}

          {/* Tab: Eventos */}
          {activeTab === 'events' && (
            <>
              {events.length > 0 ? (
                <div className="space-y-4">
                  {isAdminOrOperator && (
                    <div className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                      <i className="ri-check-double-line text-emerald-400"></i>
                      <span className="text-xs text-emerald-300">
                        Eventos reais da <strong>API-Football</strong>
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center gap-3 pb-3 border-b border-gray-700/50">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <i className="ri-football-fill text-emerald-500 text-xs"></i>
                      </div>
                      <span className="text-xs text-gray-400">Golo</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-yellow-400/20 flex items-center justify-center">
                        <i className="ri-rectangle-fill text-yellow-400 text-xs"></i>
                      </div>
                      <span className="text-xs text-gray-400">Amarelo</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                        <i className="ri-rectangle-fill text-red-500 text-xs"></i>
                      </div>
                      <span className="text-xs text-gray-400">Vermelho</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-blue-400/20 flex items-center justify-center">
                        <i className="ri-arrow-left-right-line text-blue-400 text-xs"></i>
                      </div>
                      <span className="text-xs text-gray-400">Substituição</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {events.map((event, idx) => (
                      <EventItem key={idx} event={event} homeTeamName={homeTeam} />
                    ))}
                  </div>
                </div>
              ) : !loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="ri-time-line text-4xl text-gray-600 mb-3"></i>
                  <p className="text-gray-400 text-sm">Nenhum evento registado</p>
                  <p className="text-gray-500 text-xs mt-1">Os eventos aparecem durante o jogo</p>
                </div>
              )}
            </>
          )}

          {/* Tab: Head-to-Head */}
          {activeTab === 'h2h' && (
            <>
              {h2hLoading && !headToHead && (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="ri-loader-4-line text-4xl text-emerald-500 animate-spin mb-3"></i>
                  <p className="text-gray-400 text-sm">A carregar confrontos diretos...</p>
                </div>
              )}

              {headToHead ? (
                <H2HSummaryDisplay h2h={headToHead} homeTeam={homeTeam} awayTeam={awayTeam} />
              ) : !h2hLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="ri-sword-line text-4xl text-gray-600 mb-3"></i>
                  <p className="text-gray-400 text-sm">Confrontos diretos não disponíveis</p>
                  <p className="text-gray-500 text-xs mt-1">Nenhum jogo anterior encontrado entre estas equipas</p>
                  <button
                    onClick={() => fetchH2H(homeTeam, awayTeam)}
                    className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-refresh-line mr-1"></i>
                    Tentar novamente
                  </button>
                </div>
              )}
            </>
          )}

          {/* Indicador ao vivo - Só para admin/operador */}
          {hasData && isAdminOrOperator && (
            <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-gray-700/50">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-gray-500">
                Dados atualizados em tempo real • API-Football
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
