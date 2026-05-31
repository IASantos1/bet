import { useState, useEffect } from 'react';
import { apiFetch } from '../../../services/backendClient';

interface Match {
  id: string;
  sport: string;
  league: string;
  home_team: string;
  away_team: string;
  start_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  created_at: string;
}

export default function MatchesManagement() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [formData, setFormData] = useState({
    sport: 'football',
    league: '',
    home_team: '',
    away_team: '',
    start_time: '',
    status: 'scheduled',
    home_score: null as number | null,
    away_score: null as number | null
  });

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/admin/matches', { method: 'GET' });
      setMatches(data.matches || []);
    } catch (error) {
      console.error('Erro ao carregar jogos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMatch) {
        await apiFetch(`/admin/matches/${editingMatch.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...formData,
            start_time: new Date(formData.start_time).toISOString(),
          }),
        });
      } else {
        await apiFetch('/admin/matches', {
          method: 'POST',
          body: JSON.stringify({
            ...formData,
            start_time: new Date(formData.start_time).toISOString(),
          }),
        });
      }
      setShowModal(false);
      setEditingMatch(null);
      resetForm();
      await fetchMatches();
    } catch (error) {
      console.error('Erro ao salvar jogo:', error);
    }
  };

  const handleEdit = (match: Match) => {
    setEditingMatch(match);
    setFormData({
      sport: match.sport,
      league: match.league,
      home_team: match.home_team,
      away_team: match.away_team,
      start_time: new Date(match.start_time).toISOString().slice(0, 16),
      status: match.status,
      home_score: match.home_score,
      away_score: match.away_score
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja eliminar este jogo?')) return;
    try {
      await apiFetch(`/admin/matches/${id}`, { method: 'DELETE' });
      await fetchMatches();
    } catch (error) {
      console.error('Erro ao eliminar jogo:', error);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await apiFetch(`/admin/matches/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchMatches();
    } catch (error) {
      console.error('Erro ao atualizar jogo:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      sport: 'football',
      league: '',
      home_team: '',
      away_team: '',
      start_time: '',
      status: 'scheduled',
      home_score: null,
      away_score: null
    });
  };

  const filteredMatches = matches.filter(match => {
    const matchesSport = sportFilter === 'all' || match.sport === sportFilter;
    const matchesStatus = statusFilter === 'all' || match.status === statusFilter;
    return matchesSport && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Jogos</h1>
          <p className="text-gray-400 text-sm mt-1">{matches.length} jogos no total</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchMatches}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`}></i>
            Atualizar
          </button>
          <button
            onClick={() => {
              resetForm();
              setEditingMatch(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Novo Jogo
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">Todos os desportos</option>
          <option value="football">Futebol</option>
          <option value="basketball">Basquetebol</option>
          <option value="tennis">Ténis</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
        >
          <option value="all">Todos os estados</option>
          <option value="scheduled">Agendados</option>
          <option value="live">Ao Vivo</option>
          <option value="finished">Terminados</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      {/* Matches Grid */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <div className="h-20 bg-gray-700 rounded animate-pulse"></div>
            </div>
          ))
        ) : filteredMatches.length === 0 ? (
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-12 text-center">
            <i className="ri-football-line text-5xl text-gray-600 mb-4"></i>
            <p className="text-gray-400">Nenhum jogo encontrado</p>
          </div>
        ) : (
          filteredMatches.map((match) => (
            <div
              key={match.id}
              className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-amber-500/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                    <i className={`${getSportIcon(match.sport)} text-xl text-amber-400`}></i>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">{getSportLabel(match.sport)}</p>
                    <p className="text-xs text-gray-500">{match.league}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded text-xs font-medium ${getStatusColor(match.status)}`}>
                  {getStatusLabel(match.status)}
                </span>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex-1 text-center">
                  <p className="text-lg font-bold text-white mb-1">{match.home_team}</p>
                  {match.home_score !== null && (
                    <p className="text-3xl font-black text-amber-400">{match.home_score}</p>
                  )}
                </div>
                <div className="px-4">
                  <p className="text-gray-500 font-bold">VS</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-lg font-bold text-white mb-1">{match.away_team}</p>
                  {match.away_score !== null && (
                    <p className="text-3xl font-black text-amber-400">{match.away_score}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <p className="text-sm text-gray-400">
                  <i className="ri-calendar-line mr-1"></i>
                  {formatDateTime(match.start_time)}
                </p>
                <div className="flex items-center gap-2">
                  {match.status === 'scheduled' && (
                    <button
                      onClick={() => handleUpdateStatus(match.id, 'live')}
                      className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm rounded-lg transition-colors cursor-pointer"
                    >
                      Iniciar
                    </button>
                  )}
                  {match.status === 'live' && (
                    <button
                      onClick={() => handleUpdateStatus(match.id, 'finished')}
                      className="px-3 py-1.5 bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 text-sm rounded-lg transition-colors cursor-pointer"
                    >
                      Terminar
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(match)}
                    className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="ri-edit-line"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(match.id)}
                    className="w-8 h-8 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {editingMatch ? 'Editar Jogo' : 'Novo Jogo'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingMatch(null);
                  resetForm();
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Desporto</label>
                  <select
                    value={formData.sport}
                    onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="football">Futebol</option>
                    <option value="basketball">Basquetebol</option>
                    <option value="tennis">Ténis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Liga</label>
                  <input
                    type="text"
                    value={formData.league}
                    onChange={(e) => setFormData({ ...formData, league: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Equipa Casa</label>
                  <input
                    type="text"
                    value={formData.home_team}
                    onChange={(e) => setFormData({ ...formData, home_team: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Equipa Fora</label>
                  <input
                    type="text"
                    value={formData.away_team}
                    onChange={(e) => setFormData({ ...formData, away_team: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Data e Hora</label>
                  <input
                    type="datetime-local"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Estado</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="scheduled">Agendado</option>
                    <option value="live">Ao Vivo</option>
                    <option value="finished">Terminado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>

              {(formData.status === 'live' || formData.status === 'finished') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Resultado Casa</label>
                    <input
                      type="number"
                      value={formData.home_score ?? ''}
                      onChange={(e) => setFormData({ ...formData, home_score: e.target.value ? Number(e.target.value) : null })}
                      className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Resultado Fora</label>
                    <input
                      type="number"
                      value={formData.away_score ?? ''}
                      onChange={(e) => setFormData({ ...formData, away_score: e.target.value ? Number(e.target.value) : null })}
                      className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingMatch(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {editingMatch ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getSportIcon(sport: string): string {
  switch (sport) {
    case 'football': return 'ri-football-line';
    case 'basketball': return 'ri-basketball-line';
    case 'tennis': return 'ri-ping-pong-line';
    default: return 'ri-trophy-line';
  }
}

function getSportLabel(sport: string): string {
  switch (sport) {
    case 'football': return 'Futebol';
    case 'basketball': return 'Basquetebol';
    case 'tennis': return 'Ténis';
    default: return sport;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'scheduled': return 'bg-blue-500/20 text-blue-400';
    case 'live': return 'bg-green-500/20 text-green-400';
    case 'finished': return 'bg-gray-500/20 text-gray-400';
    case 'cancelled': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return 'Agendado';
    case 'live': return 'Ao Vivo';
    case 'finished': return 'Terminado';
    case 'cancelled': return 'Cancelado';
    default: return status;
  }
}
