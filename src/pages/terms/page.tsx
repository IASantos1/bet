
import { Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';

export default function TermsPage() {
  const sections = [
    {
      id: 'introducao',
      title: '1. Introdução',
      content: `Bem-vindo à BET62 ("nós", "nosso" ou "Plataforma"). Estes Termos e Condições ("Termos") regem o uso do nosso website e serviços de apostas desportivas. Ao aceder ou utilizar a nossa plataforma, concorda em ficar vinculado a estes Termos. Se não concordar com qualquer parte destes Termos, não deverá utilizar os nossos serviços.

A BET62 opera sob licença emitida pelo Serviço de Regulação e Inspeção de Jogos (SRIJ) de Portugal, cumprindo todas as regulamentações aplicáveis ao jogo online em território português.`
    },
    {
      id: 'elegibilidade',
      title: '2. Elegibilidade e Registo',
      content: `Para utilizar os nossos serviços, deve:

• Ter pelo menos 18 anos de idade
• Ser residente legal em Portugal ou em jurisdição onde o jogo online seja permitido
• Fornecer informações verdadeiras, precisas e completas durante o registo
• Manter apenas uma conta ativa na plataforma
• Não estar auto-excluído de serviços de jogo

Reservamo-nos o direito de verificar a sua identidade e idade a qualquer momento. A criação de múltiplas contas resultará no encerramento imediato de todas as contas e confisco de fundos.`
    },
    {
      id: 'conta',
      title: '3. Gestão de Conta',
      content: `Ao criar uma conta na BET62, é responsável por:

• Manter a confidencialidade das suas credenciais de acesso
• Todas as atividades realizadas na sua conta
• Notificar-nos imediatamente de qualquer uso não autorizado
• Manter os seus dados de contacto atualizados

Podemos suspender ou encerrar a sua conta se:
• Violar estes Termos
• Suspeitar de atividade fraudulenta
• Fornecer informações falsas
• Utilizar a plataforma para fins ilegais`
    },
    {
      id: 'depositos',
      title: '4. Depósitos e Levantamentos',
      content: `Depósitos:
• Valor mínimo de depósito: €10
• Métodos aceites: Visa, Mastercard, MBWay, Multibanco, PayPal, Skrill
• Os depósitos são processados instantaneamente na maioria dos casos
• Todos os fundos devem provir de fontes legítimas

Levantamentos:
• Valor mínimo de levantamento: €20
• Tempo de processamento: 1-5 dias úteis dependendo do método
• Podemos solicitar documentos de verificação antes de processar levantamentos
• Os levantamentos serão feitos preferencialmente pelo mesmo método do depósito

Reservamo-nos o direito de reter levantamentos pendentes de verificação de identidade ou investigação de atividade suspeita.`
    },
    {
      id: 'apostas',
      title: '5. Regras de Apostas',
      content: `Regras Gerais:
• Todas as apostas são finais uma vez confirmadas
• As odds podem variar até ao momento da confirmação
• Apostas aceites são aquelas que aparecem no histórico da sua conta
• O valor máximo de aposta pode variar por evento e mercado

Liquidação de Apostas:
• As apostas são liquidadas com base nos resultados oficiais
• Em caso de evento cancelado ou adiado, aplicam-se regras específicas por desporto
• Erros evidentes nas odds podem resultar em anulação de apostas

Apostas Inválidas:
• Apostas feitas após o início do evento (exceto apostas ao vivo)
• Apostas em eventos com resultado conhecido
• Apostas que violem os limites estabelecidos`
    },
    {
      id: 'bonus',
      title: '6. Bónus e Promoções',
      content: `Os bónus e promoções estão sujeitos a termos específicos, incluindo:

• Requisitos de rollover antes de levantamento
• Prazo de validade do bónus
• Odds mínimas para apostas qualificantes
• Limites de ganhos máximos

Reservamo-nos o direito de:
• Modificar ou cancelar promoções a qualquer momento
• Excluir utilizadores que abusem de promoções
• Limitar a participação em promoções

O abuso de bónus, incluindo a criação de múltiplas contas ou apostas coordenadas, resultará na perda de bónus e possível encerramento de conta.`
    },
    {
      id: 'jogo-responsavel',
      title: '7. Jogo Responsável',
      content: `A BET62 está comprometida com o jogo responsável. Oferecemos:

Ferramentas de Controlo:
• Limites de depósito (diário, semanal, mensal)
• Limites de apostas
• Limites de perdas
• Auto-exclusão temporária ou permanente
• Alertas de tempo de jogo

Se sentir que o jogo está a afetar negativamente a sua vida:
• Utilize as nossas ferramentas de auto-exclusão
• Contacte a linha de apoio ao jogador: 800 123 456
• Visite www.jogoresponsavel.pt

Menores de 18 anos estão estritamente proibidos de utilizar os nossos serviços.`
    },
    {
      id: 'privacidade',
      title: '8. Privacidade e Proteção de Dados',
      content: `Tratamos os seus dados pessoais de acordo com o RGPD e a legislação portuguesa:

Dados Recolhidos:
• Informações de registo e identificação
• Dados de transações e apostas
• Informações de dispositivo e navegação
• Comunicações com o suporte

Utilização dos Dados:
• Prestação e melhoria dos serviços
• Cumprimento de obrigações legais
• Prevenção de fraude
• Marketing (com consentimento)

Os seus Direitos:
• Acesso aos seus dados
• Retificação de informações incorretas
• Eliminação de dados (quando aplicável)
• Portabilidade de dados
• Oposição ao tratamento

Para exercer os seus direitos, contacte: privacidade@bet62.pt`
    },
    {
      id: 'propriedade',
      title: '9. Propriedade Intelectual',
      content: `Todo o conteúdo da plataforma BET62, incluindo mas não limitado a:

• Logótipos, marcas e design
• Software e código fonte
• Textos, gráficos e imagens
• Base de dados e compilações

É propriedade exclusiva da BET62 ou dos seus licenciadores. É proibido:

• Copiar, modificar ou distribuir qualquer conteúdo
• Utilizar técnicas de scraping ou extração de dados
• Fazer engenharia reversa do software
• Utilizar a marca BET62 sem autorização`
    },
    {
      id: 'limitacao',
      title: '10. Limitação de Responsabilidade',
      content: `A BET62 não será responsável por:

• Perdas resultantes de apostas
• Interrupções de serviço por motivos técnicos ou de força maior
• Erros em informações fornecidas por terceiros
• Ações de terceiros não autorizados na sua conta
• Perdas indiretas ou consequenciais

A nossa responsabilidade máxima está limitada ao saldo disponível na sua conta no momento do incidente.

Fazemos todos os esforços para manter a plataforma operacional 24/7, mas não garantimos disponibilidade ininterrupta.`
    },
    {
      id: 'alteracoes',
      title: '11. Alterações aos Termos',
      content: `Reservamo-nos o direito de modificar estes Termos a qualquer momento. As alterações serão:

• Publicadas nesta página com a data de atualização
• Comunicadas por email para alterações significativas
• Efetivas imediatamente após publicação

O uso continuado da plataforma após alterações constitui aceitação dos novos Termos. Se não concordar com as alterações, deve cessar a utilização dos serviços e solicitar o encerramento da conta.`
    },
    {
      id: 'lei-aplicavel',
      title: '12. Lei Aplicável e Jurisdição',
      content: `Estes Termos são regidos pela lei portuguesa. Qualquer disputa será submetida à jurisdição exclusiva dos tribunais portugueses.

Para reclamações, pode contactar:
• Email: reclamacoes@bet62.pt
• Telefone: +351 800 123 456
• Entidade reguladora: SRIJ - Serviço de Regulação e Inspeção de Jogos

Encorajamos a resolução amigável de disputas antes de recorrer a meios judiciais.`
    },
    {
      id: 'contacto',
      title: '13. Contactos',
      content: `Para questões sobre estes Termos ou os nossos serviços:

BET62 - Apostas Desportivas
Email: suporte@bet62.pt
Telefone: +351 800 123 456
Horário: 24 horas, 7 dias por semana

Endereço para correspondência:
BET62 Lda.
Avenida da Liberdade, 110
1250-146 Lisboa, Portugal

NIF: 123 456 789`
    }
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Header />
      
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-amber-500/20">
        <div className="max-w-5xl mx-auto px-4 py-12 md:py-16">
          <div className="text-center">
            <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <i className="ri-file-text-line text-3xl text-amber-500"></i>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Termos e Condições
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Leia atentamente os termos que regem a utilização da plataforma BET62. 
              Ao utilizar os nossos serviços, concorda com estes termos.
            </p>
            <p className="text-sm text-amber-400/70 mt-4">
              Última atualização: 15 de Janeiro de 2025
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto px-4 py-8 md:py-12 w-full">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Table of Contents - Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-gray-900/50 rounded-xl border border-amber-500/20 p-4">
              <h3 className="font-semibold text-amber-400 mb-4 text-sm">Índice</h3>
              <nav className="space-y-1">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block text-xs text-gray-400 hover:text-amber-400 transition-colors py-1.5 border-l-2 border-transparent hover:border-amber-500 pl-3 cursor-pointer"
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="bg-gray-900/30 rounded-xl border border-amber-500/10 p-6 md:p-8 scroll-mt-24"
              >
                <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                  <span className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center mr-3">
                    <i className="ri-bookmark-line text-amber-500 text-sm"></i>
                  </span>
                  {section.title}
                </h2>
                <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                  {section.content}
                </div>
              </section>
            ))}

            {/* Agreement Notice */}
            <div className="bg-gradient-to-r from-amber-500/10 to-red-500/10 rounded-xl border border-amber-500/30 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-checkbox-circle-line text-2xl text-amber-500"></i>
                </div>
                <div>
                  <h3 className="font-bold text-white mb-2">Aceitação dos Termos</h3>
                  <p className="text-gray-400 text-sm">
                    Ao criar uma conta ou utilizar os serviços da BET62, confirma que leu, 
                    compreendeu e aceita ficar vinculado a estes Termos e Condições, bem como 
                    à nossa Política de Privacidade.
                  </p>
                </div>
              </div>
            </div>

            {/* Contact CTA */}
            <div className="bg-gray-900/50 rounded-xl border border-red-500/30 p-6 text-center">
              <h3 className="font-bold text-white mb-2">Tem dúvidas?</h3>
              <p className="text-gray-400 text-sm mb-4">
                A nossa equipa de suporte está disponível 24/7 para esclarecer qualquer questão.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a 
                  href="mailto:suporte@bet62.pt"
                  className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-lg hover:from-red-700 hover:to-red-800 transition-all cursor-pointer text-sm whitespace-nowrap"
                >
                  <i className="ri-mail-line mr-2"></i>
                  Enviar Email
                </a>
                <Link 
                  to="/"
                  className="px-6 py-2.5 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors cursor-pointer text-sm border border-amber-500/30 whitespace-nowrap"
                >
                  <i className="ri-arrow-left-line mr-2"></i>
                  Voltar ao Início
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
