import { useApp } from '@/react-app/contexts/AppContext';

export default function TermsPage() {
  const { darkMode } = useApp();
  return (
    <div className={`min-h-screen p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Termos e Condições Gerais</h1>
        
        <div className={`space-y-8 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          
          <section>
            <h2 className={`text-xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              1. Regras de Utilização
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>A plataforma é destinada exclusivamente a utilizadores maiores de 18 anos.</li>
              <li>Cada conta é pessoal, individual e intransmissível.</li>
              <li>É proibida a utilização de bots, scripts, automações ou qualquer forma de manipulação.</li>
              <li>As odds podem ser ajustadas; quando necessário, será solicitada confirmação do utilizador.</li>
              <li>Reservamo-nos o direito de suspender ou encerrar contas em caso de conduta indevida, fraude ou violação destes termos.</li>
            </ul>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              2. Jogo Responsável
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Disponibilizamos ferramentas de limites de utilização, notificações e autoexclusão.</li>
              <li>A autoexclusão impede depósitos, apostas e criação de novos boletins.</li>
              <li>O cashout poderá permanecer disponível apenas em apostas elegíveis.</li>
            </ul>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              3. Depósitos e Levantamentos
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Os valores depositados são convertidos em saldo interno para utilização exclusiva na plataforma.</li>
              <li><strong>Depósito mínimo:</strong> €10 | <strong>Máximo por operação:</strong> €20.000.</li>
              <li>O <strong>levantamento mínimo</strong> é de €10.</li>
              <li>Todos os levantamentos requerem IBAN válido e verificação da identidade.</li>
              <li>O IBAN ficará associado à conta para levantamentos futuros.</li>
              <li>O prazo de processamento pode ser de até 24 horas, dependendo das validações de segurança.</li>
              <li>A plataforma reserva-se o direito de realizar análise manual de levantamentos quando necessário.</li>
            </ul>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              4. Bónus e Promoções
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>As promoções podem estar sujeitas a condições específicas, prazos e requisitos.</li>
              <li>Reservamo-nos o direito de alterar ou cancelar promoções a qualquer momento.</li>
            </ul>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              5. Conta e Verificação
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>O utilizador é responsável por fornecer informações verdadeiras e atualizadas.</li>
              <li>Poderemos solicitar documentos de identificação, IBAN ou comprovativos adicionais para fins de segurança e conformidade.</li>
            </ul>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              6. Suporte e Reclamações
            </h2>
            <p className="mb-2">Contacto: <a href="mailto:atendimentoaoclientebet62@gmail.com" className="text-blue-500 hover:underline">atendimentoaoclientebet62@gmail.com</a></p>
            <p>Todas as reclamações serão analisadas caso a caso, com resposta por e-mail.</p>
          </section>

          <div className="pt-6 border-t border-gray-200 dark:border-gray-700 text-sm opacity-75">
            <p>Última atualização: <strong>05-01-2026</strong></p>
          </div>

        </div>
      </div>
    </div>
  );
}
