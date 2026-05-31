import { useState } from 'react';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';

export default function PrivacyPage() {
  const [activeSection, setActiveSection] = useState('introducao');

  const sections = [
    { id: 'introducao', title: 'Introdução', icon: 'ri-information-line' },
    { id: 'responsavel', title: 'Responsável pelo Tratamento', icon: 'ri-building-line' },
    { id: 'dados-recolhidos', title: 'Dados Pessoais Recolhidos', icon: 'ri-file-list-3-line' },
    { id: 'finalidades', title: 'Finalidades do Tratamento', icon: 'ri-target-line' },
    { id: 'base-legal', title: 'Base Legal', icon: 'ri-scales-3-line' },
    { id: 'partilha', title: 'Partilha de Dados', icon: 'ri-share-line' },
    { id: 'transferencias', title: 'Transferências Internacionais', icon: 'ri-global-line' },
    { id: 'retencao', title: 'Período de Retenção', icon: 'ri-time-line' },
    { id: 'direitos', title: 'Direitos dos Titulares', icon: 'ri-shield-user-line' },
    { id: 'cookies', title: 'Cookies e Tecnologias', icon: 'ri-cookie-line' },
    { id: 'seguranca', title: 'Segurança dos Dados', icon: 'ri-lock-line' },
    { id: 'alteracoes', title: 'Alterações à Política', icon: 'ri-refresh-line' },
    { id: 'contactos', title: 'Contactos', icon: 'ri-mail-line' }
  ];

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header />

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
              <i className="ri-shield-check-line text-4xl"></i>
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold">Política de Privacidade</h1>
              <p className="text-teal-100 mt-2">Última atualização: 1 de Janeiro de 2025</p>
            </div>
          </div>
          <p className="text-lg text-teal-50 max-w-3xl">
            A BET62 está comprometida com a proteção dos seus dados pessoais e com a transparência no tratamento da informação, em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD).
          </p>
        </div>
      </div>

      <main className="flex-1 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-24">
                <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center">
                  <i className="ri-list-check text-teal-600 mr-2"></i>
                  Índice
                </h3>
                <nav className="space-y-1">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer whitespace-nowrap ${
                        activeSection === section.id
                          ? 'bg-teal-50 text-teal-700 font-semibold'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <i className={`${section.icon} mr-2 text-xs`}></i>
                      {section.title}
                    </button>
                  ))}
                </nav>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-6">
              {/* Introdução */}
              <section id="introducao" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-information-line text-teal-600 mr-3"></i>
                  Introdução
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>
                    A presente Política de Privacidade descreve como a <strong>BET62</strong> (doravante "nós", "nosso" ou "Plataforma") recolhe, utiliza, armazena e protege os dados pessoais dos utilizadores dos nossos serviços de apostas desportivas online.
                  </p>
                  <p>
                    Ao utilizar a nossa plataforma, o utilizador consente com as práticas descritas nesta política. Recomendamos a leitura atenta deste documento para compreender como tratamos os seus dados pessoais.
                  </p>
                  <div className="bg-teal-50 border-l-4 border-teal-600 p-4 rounded">
                    <p className="text-sm font-semibold text-teal-900 mb-1">
                      <i className="ri-information-line mr-1"></i>
                      Compromisso com a Privacidade
                    </p>
                    <p className="text-sm text-teal-800">
                      A proteção dos seus dados pessoais é uma prioridade. Implementamos medidas técnicas e organizacionais adequadas para garantir a segurança e confidencialidade da informação.
                    </p>
                  </div>
                </div>
              </section>

              {/* Responsável pelo Tratamento */}
              <section id="responsavel" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-building-line text-teal-600 mr-3"></i>
                  Responsável pelo Tratamento de Dados
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>O responsável pelo tratamento dos dados pessoais é:</p>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <p><strong>Entidade:</strong> BET62 - Apostas Desportivas, Lda.</p>
                    <p><strong>Morada:</strong> Avenida da Liberdade, 123, 1250-096 Lisboa, Portugal</p>
                    <p><strong>NIF:</strong> 123456789</p>
                    <p><strong>Email:</strong> privacidade@bet62.pt</p>
                    <p><strong>Telefone:</strong> +351 800 123 456</p>
                  </div>
                  <p>
                    Para questões relacionadas com a proteção de dados, pode contactar o nosso Encarregado de Proteção de Dados (DPO) através do email: <strong>dpo@bet62.pt</strong>
                  </p>
                </div>
              </section>

              {/* Dados Pessoais Recolhidos */}
              <section id="dados-recolhidos" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-file-list-3-line text-teal-600 mr-3"></i>
                  Dados Pessoais Recolhidos
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>Recolhemos as seguintes categorias de dados pessoais:</p>
                  
                  <div className="space-y-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-bold text-gray-900 mb-2 flex items-center">
                        <i className="ri-user-line text-teal-600 mr-2"></i>
                        Dados de Identificação
                      </h3>
                      <ul className="list-disc list-inside text-sm space-y-1 text-gray-700">
                        <li>Nome completo</li>
                        <li>Data de nascimento</li>
                        <li>Número de identificação fiscal (NIF)</li>
                        <li>Número e cópia do documento de identificação</li>
                        <li>Nacionalidade</li>
                      </ul>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-bold text-gray-900 mb-2 flex items-center">
                        <i className="ri-mail-line text-teal-600 mr-2"></i>
                        Dados de Contacto
                      </h3>
                      <ul className="list-disc list-inside text-sm space-y-1 text-gray-700">
                        <li>Endereço de email</li>
                        <li>Número de telefone</li>
                        <li>Morada completa</li>
                      </ul>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-bold text-gray-900 mb-2 flex items-center">
                        <i className="ri-bank-card-line text-teal-600 mr-2"></i>
                        Dados Financeiros
                      </h3>
                      <ul className="list-disc list-inside text-sm space-y-1 text-gray-700">
                        <li>Informações de pagamento (últimos 4 dígitos do cartão)</li>
                        <li>Histórico de transações</li>
                        <li>Dados bancários para levantamentos</li>
                      </ul>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-bold text-gray-900 mb-2 flex items-center">
                        <i className="ri-computer-line text-teal-600 mr-2"></i>
                        Dados de Utilização
                      </h3>
                      <ul className="list-disc list-inside text-sm space-y-1 text-gray-700">
                        <li>Endereço IP</li>
                        <li>Tipo de navegador e dispositivo</li>
                        <li>Páginas visitadas e tempo de navegação</li>
                        <li>Histórico de apostas</li>
                        <li>Preferências de jogo</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Finalidades do Tratamento */}
              <section id="finalidades" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-target-line text-teal-600 mr-3"></i>
                  Finalidades do Tratamento
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>Os seus dados pessoais são tratados para as seguintes finalidades:</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-teal-50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <i className="ri-user-add-line text-teal-600 text-xl mt-1"></i>
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">Gestão de Conta</h4>
                          <p className="text-sm text-gray-700">Criação, manutenção e gestão da sua conta de utilizador.</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <i className="ri-shield-check-line text-teal-600 text-xl mt-1"></i>
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">Verificação de Identidade</h4>
                          <p className="text-sm text-gray-700">Cumprimento de obrigações legais KYC (Know Your Customer).</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <i className="ri-money-euro-circle-line text-teal-600 text-xl mt-1"></i>
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">Processamento de Pagamentos</h4>
                          <p className="text-sm text-gray-700">Gestão de depósitos, levantamentos e transações financeiras.</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <i className="ri-ticket-line text-teal-600 text-xl mt-1"></i>
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">Prestação de Serviços</h4>
                          <p className="text-sm text-gray-700">Disponibilização de apostas desportivas e funcionalidades da plataforma.</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <i className="ri-customer-service-2-line text-teal-600 text-xl mt-1"></i>
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">Suporte ao Cliente</h4>
                          <p className="text-sm text-gray-700">Resposta a pedidos de informação e resolução de problemas.</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <i className="ri-mail-send-line text-teal-600 text-xl mt-1"></i>
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">Marketing</h4>
                          <p className="text-sm text-gray-700">Envio de promoções e ofertas personalizadas (com consentimento).</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <i className="ri-shield-user-line text-teal-600 text-xl mt-1"></i>
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">Jogo Responsável</h4>
                          <p className="text-sm text-gray-700">Monitorização de padrões de jogo e prevenção de comportamentos de risco.</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <i className="ri-scales-3-line text-teal-600 text-xl mt-1"></i>
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1">Cumprimento Legal</h4>
                          <p className="text-sm text-gray-700">Conformidade com obrigações legais e regulamentares.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Base Legal */}
              <section id="base-legal" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-scales-3-line text-teal-600 mr-3"></i>
                  Base Legal do Tratamento
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>O tratamento dos seus dados pessoais baseia-se nos seguintes fundamentos legais:</p>
                  
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-checkbox-circle-line text-teal-600 text-xl mt-0.5"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900">Execução de Contrato</h4>
                        <p className="text-sm text-gray-700">Necessário para a prestação dos serviços de apostas solicitados.</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-checkbox-circle-line text-teal-600 text-xl mt-0.5"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900">Obrigação Legal</h4>
                        <p className="text-sm text-gray-700">Cumprimento de obrigações legais em matéria de prevenção de branqueamento de capitais, fiscalidade e regulação do jogo.</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-checkbox-circle-line text-teal-600 text-xl mt-0.5"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900">Consentimento</h4>
                        <p className="text-sm text-gray-700">Para comunicações de marketing e utilização de cookies não essenciais.</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-checkbox-circle-line text-teal-600 text-xl mt-0.5"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900">Interesse Legítimo</h4>
                        <p className="text-sm text-gray-700">Prevenção de fraude, segurança da plataforma e melhoria dos serviços.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Partilha de Dados */}
              <section id="partilha" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-share-line text-teal-600 mr-3"></i>
                  Partilha de Dados com Terceiros
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>Os seus dados pessoais podem ser partilhados com as seguintes entidades:</p>
                  
                  <div className="space-y-4">
                    <div className="border-l-4 border-teal-600 pl-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Prestadores de Serviços de Pagamento</h4>
                      <p className="text-sm text-gray-700">Stripe, PayPal, MBWay e outros processadores de pagamento para gestão de transações financeiras.</p>
                    </div>

                    <div className="border-l-4 border-teal-600 pl-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Fornecedores de Tecnologia</h4>
                      <p className="text-sm text-gray-700">Serviços de alojamento (Supabase), análise de dados e infraestrutura técnica.</p>
                    </div>

                    <div className="border-l-4 border-teal-600 pl-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Autoridades Reguladoras</h4>
                      <p className="text-sm text-gray-700">SRIJ (Serviço de Regulação e Inspeção de Jogos) e outras entidades reguladoras quando legalmente exigido.</p>
                    </div>

                    <div className="border-l-4 border-teal-600 pl-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Autoridades Fiscais</h4>
                      <p className="text-sm text-gray-700">Autoridade Tributária e Aduaneira para cumprimento de obrigações fiscais.</p>
                    </div>

                    <div className="border-l-4 border-teal-600 pl-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Parceiros de Marketing</h4>
                      <p className="text-sm text-gray-700">Apenas com o seu consentimento explícito para campanhas promocionais.</p>
                    </div>
                  </div>

                  <div className="bg-amber-50 border-l-4 border-amber-600 p-4 rounded">
                    <p className="text-sm font-semibold text-amber-900 mb-1">
                      <i className="ri-alert-line mr-1"></i>
                      Garantia de Proteção
                    </p>
                    <p className="text-sm text-amber-800">
                      Todos os terceiros com quem partilhamos dados estão contratualmente obrigados a proteger a sua informação e a utilizá-la apenas para as finalidades especificadas.
                    </p>
                  </div>
                </div>
              </section>

              {/* Transferências Internacionais */}
              <section id="transferencias" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-global-line text-teal-600 mr-3"></i>
                  Transferências Internacionais de Dados
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>
                    Alguns dos nossos prestadores de serviços podem estar localizados fora do Espaço Económico Europeu (EEE). Nestes casos, garantimos que:
                  </p>
                  
                  <ul className="list-disc list-inside space-y-2 text-sm">
                    <li>As transferências são realizadas para países com decisão de adequação da Comissão Europeia</li>
                    <li>São implementadas cláusulas contratuais-tipo aprovadas pela Comissão Europeia</li>
                    <li>Existem garantias adequadas de proteção de dados equivalentes ao RGPD</li>
                  </ul>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Principais Transferências:</h4>
                    <ul className="text-sm space-y-1 text-gray-700">
                      <li><strong>Estados Unidos:</strong> Stripe (certificado Privacy Shield / cláusulas contratuais-tipo)</li>
                      <li><strong>Reino Unido:</strong> Serviços de cloud computing (decisão de adequação)</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* Período de Retenção */}
              <section id="retencao" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-time-line text-teal-600 mr-3"></i>
                  Período de Retenção de Dados
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>Os seus dados pessoais são conservados durante os seguintes períodos:</p>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                      <thead className="bg-teal-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">Tipo de Dados</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">Período de Retenção</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        <tr>
                          <td className="px-4 py-3">Dados de conta ativa</td>
                          <td className="px-4 py-3">Durante a vigência da conta</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3">Histórico de apostas</td>
                          <td className="px-4 py-3">5 anos após encerramento da conta</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3">Transações financeiras</td>
                          <td className="px-4 py-3">10 anos (obrigação legal fiscal)</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3">Documentos de identificação</td>
                          <td className="px-4 py-3">5 anos após encerramento da conta</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3">Comunicações de marketing</td>
                          <td className="px-4 py-3">Até revogação do consentimento</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3">Dados de navegação (cookies)</td>
                          <td className="px-4 py-3">Até 13 meses</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="text-sm">
                    Após o término dos períodos de retenção, os dados são eliminados de forma segura ou anonimizados para fins estatísticos.
                  </p>
                </div>
              </section>

              {/* Direitos dos Titulares */}
              <section id="direitos" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-shield-user-line text-teal-600 mr-3"></i>
                  Direitos dos Titulares dos Dados
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>Nos termos do RGPD, tem os seguintes direitos:</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                      <div className="flex items-start space-x-3">
                        <i className="ri-eye-line text-teal-600 text-2xl"></i>
                        <div>
                          <h4 className="font-bold text-gray-900 mb-1">Direito de Acesso</h4>
                          <p className="text-sm text-gray-700">Obter confirmação sobre o tratamento dos seus dados e aceder aos mesmos.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                      <div className="flex items-start space-x-3">
                        <i className="ri-edit-line text-teal-600 text-2xl"></i>
                        <div>
                          <h4 className="font-bold text-gray-900 mb-1">Direito de Retificação</h4>
                          <p className="text-sm text-gray-700">Corrigir dados pessoais inexatos ou incompletos.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                      <div className="flex items-start space-x-3">
                        <i className="ri-delete-bin-line text-teal-600 text-2xl"></i>
                        <div>
                          <h4 className="font-bold text-gray-900 mb-1">Direito ao Apagamento</h4>
                          <p className="text-sm text-gray-700">Solicitar a eliminação dos seus dados pessoais ("direito a ser esquecido").</p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                      <div className="flex items-start space-x-3">
                        <i className="ri-forbid-line text-teal-600 text-2xl"></i>
                        <div>
                          <h4 className="font-bold text-gray-900 mb-1">Direito à Limitação</h4>
                          <p className="text-sm text-gray-700">Restringir o tratamento dos seus dados em determinadas circunstâncias.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                      <div className="flex items-start space-x-3">
                        <i className="ri-download-line text-teal-600 text-2xl"></i>
                        <div>
                          <h4 className="font-bold text-gray-900 mb-1">Direito à Portabilidade</h4>
                          <p className="text-sm text-gray-700">Receber os seus dados num formato estruturado e transmiti-los a outro responsável.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                      <div className="flex items-start space-x-3">
                        <i className="ri-close-circle-line text-teal-600 text-2xl"></i>
                        <div>
                          <h4 className="font-bold text-gray-900 mb-1">Direito de Oposição</h4>
                          <p className="text-sm text-gray-700">Opor-se ao tratamento dos seus dados para fins de marketing direto.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                      <div className="flex items-start space-x-3">
                        <i className="ri-user-unfollow-line text-teal-600 text-2xl"></i>
                        <div>
                          <h4 className="font-bold text-gray-900 mb-1">Retirar Consentimento</h4>
                          <p className="text-sm text-gray-700">Retirar o consentimento a qualquer momento, sem afetar a licitude do tratamento anterior.</p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                      <div className="flex items-start space-x-3">
                        <i className="ri-file-warning-line text-teal-600 text-2xl"></i>
                        <div>
                          <h4 className="font-bold text-gray-900 mb-1">Direito de Reclamação</h4>
                          <p className="text-sm text-gray-700">Apresentar reclamação junto da autoridade de controlo (CNPD).</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-teal-50 border-l-4 border-teal-600 p-4 rounded mt-4">
                    <h4 className="font-semibold text-teal-900 mb-2">Como Exercer os Seus Direitos:</h4>
                    <p className="text-sm text-teal-800 mb-2">
                      Para exercer qualquer um destes direitos, contacte-nos através de:
                    </p>
                    <ul className="text-sm text-teal-800 space-y-1">
                      <li><strong>Email:</strong> privacidade@bet62.pt ou dpo@bet62.pt</li>
                      <li><strong>Formulário:</strong> Disponível na sua área de perfil</li>
                      <li><strong>Correio:</strong> Avenida da Liberdade, 123, 1250-096 Lisboa</li>
                    </ul>
                    <p className="text-sm text-teal-800 mt-2">
                      Responderemos ao seu pedido no prazo de <strong>30 dias</strong>.
                    </p>
                  </div>
                </div>
              </section>

              {/* Cookies */}
              <section id="cookies" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-cookie-line text-teal-600 mr-3"></i>
                  Cookies e Tecnologias Similares
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>
                    Utilizamos cookies e tecnologias similares para melhorar a sua experiência na plataforma, personalizar conteúdos e analisar o tráfego.
                  </p>
                  
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                        <i className="ri-checkbox-circle-fill text-green-600 mr-2"></i>
                        Cookies Essenciais
                      </h4>
                      <p className="text-sm text-gray-700">Necessários para o funcionamento básico da plataforma (autenticação, segurança). Não requerem consentimento.</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                        <i className="ri-line-chart-line text-blue-600 mr-2"></i>
                        Cookies Analíticos
                      </h4>
                      <p className="text-sm text-gray-700">Permitem analisar a utilização da plataforma e melhorar o desempenho (Google Analytics).</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                        <i className="ri-advertisement-line text-purple-600 mr-2"></i>
                        Cookies de Marketing
                      </h4>
                      <p className="text-sm text-gray-700">Utilizados para apresentar publicidade relevante e medir a eficácia de campanhas.</p>
                    </div>
                  </div>

                  <p className="text-sm">
                    Pode gerir as suas preferências de cookies nas definições do seu navegador ou através do nosso painel de gestão de cookies.
                  </p>
                </div>
              </section>

              {/* Segurança */}
              <section id="seguranca" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-lock-line text-teal-600 mr-3"></i>
                  Segurança dos Dados
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>
                    Implementamos medidas técnicas e organizacionais adequadas para proteger os seus dados pessoais contra acesso não autorizado, perda, destruição ou alteração:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-shield-check-line text-green-600 text-xl"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Encriptação SSL/TLS</h4>
                        <p className="text-xs text-gray-700">Todas as comunicações são encriptadas.</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-lock-password-line text-green-600 text-xl"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Autenticação Forte</h4>
                        <p className="text-xs text-gray-700">Senhas encriptadas e autenticação de dois fatores.</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-database-2-line text-green-600 text-xl"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Backups Regulares</h4>
                        <p className="text-xs text-gray-700">Cópias de segurança automáticas e encriptadas.</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-shield-user-line text-green-600 text-xl"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Controlo de Acessos</h4>
                        <p className="text-xs text-gray-700">Acesso restrito apenas a pessoal autorizado.</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-bug-line text-green-600 text-xl"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Testes de Segurança</h4>
                        <p className="text-xs text-gray-700">Auditorias e testes de penetração regulares.</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <i className="ri-eye-off-line text-green-600 text-xl"></i>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Anonimização</h4>
                        <p className="text-xs text-gray-700">Dados sensíveis anonimizados quando possível.</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border-l-4 border-amber-600 p-4 rounded">
                    <p className="text-sm font-semibold text-amber-900 mb-1">
                      <i className="ri-alert-line mr-1"></i>
                      Notificação de Violações
                    </p>
                    <p className="text-sm text-amber-800">
                      Em caso de violação de dados que possa representar um risco elevado para os seus direitos, notificaremos a autoridade de controlo e os titulares afetados no prazo de 72 horas.
                    </p>
                  </div>
                </div>
              </section>

              {/* Alterações */}
              <section id="alteracoes" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-refresh-line text-teal-600 mr-3"></i>
                  Alterações à Política de Privacidade
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>
                    Reservamo-nos o direito de atualizar esta Política de Privacidade periodicamente para refletir alterações nas nossas práticas, tecnologias ou requisitos legais.
                  </p>
                  
                  <div className="bg-teal-50 rounded-lg p-4">
                    <h4 className="font-semibold text-teal-900 mb-2">Notificação de Alterações:</h4>
                    <ul className="text-sm text-teal-800 space-y-1 list-disc list-inside">
                      <li>Alterações significativas serão comunicadas por email</li>
                      <li>A data da última atualização será sempre indicada no topo da página</li>
                      <li>Recomendamos a consulta regular desta política</li>
                      <li>A continuação da utilização após alterações constitui aceitação das mesmas</li>
                    </ul>
                  </div>

                  <p className="text-sm font-semibold">
                    Versão atual: 1.0 | Última atualização: 1 de Janeiro de 2025
                  </p>
                </div>
              </section>

              {/* Contactos */}
              <section id="contactos" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <i className="ri-mail-line text-teal-600 mr-3"></i>
                  Contactos
                </h2>
                <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                  <p>
                    Para questões relacionadas com a proteção de dados pessoais ou para exercer os seus direitos, contacte-nos:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-teal-50 rounded-lg p-4">
                      <h4 className="font-bold text-teal-900 mb-3 flex items-center">
                        <i className="ri-building-line mr-2"></i>
                        Responsável pelo Tratamento
                      </h4>
                      <div className="space-y-2 text-sm text-teal-800">
                        <p><strong>Entidade:</strong> BET62 - Apostas Desportivas, Lda.</p>
                        <p><strong>Morada:</strong> Avenida da Liberdade, 123<br/>1250-096 Lisboa, Portugal</p>
                        <p><strong>Email:</strong> privacidade@bet62.pt</p>
                        <p><strong>Telefone:</strong> +351 800 123 456</p>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4">
                      <h4 className="font-bold text-teal-900 mb-3 flex items-center">
                        <i className="ri-shield-user-line mr-2"></i>
                        Encarregado de Proteção de Dados (DPO)
                      </h4>
                      <div className="space-y-2 text-sm text-teal-800">
                        <p><strong>Nome:</strong> Dr. João Silva</p>
                        <p><strong>Email:</strong> dpo@bet62.pt</p>
                        <p><strong>Telefone:</strong> +351 800 123 457</p>
                        <p className="pt-2 border-t border-teal-200">
                          <strong>Horário:</strong> Segunda a Sexta<br/>09:00 - 18:00
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                      <i className="ri-government-line text-gray-700 mr-2"></i>
                      Autoridade de Controlo
                    </h4>
                    <p className="text-sm text-gray-700 mb-2">
                      Tem o direito de apresentar reclamação junto da Comissão Nacional de Proteção de Dados (CNPD):
                    </p>
                    <div className="text-sm text-gray-700 space-y-1">
                      <p><strong>Morada:</strong> Av. D. Carlos I, 134, 1º, 1200-651 Lisboa</p>
                      <p><strong>Telefone:</strong> +351 213 928 400</p>
                      <p><strong>Email:</strong> geral@cnpd.pt</p>
                      <p><strong>Website:</strong> <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline cursor-pointer">www.cnpd.pt</a></p>
                    </div>
                  </div>
                </div>
              </section>

              {/* CTA Final */}
              <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-xl p-6 text-white text-center">
                <i className="ri-shield-check-line text-5xl mb-3"></i>
                <h3 className="text-2xl font-bold mb-2">A Sua Privacidade é a Nossa Prioridade</h3>
                <p className="text-teal-50 mb-4">
                  Estamos comprometidos com a proteção dos seus dados pessoais e com a transparência no tratamento da informação.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <a
                    href="mailto:privacidade@bet62.pt"
                    className="px-6 py-3 bg-white text-teal-600 rounded-lg font-semibold hover:bg-teal-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-mail-line mr-2"></i>
                    Contactar DPO
                  </a>
                  <button
                    onClick={() => scrollToSection('direitos')}
                    className="px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-shield-user-line mr-2"></i>
                    Ver os Meus Direitos
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
