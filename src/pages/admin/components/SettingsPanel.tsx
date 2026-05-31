import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SettingsPanel() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    siteName: 'BET62',
    siteDescription: 'A melhor plataforma de apostas desportivas de Portugal',
    supportEmail: 'suporte@bet62.pt',
    supportPhone: '+351 800 123 456',
    minDeposit: 5,
    maxDeposit: 10000,
    minWithdrawal: 10,
    maxWithdrawal: 5000,
    minBet: 0.5,
    maxBet: 10000,
    defaultOddsFormat: 'decimal',
    maintenanceMode: false,
    registrationEnabled: true,
    bonusEnabled: true
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Simular guardar
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Definições</h1>
          <p className="text-gray-400 text-sm mt-1">Configurações gerais do sistema</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              A guardar...
            </>
          ) : saved ? (
            <>
              <i className="ri-check-line"></i>
              Guardado!
            </>
          ) : (
            <>
              <i className="ri-save-line"></i>
              Guardar Alterações
            </>
          )}
        </button>
      </div>

      {/* Payment APIs Card */}
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <i className="ri-bank-card-2-line text-2xl text-white"></i>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">APIs de Pagamento</h3>
              <p className="text-sm text-gray-400">Configure PayPal, Stripe e outros métodos de pagamento</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/admin/configuracoes-pagamento')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-settings-3-line"></i>
            Configurar
          </button>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <i className="ri-settings-3-line text-amber-400"></i>
            Geral
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nome do Site</label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Descrição</label>
              <textarea
                value={settings.siteDescription}
                onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                rows={3}
                maxLength={500}
                className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email de Suporte</label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Telefone de Suporte</label>
              <input
                type="text"
                value={settings.supportPhone}
                onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Limits Settings */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <i className="ri-money-euro-circle-line text-amber-400"></i>
            Limites Financeiros
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Depósito Mínimo (€)</label>
                <input
                  type="number"
                  value={settings.minDeposit}
                  onChange={(e) => setSettings({ ...settings, minDeposit: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Depósito Máximo (€)</label>
                <input
                  type="number"
                  value={settings.maxDeposit}
                  onChange={(e) => setSettings({ ...settings, maxDeposit: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Levantamento Mínimo (€)</label>
                <input
                  type="number"
                  value={settings.minWithdrawal}
                  onChange={(e) => setSettings({ ...settings, minWithdrawal: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Levantamento Máximo (€)</label>
                <input
                  type="number"
                  value={settings.maxWithdrawal}
                  onChange={(e) => setSettings({ ...settings, maxWithdrawal: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Aposta Mínima (€)</label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.minBet}
                  onChange={(e) => setSettings({ ...settings, minBet: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Aposta Máxima (€)</label>
                <input
                  type="number"
                  value={settings.maxBet}
                  onChange={(e) => setSettings({ ...settings, maxBet: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* System Settings */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <i className="ri-toggle-line text-amber-400"></i>
            Sistema
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Modo Manutenção</p>
                <p className="text-xs text-gray-400">Desativa o acesso ao site</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.maintenanceMode ? 'bg-red-500' : 'bg-gray-600'
                }`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.maintenanceMode ? 'translate-x-6' : 'translate-x-0.5'
                }`}></span>
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Registos Ativos</p>
                <p className="text-xs text-gray-400">Permite novos registos</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, registrationEnabled: !settings.registrationEnabled })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.registrationEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.registrationEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}></span>
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Bónus Ativos</p>
                <p className="text-xs text-gray-400">Permite utilização de bónus</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, bonusEnabled: !settings.bonusEnabled })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.bonusEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.bonusEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}></span>
              </button>
            </div>
          </div>
        </div>

        {/* Odds Settings */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <i className="ri-percent-line text-amber-400"></i>
            Odds
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Formato de Odds Padrão</label>
              <select
                value={settings.defaultOddsFormat}
                onChange={(e) => setSettings({ ...settings, defaultOddsFormat: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="decimal">Decimal (1.50)</option>
                <option value="fractional">Fracionário (1/2)</option>
                <option value="american">Americano (+150)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
        <h2 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
          <i className="ri-error-warning-line"></i>
          Zona de Perigo
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-white">Limpar Cache</p>
              <p className="text-xs text-gray-400">Remove todos os dados em cache do sistema</p>
            </div>
            <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
              Limpar
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-white">Exportar Dados</p>
              <p className="text-xs text-gray-400">Exporta todos os dados do sistema</p>
            </div>
            <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
              Exportar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
