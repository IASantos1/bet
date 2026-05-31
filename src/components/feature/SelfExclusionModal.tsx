
import { useState } from 'react';

interface SelfExclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (days: number, reason: string) => Promise<void>;
  type: 'cooling_off' | 'self_exclusion';
}

const EXCLUSION_OPTIONS = [
  { days: 1, label: '24 Horas', description: 'Pausa rápida para reflexão' },
  { days: 7, label: '1 Semana', description: 'Uma semana sem apostas' },
  { days: 30, label: '1 Mês', description: 'Pausa de um mês completo' },
  { days: 90, label: '3 Meses', description: 'Período prolongado de exclusão' },
  { days: 180, label: '6 Meses', description: 'Meio ano de pausa' },
  { days: 365, label: '1 Ano', description: 'Exclusão de longo prazo' }
];

const COOLING_OFF_OPTIONS = [
  { hours: 1, label: '1 Hora', description: 'Pausa curta' },
  { hours: 6, label: '6 Horas', description: 'Pausa de meio dia' },
  { hours: 12, label: '12 Horas', description: 'Pausa de meio dia' },
  { hours: 24, label: '24 Horas', description: 'Pausa de um dia' }
];

const REASONS = [
  'Preciso de uma pausa',
  'Estou a gastar demasiado',
  'Quero focar noutras coisas',
  'Recomendação médica/profissional',
  'Motivos pessoais',
  'Outro'
];

