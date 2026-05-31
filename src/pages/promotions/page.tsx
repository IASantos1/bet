import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';
import { promotions } from '../../mocks/sports-data';

export default function PromotionsPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header 
        balance={1250.50}
        freeBets={25.00}
        isLoggedIn={true}
      />

      <main className="flex-1 py-8 pb-20 lg:pb-8">
        <div className="max-w-7xl mx-auto px-6">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              <i className="ri-gift-line text-yellow-500 mr-3"></i>
              Promoções e Bónus
            </h1>
            <p className="text-gray-600">Aproveite as melhores ofertas e maximize seus ganhos</p>
          </div>

          {/* Featured Promotion */}
          <div className="bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 rounded-2xl shadow-xl p-8 mb-8 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <img 
                src="https://readdy.ai/api/search-image?query=abstract%20celebration%20pattern%20with%20confetti%20and%20stars%20on%20transparent%20background%20festive%20promotional%20design%20element&width=1200&height=400&seq=promo-bg&orientation=landscape"
                alt="Background"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="relative z-10">
              <div className="flex items-center space-x-2 mb-4">
                <span className="bg-white/20 backdrop-blur-sm px-4 py-1 rounded-full text-sm font-bold">
                  🔥 OFERTA ESPECIAL
                </span>
              </div>
              <h2 className="text-4xl font-bold mb-4">Bónus de Boas-Vindas</h2>
              <p className="text-2xl mb-6 font-semibold">100% até €200 no primeiro depósito</p>
              <p className="text-lg mb-6 text-white/90">
                Faça seu primeiro depósito e receba o dobro para apostar! Depósito mínimo de €10.
              </p>
              <button className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 rounded-lg font-bold text-lg transition-all transform hover:scale-105 cursor-pointer whitespace-nowrap">
                <i className="ri-gift-line mr-2"></i>
                Resgatar Agora
              </button>
            </div>
          </div>

          {/* Promotions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {promotions.map((promo) => (
              <div key={promo.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={promo.image}
                    alt={promo.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 right-4 bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                    ATIVO
                  </div>
                </div>
                
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{promo.title}</h3>
                  <p className="text-lg text-gray-700 mb-4 font-semibold">{promo.description}</p>
                  
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="text-xs text-gray-500 mb-2 font-semibold">TERMOS E CONDIÇÕES:</div>
                    <p className="text-sm text-gray-700">{promo.terms}</p>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-gray-500">
                      <i className="ri-calendar-line mr-1"></i>
                      Válido até {promo.validUntil}
                    </div>
                  </div>

                  <button className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap">
                    <i className="ri-check-line mr-2"></i>
                    Ativar Promoção
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Info Section */}
          <div className="mt-12 bg-blue-50 border border-blue-200 rounded-xl p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              <i className="ri-information-line text-blue-600 mr-2"></i>
              Como Funcionam as Promoções?
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="text-white font-bold text-xl">1</span>
                </div>
                <h4 className="font-bold text-lg mb-2 text-gray-900">Escolha a Promoção</h4>
                <p className="text-sm text-gray-700">Selecione a oferta que melhor se adequa ao seu estilo de aposta.</p>
              </div>
              <div>
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="text-white font-bold text-xl">2</span>
                </div>
                <h4 className="font-bold text-lg mb-2 text-gray-900">Ative a Oferta</h4>
                <p className="text-sm text-gray-700">Clique em ativar e siga as instruções para participar.</p>
              </div>
              <div>
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="text-white font-bold text-xl">3</span>
                </div>
                <h4 className="font-bold text-lg mb-2 text-gray-900">Aproveite o Bónus</h4>
                <p className="text-sm text-gray-700">Use seu bónus para fazer apostas e aumentar seus ganhos.</p>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-lg mb-4 text-gray-900">Termos Gerais das Promoções</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <i className="ri-checkbox-circle-line text-green-600 mr-2 mt-0.5"></i>
                <span>Todas as promoções estão sujeitas aos termos e condições gerais da BET62.</span>
              </li>
              <li className="flex items-start">
                <i className="ri-checkbox-circle-line text-green-600 mr-2 mt-0.5"></i>
                <span>Os bónus devem ser utilizados dentro do prazo de validade especificado.</span>
              </li>
              <li className="flex items-start">
                <i className="ri-checkbox-circle-line text-green-600 mr-2 mt-0.5"></i>
                <span>Requisitos de rollover devem ser cumpridos antes do levantamento.</span>
              </li>
              <li className="flex items-start">
                <i className="ri-checkbox-circle-line text-green-600 mr-2 mt-0.5"></i>
                <span>A BET62 reserva-se o direito de modificar ou cancelar promoções a qualquer momento.</span>
              </li>
              <li className="flex items-start">
                <i className="ri-checkbox-circle-line text-green-600 mr-2 mt-0.5"></i>
                <span>Apenas uma promoção pode ser ativa por conta ao mesmo tempo.</span>
              </li>
            </ul>
          </div>
        </div>
      </main>

      <Footer />
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
