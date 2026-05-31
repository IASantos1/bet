
import { useState } from 'react';
import { useGamblingAlerts } from '../../hooks/useGamblingAlerts';
import { useNavigate } from 'react-router-dom';

export default function GamblingAlertsPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    alerts,
    riskScore,
    riskLevel,
    dismissAlert,
    dismissAllAlerts,
    hasCriticalAlerts
  } = useGamblingAlerts();
  const navigate = useNavigate();

  if (alerts.length === 0) return null;

  const getRiskColor = () => {
    switch (riskLevel) {
      case 'critical': return 'from-red-600 to-red-700';
      case 'high': return 'from-orange-500 to-orange-600';
      case 'moderate': return 'from-amber-500 to-amber-600';
      default: return 'from-yellow-500 to-yellow-600';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical': return 'ri-alarm-warning-fill text-red-600';
      case 'danger': return 'ri-error-warning-fill text-orange-600';
      default: return 'ri-alert-fill text-amber-600';
    }
  };

  const getAlertBg = (type: string) => {
    switch (type) {
      case 'critical': return 'bg-red-50 border-red-200';
      case 'danger': return 'bg-orange-50 border-orange-200';
      default: return 'bg-amber-50 border-amber-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'frequency': return 'ri-timer-flash-line';
      case 'losses': return 'ri-money-euro-circle-line';
      case 'chasing': return 'ri-arrow-up-double-line';
      case 'time': return 'ri-moon-line';
      case 'deposit': return 'ri-bank-card-line';
      case 'behavior': return 'ri-line-chart-line';
      default: return 'ri-alert-line';
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-all hover:scale-110 bg-gradient-to-br ${getRiskColor()} ${hasCriticalAlerts ? 'animate-pulse' : ''}`}
      >
        <i className="ri-mental-health-line text-white text-2xl"></i>
        <span className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs font-bold text-red-600 border-2 border-red-500">
          {alerts.length}
        </span>
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="fixed bottom-40 right-6 z-50 w-96 max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className={`p-4 bg-gradient-to-r ${getRiskColor()} text-white`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <i className="ri-mental-health-line text-2xl"></i>
                <h3 className="font-bold text-lg">Alertas de Jogo</h3>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer transition-colors"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Risk Score */}
            <div className="flex items-center space-x-3">
              <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${riskScore}%` }}
                ></div>
              </div>
              <span className="text-sm font-semibold">{riskScore}%</span>
            </div>
            <div className="text-xs text-white/80 mt-1">
              Nível de Risco: <span className="font-bold uppercase">{
                riskLevel === 'critical' ? 'Crítico' :
                riskLevel === 'high' ? 'Alto' :
                riskLevel === 'moderate' ? 'Moderado' : 'Baixo'
              }</span>
            </div>
          </div>

          {/* Alerts List */}
          <div className="max-h-80 overflow-y-auto p-4 space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border p-4 ${getAlertBg(alert.type)} transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <i className={`${getAlertIcon(alert.type)} text-xl`}></i>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      alert.type === 'critical' ? 'bg-red-200 text-red-800' :
                      alert.type === 'danger' ? 'bg-orange-200 text-orange-800' :
                      'bg-amber-200 text-amber-800'
                    }`}>
                      {alert.type === 'critical' ? 'CRÍTICO' :
                       alert.type === 'danger' ? 'PERIGO' : 'AVISO'}
                    </span>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="w-6 h-6 rounded-full hover:bg-gray-200 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <i className="ri-close-line text-gray-500"></i>
                  </button>
                </div>

                <div className="flex items-start space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    alert.type === 'critical' ? 'bg-red-100' :
                    alert.type === 'danger' ? 'bg-orange-100' : 'bg-amber-100'
                  }`}>
                    <i className={`${getCategoryIcon(alert.category)} text-xl ${
                      alert.type === 'critical' ? 'text-red-600' :
                      alert.type === 'danger' ? 'text-orange-600' : 'text-amber-600'
                    }`}></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-sm">{alert.title}</h4>
                    <p className="text-xs text-gray-600 mt-1">{alert.description}</p>
                    <p className="text-xs text-gray-700 mt-2 p-2 bg-white/50 rounded-lg">
                      <i className="ri-lightbulb-line mr-1"></i>
                      {alert.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-2">
            <button
              onClick={() => navigate('/perfil')}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-shield-user-line mr-2"></i>
              Ativar Auto-Exclusão
            </button>
            <div className="flex space-x-2">
              <button
                onClick={() => navigate('/estatisticas')}
                className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-bar-chart-line mr-1"></i>
                Estatísticas
              </button>
              <button
                onClick={dismissAllAlerts}
                className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-check-double-line mr-1"></i>
                Dispensar Todos
              </button>
            </div>
            <a
              href="tel:800200134"
              className="block w-full py-2 text-center text-teal-700 hover:text-teal-800 text-sm font-semibold"
            >
              <i className="ri-phone-line mr-1"></i>
              Linha de Apoio: 800 200 134
            </a>
          </div>
        </div>
      )}
    </>
  );
}
