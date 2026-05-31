import { Link } from 'react-router-dom';

interface FooterProps {
  isDarkMode?: boolean;
}

export function Footer({ isDarkMode: _isDarkMode = true }: FooterProps) {
  return (
    <footer className="bg-gray-900 text-white border-t border-red-600/40">
      {/* Features Bar - Movido do banner */}
      <div className="bg-gray-900/80 border-b border-red-600/30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-red-500/15 rounded-lg flex items-center justify-center">
                <i className="ri-shield-check-line text-base md:text-lg text-red-400"></i>
              </div>
              <div>
                <h4 className="font-semibold text-xs md:text-sm text-white">100% Seguro</h4>
                <p className="text-[10px] md:text-xs text-gray-400 hidden sm:block">Segurança avançada</p>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-red-500/15 rounded-lg flex items-center justify-center">
                <i className="ri-customer-service-2-line text-base md:text-lg text-red-400"></i>
              </div>
              <div>
                <h4 className="font-semibold text-xs md:text-sm text-white">Suporte 24/7</h4>
                <p className="text-[10px] md:text-xs text-gray-400 hidden sm:block">Sempre disponível</p>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <i className="ri-flashlight-line text-base md:text-lg text-red-500"></i>
              </div>
              <div>
                <h4 className="font-semibold text-xs md:text-sm text-white">Depósito Rápido</h4>
                <p className="text-[10px] md:text-xs text-gray-400 hidden sm:block">Transações instantâneas</p>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <i className="ri-trophy-line text-base md:text-lg text-red-500"></i>
              </div>
              <div>
                <h4 className="font-semibold text-xs md:text-sm text-white">Melhores Odds</h4>
                <p className="text-[10px] md:text-xs text-gray-400 hidden sm:block">Odds competitivas</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Download App Section - Mobile */}
      <div className="lg:hidden bg-gradient-to-r from-red-600/15 to-red-500/20 border-b border-red-600/30">
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center border border-red-600/40">
              <span className="text-lg font-black text-white">B<span className="text-red-500">62</span></span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">Baixe a App BET62</h4>
              <p className="text-xs text-gray-400">Aposte em qualquer lugar!</p>
            </div>
          </div>
          <button 
            onClick={() => alert('Download iniciado! A app será instalada em breve.')}
            className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white text-xs font-bold rounded-lg whitespace-nowrap cursor-pointer"
          >
            <i className="ri-download-line mr-1"></i>
            Download
          </button>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {/* Logo & Description */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center mb-3 md:mb-4">
              <span className="text-lg md:text-xl font-black tracking-tight text-white">
                BET<span className="text-red-500">62</span>
              </span>
              <span className="ml-2 text-[10px] md:text-xs font-medium text-red-400/80">
                Apostas Desportivas
              </span>
            </div>
            <p className="text-xs md:text-sm text-gray-400 leading-relaxed">
              A plataforma de apostas esportivas mais confiável de Portugal.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-xs md:text-sm mb-3 md:mb-4 text-red-400">Links Rápidos</h4>
            <ul className="space-y-1.5 md:space-y-2">
              <li>
                <Link to="/desportos-ao-vivo" className="text-xs md:text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                  Desportos ao Vivo
                </Link>
              </li>
              <li>
                <Link to="/promocoes" className="text-xs md:text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                  Promoções
                </Link>
              </li>
              <li>
                <Link to="/deposito" className="text-xs md:text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                  Depósito
                </Link>
              </li>
              <li>
                <Link to="/levantamento" className="text-xs md:text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                  Levantamento
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-bold text-xs md:text-sm mb-3 md:mb-4 text-red-400">Suporte</h4>
            <ul className="space-y-1.5 md:space-y-2">
              <li>
                <Link to="/faq" className="text-xs md:text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                  Centro de Ajuda
                </Link>
              </li>
              <li>
                <Link to="/termos-e-condicoes" className="text-xs md:text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                  Termos e Condições
                </Link>
              </li>
              <li>
                <Link to="/politica-de-privacidade" className="text-xs md:text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                  Privacidade
                </Link>
              </li>
              <li>
                <Link to="/jogo-responsavel" className="text-xs md:text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer">
                  Jogo Responsável
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-xs md:text-sm mb-3 md:mb-4 text-red-400">Contacto</h4>
            <ul className="space-y-2 md:space-y-3">
              <li className="flex items-center gap-2 text-xs md:text-sm text-gray-400">
                <i className="ri-mail-line text-red-400"></i>
                suporte@bet62.plus
              </li>
              <li className="flex items-center gap-2 text-xs md:text-sm text-gray-400">
                <i className="ri-phone-line text-red-400"></i>
                +351 800 123 456
              </li>
              <li className="flex items-center gap-2 text-xs md:text-sm text-gray-400">
                <i className="ri-time-line text-red-400"></i>
                24 horas / 7 dias
              </li>
            </ul>
            <div className="flex items-center gap-2 md:gap-3 mt-3 md:mt-4">
              <a href="#" className="w-7 h-7 md:w-8 md:h-8 bg-gray-800 hover:bg-red-600 rounded-lg flex items-center justify-center transition-colors cursor-pointer border border-red-600/30">
                <i className="ri-facebook-fill text-xs md:text-sm"></i>
              </a>
              <a href="#" className="w-7 h-7 md:w-8 md:h-8 bg-gray-800 hover:bg-red-600 rounded-lg flex items-center justify-center transition-colors cursor-pointer border border-red-600/30">
                <i className="ri-twitter-x-fill text-xs md:text-sm"></i>
              </a>
              <a href="#" className="w-7 h-7 md:w-8 md:h-8 bg-gray-800 hover:bg-red-600 rounded-lg flex items-center justify-center transition-colors cursor-pointer border border-red-600/30">
                <i className="ri-instagram-fill text-xs md:text-sm"></i>
              </a>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-red-600/30">
          <h4 className="font-semibold text-[10px] md:text-xs text-gray-400 mb-2 md:mb-3">Métodos de Pagamento</h4>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="px-2 md:px-3 py-1 md:py-1.5 bg-gray-800 text-red-300 rounded-md text-[10px] md:text-xs border border-red-600/30">Visa</div>
            <div className="px-2 md:px-3 py-1 md:py-1.5 bg-gray-800 text-red-300 rounded-md text-[10px] md:text-xs border border-red-600/30">Mastercard</div>
            <div className="px-2 md:px-3 py-1 md:py-1.5 bg-gray-800 text-red-300 rounded-md text-[10px] md:text-xs border border-red-600/30">MBWay</div>
            <div className="px-2 md:px-3 py-1 md:py-1.5 bg-gray-800 text-red-300 rounded-md text-[10px] md:text-xs border border-red-600/30">Multibanco</div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-red-600/30 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
          <p className="text-[10px] md:text-xs text-gray-500 text-center md:text-left">
            © 2025 BET62 - Apostas Esportivas. Todos os direitos reservados. Jogue com responsabilidade. 18+
          </p>
          <a 
            href="https://readdy.ai/?ref=logo" 
            target="_blank" 
            rel="nofollow noopener noreferrer"
            className="text-[10px] md:text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
          >
            Powered by Readdy
          </a>
        </div>
      </div>

      {/* Mobile Bottom Spacer */}
      <div className="lg:hidden h-20"></div>
    </footer>
  );
}

export default Footer;