export default function SelfExclusionModal({ isOpen, onClose, onConfirm, type }: SelfExclusionModalProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [step, setStep] = useState(1);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isCoolingOff = type === 'cooling_off';
  const options = isCoolingOff ? COOLING_OFF_OPTIONS : EXCLUSION_OPTIONS;

  const handleConfirm = async () => {
    if (!selectedPeriod) return;
    
    const reason = selectedReason === 'Outro' ? customReason : selectedReason;
    
    if (!isCoolingOff && confirmText !== 'CONFIRMAR') {
      setError('Por favor, escreva CONFIRMAR para continuar');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onConfirm(selectedPeriod, reason);
      handleClose();
    } catch {
      setError('Erro ao ativar auto-exclusão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedPeriod(null);
    setSelectedReason('');
    setCustomReason('');
    setConfirmText('');
    setStep(1);
    setError('');
    onClose();
  };

  const canProceedStep1 = selectedPeriod !== null;
  const canProceedStep2 = selectedReason !== '' && (selectedReason !== 'Outro' || customReason.trim() !== '');
  const canConfirm = isCoolingOff || confirmText === 'CONFIRMAR';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`p-6 border-b ${isCoolingOff ? 'bg-amber-50' : 'bg-red-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isCoolingOff ? 'bg-amber-100' : 'bg-red-100'}`}>
                <i className={`${isCoolingOff ? 'ri-time-line text-amber-600' : 'ri-shield-user-line text-red-600'} text-2xl`}></i>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {isCoolingOff ? 'Período de Reflexão' : 'Auto-Exclusão'}
                </h2>
                <p className="text-sm text-gray-600">
                  {isCoolingOff ? 'Pausa temporária nas apostas' : 'Suspensão temporária da conta'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-xl text-gray-500"></i>
            </button>
          </div>

          {/* Progress Steps */}
          {!isCoolingOff && (
            <div className="flex items-center justify-center mt-4 space-x-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step >= s ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > s ? <i className="ri-check-line"></i> : s}
                  </div>
                  {s < 3 && (
                    <div className={`w-12 h-1 mx-1 ${step > s ? 'bg-red-600' : 'bg-gray-200'}`}></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Select Period */}
          {step === 1 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">
                {isCoolingOff ? 'Selecione o período de pausa:' : 'Selecione o período de exclusão:'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {options.map((option) => {
                  const value = isCoolingOff ? (option as any).hours : (option as any).days;
                  return (
                    <button
                      key={value}
                      onClick={() => setSelectedPeriod(value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        selectedPeriod === value
                          ? isCoolingOff
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-bold text-gray-900">{option.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{option.description}</div>
                    </button>
                  );
                })}
              </div>

              {!isCoolingOff && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start space-x-3">
                    <i className="ri-alert-line text-amber-600 text-xl mt-0.5"></i>
                    <div className="text-sm text-amber-800">
                      <strong>Atenção:</strong> Durante o período de auto-exclusão, não poderá fazer apostas, depósitos ou aceder a funcionalidades de jogo. Esta ação não pode ser revertida antes do término do período.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Reason */}
          {step === 2 && !isCoolingOff && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Qual o motivo da auto-exclusão?</h3>
              <div className="space-y-2">
                {REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setSelectedReason(reason)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      selectedReason === reason
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedReason === reason ? 'border-red-500 bg-red-500' : 'border-gray-300'
                      }`}>
                        {selectedReason === reason && <i className="ri-check-line text-white text-xs"></i>}
                      </div>
                      <span className="text-gray-900">{reason}</span>
                    </div>
                  </button>
                ))}
              </div>

              {selectedReason === 'Outro' && (
                <div className="mt-4">
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value.slice(0, 500))}
                    placeholder="Descreva o seu motivo..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm"
                    rows={3}
                    maxLength={500}
                  />
                  <div className="text-xs text-gray-500 text-right mt-1">{customReason.length}/500</div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && !isCoolingOff && (
            <div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <h3 className="font-bold text-red-900 mb-3">Resumo da Auto-Exclusão</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Período:</span>
                    <span className="font-semibold text-gray-900">
                      {EXCLUSION_OPTIONS.find(o => o.days === selectedPeriod)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Motivo:</span>
                    <span className="font-semibold text-gray-900">
                      {selectedReason === 'Outro' ? customReason.slice(0, 30) + '...' : selectedReason}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Término:</span>
                    <span className="font-semibold text-gray-900">
                      {new Date(Date.now() + (selectedPeriod || 0) * 24 * 60 * 60 * 1000).toLocaleDateString('pt-PT', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Para confirmar, escreva <span className="text-red-600">CONFIRMAR</span> abaixo:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="CONFIRMAR"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-center font-bold text-lg tracking-widest"
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
                  <i className="ri-error-warning-line mr-2"></i>
                  {error}
                </div>
              )}

              <div className="p-4 bg-gray-100 rounded-xl text-sm text-gray-600">
                <i className="ri-information-line mr-2 text-gray-500"></i>
                Ao confirmar, a sua conta será imediatamente suspensa pelo período selecionado. Não será possível reverter esta ação.
              </div>
            </div>
          )}

          {/* Cooling Off Confirmation */}
          {isCoolingOff && selectedPeriod && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-sm text-amber-800">
                <strong>Período selecionado:</strong> {COOLING_OFF_OPTIONS.find(o => o.hours === selectedPeriod)?.label}
                <br />
                <span className="text-xs">Durante este período, não poderá fazer novas apostas.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex items-center justify-between">
          {step > 1 && !isCoolingOff ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-semibold text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Voltar
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-semibold text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
          )}

          {isCoolingOff ? (
            <button
              onClick={handleConfirm}
              disabled={!canProceedStep1 || loading}
              className={`px-6 py-3 rounded-xl font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                canProceedStep1 && !loading
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  A processar...
                </>
              ) : (
                <>
                  <i className="ri-time-line mr-2"></i>
                  Ativar Pausa
                </>
              )}
            </button>
          ) : step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              className={`px-6 py-3 rounded-xl font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                (step === 1 ? canProceedStep1 : canProceedStep2)
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Continuar
              <i className="ri-arrow-right-line ml-2"></i>
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || loading}
              className={`px-6 py-3 rounded-xl font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                canConfirm && !loading
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  A processar...
                </>
              ) : (
                <>
                  <i className="ri-shield-user-line mr-2"></i>
                  Confirmar Auto-Exclusão
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
