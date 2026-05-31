
import { useNavigate } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';

export default function PaymentSettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
            >
              <i className="ri-arrow-left-line"></i>
              Voltar ao Admin
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Configuração de Pagamentos</h1>
            <p className="text-gray-600 mt-2">Gerencie os métodos de pagamento da plataforma</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-bank-card-line text-3xl text-gray-400"></i>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Métodos de Pagamento</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Os métodos de pagamento disponíveis são: MB WAY, Multibanco e Transferência Bancária.
              Os depósitos são verificados e aprovados manualmente pela equipa de administração.
            </p>

            <div className="grid grid-cols-3 gap-4 mt-8">
              <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <i className="ri-smartphone-line text-2xl text-red-500 mb-2 block"></i>
                <p className="font-semibold text-gray-900 text-sm">MB WAY</p>
                <p className="text-xs text-gray-500 mt-1">Instantâneo</p>
              </div>
              <div className="bg-teal-50 rounded-xl p-4 border border-teal-100">
                <i className="ri-atm-line text-2xl text-teal-500 mb-2 block"></i>
                <p className="font-semibold text-gray-900 text-sm">Multibanco</p>
                <p className="text-xs text-gray-500 mt-1">1–5 minutos</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <i className="ri-bank-line text-2xl text-emerald-500 mb-2 block"></i>
                <p className="font-semibold text-gray-900 text-sm">Transferência</p>
                <p className="text-xs text-gray-500 mt-1">1–3 dias úteis</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
