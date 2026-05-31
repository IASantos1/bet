import { useState, useEffect } from 'react';
import { apiFetch } from '../../../services/backendClient';

interface Promotion {
  id: string;
  title: string;
  description: string;
  type: string;
  value: number;
  min_deposit: number;
  max_bonus: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  terms: string;
  created_at: string;
}

export default function PromotionsManagement() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'deposit_bonus',
    value: 0,
    min_deposit: 0,
    max_bonus: 0,
    valid_from: '',
    valid_until: '',
    is_active: true,
    terms: ''
  });

  useEffect(() => {
    fetchPromotions();
  }, []);

  const fetchPromotions = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/admin/promotions', { method: 'GET' });
      setPromotions(data.promotions || []);
    } catch (error) {
      console.error('Erro ao carregar promoções:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPromotion) {
        await apiFetch(`/admin/promotions/${editingPromotion.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
      } else {
        await apiFetch('/admin/promotions', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      
      setShowModal(false);
      setEditingPromotion(null);
      resetForm();
      await fetchPromotions();
    } catch (error) {
      console.error('Erro ao salvar promoção:', error);
    }
  };

  const handleEdit = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setFormData({
      title: promotion.title,
      description: promotion.description,
      type: promotion.type,
      value: promotion.value,
      min_deposit: promotion.min_deposit,
      max_bonus: promotion.max_bonus,
      valid_from: promotion.valid_from,
      valid_until: promotion.valid_until,
      is_active: promotion.is_active,
      terms: promotion.terms
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja eliminar esta promoção?')) return;
    try {
      await apiFetch(`/admin/promotions/${id}`, { method: 'DELETE' });
      
      await fetchPromotions();
    } catch (error) {
      console.error('Erro ao eliminar promoção:', error);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await apiFetch(`/admin/promotions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !isActive }),
      });
      
      await fetchPromotions();
    } catch (error) {
      console.error('Erro ao atualizar promoção:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'deposit_bonus',
      value: 0,
      min_deposit: 0,
      max_bonus: 0,
      valid_from: '',
      valid_until: '',
      is_active: true,
      terms: ''
    });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'deposit_bonus': return 'Bónus de Depósito';
      case 'free_bet': return 'Aposta Grátis';
      case 'cashback': return 'Cashback';
      case 'welcome_bonus': return 'Bónus de Boas-vindas';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Promoções</h1>
          <p className="text-gray-400 text-sm mt-1">{promotions.length} promoções no total</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPromotions}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`}></i>
            Atualizar
          </button>
          <button
            onClick={() => {
              resetForm();
              setEditingPromotion(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Nova Promoção
          </button>
        </div>
      </div>

      {/* Promotions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <div className="h-32 bg-gray-700 rounded animate-pulse"></div>
            </div>
          ))
        ) : promotions.length === 0 ? (
          <div className="col-span-2 bg-gray-800/50 border border-gray-700 rounded-xl p-12 text-center">
            <i className="ri-gift-line text-5xl text-gray-600 mb-4"></i>
            <p className="text-gray-400">Nenhuma promoção encontrada</p>
          </div>
        ) : (
          promotions.map((promotion) => (
            <div
              key={promotion.id}
              className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-amber-500/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-white">{promotion.title}</h3>
                    {promotion.is_active ? (
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">Ativa</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded">Inativa</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mb-2">{promotion.description}</p>
                  <span className="inline-block px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded">
                    {getTypeLabel(promotion.type)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Valor</p>
                  <p className="text-lg font-bold text-amber-400">{promotion.value}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Bónus Máximo</p>
                  <p className="text-lg font-bold text-white">€{promotion.max_bonus}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Depósito Mínimo</p>
                  <p className="text-sm text-white">€{promotion.min_deposit}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Validade</p>
                  <p className="text-sm text-white">{formatDate(promotion.valid_until)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-gray-700">
                <button
                  onClick={() => handleEdit(promotion)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-edit-line"></i>
                  Editar
                </button>
                <button
                  onClick={() => handleToggleActive(promotion.id, promotion.is_active)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                    promotion.is_active
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                      : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                  }`}
                >
                  <i className={promotion.is_active ? 'ri-pause-line' : 'ri-play-line'}></i>
                  {promotion.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => handleDelete(promotion.id)}
                  className="w-10 h-10 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
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
                {editingPromotion ? 'Editar Promoção' : 'Nova Promoção'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingPromotion(null);
                  resetForm();
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Título</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Tipo</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="deposit_bonus">Bónus de Depósito</option>
                    <option value="free_bet">Aposta Grátis</option>
                    <option value="cashback">Cashback</option>
                    <option value="welcome_bonus">Bónus de Boas-vindas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Valor (%)</label>
                  <input
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Depósito Mínimo (€)</label>
                  <input
                    type="number"
                    value={formData.min_deposit}
                    onChange={(e) => setFormData({ ...formData, min_deposit: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Bónus Máximo (€)</label>
                  <input
                    type="number"
                    value={formData.max_bonus}
                    onChange={(e) => setFormData({ ...formData, max_bonus: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Válido De</label>
                  <input
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Válido Até</label>
                  <input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Termos e Condições</label>
                <textarea
                  value={formData.terms}
                  onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 cursor-pointer"
                />
                <label htmlFor="is_active" className="text-sm text-gray-300 cursor-pointer">
                  Promoção ativa
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingPromotion(null);
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
                  {editingPromotion ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
