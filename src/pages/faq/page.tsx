import { useState } from 'react';
import { Header } from '../../components/feature/Header';
import { Footer } from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  title: string;
  icon: string;
  questions: FAQItem[];
}

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const categories: FAQCategory[] = [
    {
      id: 'conta',
      title: 'Conta',
      icon: 'ri-user-line',
      questions: [
        {
          question: 'Como criar uma conta na BET62?',
          answer: 'Para criar uma conta, clique em "Registar" no topo da página, preencha o formulário com os seus dados pessoais (nome, email, data de nascimento, NIF) e crie uma palavra-passe segura. Após o registo, receberá um email de confirmação.'
        },
        {
          question: 'Como verificar a minha conta?',
          answer: 'A verificação da conta é obrigatória para levantamentos. Aceda ao seu perfil, clique em "Verificar Conta" e envie uma cópia do seu documento de identificação (Cartão de Cidadão ou Passaporte) e um comprovativo de morada recente. A verificação é processada em até 24 horas.'
        },
        {
          question: 'Esqueci-me da minha palavra-passe. O que fazer?',
          answer: 'Na página de login, clique em "Esqueci a palavra-passe". Introduza o seu email registado e receberá um link para redefinir a sua palavra-passe. O link é válido por 1 hora.'
        },
        {
          question: 'Como encerrar a minha conta?',
          answer: 'Para encerrar a conta, aceda ao seu perfil, vá a "Definições" e selecione "Encerrar Conta". Certifique-se de que não tem apostas pendentes ou saldo disponível. O encerramento é permanente e irreversível.'
        },
        {
          question: 'Posso ter mais de uma conta?',
          answer: 'Não. Cada utilizador pode ter apenas uma conta na BET62. A criação de múltiplas contas é proibida e resultará no encerramento de todas as contas e perda de fundos.'
        }
      ]
    },
    {
      id: 'depositos',
      title: 'Depósitos',
      icon: 'ri-wallet-line',
      questions: [
        {
          question: 'Quais os métodos de depósito disponíveis?',
          answer: 'Aceitamos Visa, Mastercard, MBWay, Multibanco, PayPal e Skrill. Todos os métodos são seguros e processados através de gateways de pagamento certificados.'
        },
        {
          question: 'Qual o valor mínimo e máximo de depósito?',
          answer: 'O depósito mínimo é de 10€ e o máximo é de 5.000€ por transação. Pode efetuar múltiplos depósitos, mas recomendamos definir limites de depósito responsáveis no seu perfil.'
        },
        {
          question: 'Quanto tempo demora um depósito?',
          answer: 'Os depósitos por cartão, MBWay e PayPal são instantâneos. Depósitos por Multibanco podem demorar até 30 minutos. Se o seu depósito não for creditado em 1 hora, contacte o suporte.'
        },
        {
          question: 'Há taxas nos depósitos?',
          answer: 'A BET62 não cobra taxas nos depósitos. No entanto, o seu banco ou provedor de pagamento pode aplicar taxas próprias. Verifique com a sua instituição financeira.'
        },
        {
          question: 'O meu depósito não foi creditado. O que fazer?',
          answer: 'Primeiro, verifique o seu email e extrato bancário para confirmar que o pagamento foi processado. Se sim, contacte o nosso suporte através do chat ao vivo ou email com o comprovativo de pagamento. Resolveremos em até 24 horas.'
        }
      ]
    },
    {
      id: 'levantamentos',
      title: 'Levantamentos',
      icon: 'ri-bank-card-line',
      questions: [
        {
          question: 'Como fazer um levantamento?',
          answer: 'Aceda a "Levantamento" no menu, selecione o método (transferência bancária ou carteira digital), introduza o valor e confirme. A sua conta deve estar verificada para processar levantamentos.'
        },
        {
          question: 'Qual o valor mínimo e máximo de levantamento?',
          answer: 'O levantamento mínimo é de 20€ e o máximo é de 10.000€ por transação. Para valores superiores, contacte o suporte para arranjos especiais.'
        },
        {
          question: 'Quanto tempo demora um levantamento?',
          answer: 'Levantamentos são processados em até 24 horas úteis após aprovação. Transferências bancárias podem demorar 1-3 dias úteis adicionais. Carteiras digitais são mais rápidas (até 24 horas).'
        },
        {
          question: 'Preciso verificar a conta para levantar?',
          answer: 'Sim. A verificação da conta é obrigatória por lei para prevenir fraude e lavagem de dinheiro. Envie os seus documentos através do perfil. A verificação demora até 24 horas.'
        },
        {
          question: 'Posso levantar para um método diferente do depósito?',
          answer: 'Por segurança, deve levantar para o mesmo método usado no depósito. Se não for possível, contacte o suporte para alternativas. Pode ser necessária verificação adicional.'
        }
      ]
    },
    {
      id: 'apostas',
      title: 'Apostas',
      icon: 'ri-football-line',
      questions: [
        {
          question: 'Como fazer uma aposta?',
          answer: 'Navegue pelos desportos disponíveis, selecione o evento e clique na odd desejada. A seleção será adicionada ao boletim de apostas à direita. Introduza o valor e clique em "Confirmar Aposta".'
        },
        {
          question: 'Que tipos de apostas estão disponíveis?',
          answer: 'Oferecemos apostas simples (uma seleção), múltiplas (várias seleções), sistema (combinações) e apostas ao vivo. Cada tipo tem regras específicas de liquidação.'
        },
        {
          question: 'Como funcionam as odds?',
          answer: 'As odds representam a probabilidade de um resultado e determinam o seu ganho potencial. Odds decimais (ex: 2.50) multiplicam o seu valor apostado. Ganho = Valor Apostado × Odd.'
        },
        {
          question: 'Quando são liquidadas as apostas?',
          answer: 'Apostas são liquidadas após o fim oficial do evento. Apostas ao vivo são liquidadas imediatamente após o resultado. Em caso de adiamento, a aposta é anulada e o valor devolvido.'
        },
        {
          question: 'Posso cancelar uma aposta?',
          answer: 'Não. Após confirmação, as apostas não podem ser canceladas ou alteradas. Verifique sempre os detalhes antes de confirmar. Em caso de erro técnico comprovado, contacte o suporte imediatamente.'
        },
        {
          question: 'O que é Cash Out?',
          answer: 'Cash Out permite liquidar a aposta antes do fim do evento, garantindo lucro ou minimizando perdas. O valor oferecido varia conforme o decorrer do jogo. Nem todas as apostas têm Cash Out disponível.'
        }
      ]
    },
    {
      id: 'bonus',
      title: 'Bónus e Promoções',
      icon: 'ri-gift-line',
      questions: [
        {
          question: 'Como funcionam os bónus de boas-vindas?',
          answer: 'Novos utilizadores recebem um bónus no primeiro depósito (ex: 100% até 100€). O bónus tem requisitos de rollover (ex: apostar 5x o valor) antes de poder ser levantado. Leia os termos completos.'
        },
        {
          question: 'O que são requisitos de rollover?',
          answer: 'Rollover é o número de vezes que deve apostar o valor do bónus antes de poder levantá-lo. Ex: Bónus de 50€ com rollover 5x = deve apostar 250€ em apostas qualificadas.'
        },
        {
          question: 'Quanto tempo tenho para usar um bónus?',
          answer: 'Cada bónus tem validade específica (geralmente 30 dias). Após expirar, o bónus e ganhos associados são removidos. Verifique os termos de cada promoção no seu perfil.'
        },
        {
          question: 'Posso ter vários bónus ativos?',
          answer: 'Não. Apenas um bónus pode estar ativo de cada vez. Complete os requisitos do bónus atual antes de ativar outro. Alguns bónus não são cumuláveis.'
        },
        {
          question: 'Como ativar um código promocional?',
          answer: 'No depósito ou perfil, encontrará um campo "Código Promocional". Introduza o código e clique em "Ativar". O bónus será creditado automaticamente se cumprir os requisitos.'
        }
      ]
    },
    {
      id: 'seguranca',
      title: 'Segurança',
      icon: 'ri-shield-check-line',
      questions: [
        {
          question: 'Como proteger a minha conta?',
          answer: 'Use uma palavra-passe forte e única, nunca a partilhe, ative a autenticação de dois fatores (2FA) no perfil, e faça logout após usar dispositivos partilhados. Nunca clique em links suspeitos.'
        },
        {
          question: 'O que é autenticação de dois fatores (2FA)?',
          answer: '2FA adiciona uma camada extra de segurança. Após ativar no perfil, precisará de um código do seu telemóvel (via SMS ou app) além da palavra-passe para fazer login.'
        },
        {
          question: 'Os meus dados estão seguros?',
          answer: 'Sim. Usamos encriptação SSL de 256 bits, servidores seguros certificados, e cumprimos o RGPD. Os seus dados nunca são partilhados com terceiros sem consentimento. Leia a nossa Política de Privacidade.'
        },
        {
          question: 'Suspeito de atividade não autorizada. O que fazer?',
          answer: 'Altere imediatamente a sua palavra-passe, contacte o suporte através do chat ao vivo ou email (suporte@bet62.pt), e bloqueie temporariamente a conta se necessário. Investigaremos em até 24 horas.'
        },
        {
          question: 'A BET62 é licenciada?',
          answer: 'Sim. Operamos sob licença do SRIJ (Serviço de Regulação e Inspeção de Jogos) em Portugal. A nossa licença garante operação legal, jogo justo e proteção do jogador.'
        }
      ]
    }
  ];

  const toggleItem = (categoryId: string, questionIndex: number) => {
    const itemId = `${categoryId}-${questionIndex}`;
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const filteredCategories = categories.map(category => ({
    ...category,
    questions: category.questions.filter(
      q =>
        q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.questions.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus('sending');

    try {
      const formElement = e.target as HTMLFormElement;
      const formDataToSend = new FormData(formElement);

      const response = await fetch('https://readdy.ai/api/form/d62jq7ahouo8d81brd10', {
        method: 'POST',
        body: new URLSearchParams(formDataToSend as any)
      });

      if (response.ok) {
        setFormStatus('success');
        setFormData({ name: '', email: '', subject: '', message: '' });
        setTimeout(() => setFormStatus('idle'), 5000);
      } else {
        setFormStatus('error');
      }
    } catch {
      setFormStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Header />

      <main className="flex-1 pt-20 pb-24 lg:pb-12">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-amber-600/20 via-gray-900 to-red-600/20 border-b border-amber-500/30">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16 text-center">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-500/30">
              <i className="ri-question-answer-line text-3xl md:text-4xl text-amber-500"></i>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white mb-4">
              Centro de Ajuda
            </h1>
            <p className="text-base md:text-lg text-gray-300 max-w-2xl mx-auto mb-8">
              Encontre respostas rápidas para as suas questões sobre apostas, conta, pagamentos e muito mais
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto relative">
              <input
                type="text"
                placeholder="Pesquisar perguntas frequentes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-6 py-4 bg-gray-900 border border-amber-500/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 text-sm md:text-base"
              />
              <i className="ri-search-line absolute right-6 top-1/2 -translate-y-1/2 text-xl text-amber-500"></i>
            </div>
          </div>
        </div>

        {/* FAQ Categories */}
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
          {searchQuery && filteredCategories.length === 0 ? (
            <div className="text-center py-12">
              <i className="ri-search-line text-5xl text-gray-600 mb-4"></i>
              <h3 className="text-xl font-bold text-white mb-2">Nenhum resultado encontrado</h3>
              <p className="text-gray-400">Tente pesquisar com outras palavras-chave ou contacte o suporte</p>
            </div>
          ) : (
            <div className="space-y-8">
              {(searchQuery ? filteredCategories : categories).map((category) => (
                <div key={category.id} className="bg-gray-900 border border-amber-500/20 rounded-xl overflow-hidden">
                  {/* Category Header */}
                  <div className="bg-gradient-to-r from-amber-600/10 to-red-600/10 px-6 py-4 border-b border-amber-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                        <i className={`${category.icon} text-lg text-amber-500`}></i>
                      </div>
                      <h2 className="text-xl font-bold text-white">{category.title}</h2>
                      <span className="ml-auto text-sm text-gray-400">
                        {category.questions.length} {category.questions.length === 1 ? 'pergunta' : 'perguntas'}
                      </span>
                    </div>
                  </div>

                  {/* Questions */}
                  <div className="divide-y divide-amber-500/10">
                    {category.questions.map((item, index) => {
                      const itemId = `${category.id}-${index}`;
                      const isExpanded = expandedItems.includes(itemId);

                      return (
                        <div key={index} className="px-6 py-4">
                          <button
                            onClick={() => toggleItem(category.id, index)}
                            className="w-full flex items-start justify-between gap-4 text-left cursor-pointer group"
                          >
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-white group-hover:text-amber-400 transition-colors">
                                {item.question}
                              </h3>
                            </div>
                            <div className={`w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                              <i className="ri-arrow-down-s-line text-lg text-amber-500"></i>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="mt-4 pl-0 md:pl-4">
                              <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/50 p-4 rounded-lg border border-amber-500/10">
                                {item.answer}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contact Form Section */}
          <div className="mt-12 bg-gradient-to-br from-red-600/10 via-gray-900 to-red-700/10 border border-red-500/40 rounded-xl p-6 md:p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/40">
                <i className="ri-customer-service-2-line text-3xl text-red-400"></i>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                Não encontrou a resposta?
              </h2>
              <p className="text-gray-300 text-sm md:text-base">
                Envie-nos a sua questão e responderemos em até 24 horas
              </p>
            </div>

            <form 
              id="faq-contact-form"
              data-readdy-form
              onSubmit={handleSubmit} 
              className="max-w-2xl mx-auto space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-red-500/40 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500 text-sm"
                    placeholder="O seu nome"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-900 border border-amber-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 text-sm"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Assunto *
                </label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                  className="w-full px-4 py-3 bg-gray-900 border border-amber-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 text-sm"
                  placeholder="Resumo da sua questão"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Mensagem *
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) {
                      setFormData({ ...formData, message: e.target.value });
                    }
                  }}
                  required
                  maxLength={500}
                  rows={6}
                  className="w-full px-4 py-3 bg-gray-900 border border-amber-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 text-sm resize-none"
                  placeholder="Descreva a sua questão em detalhe..."
                />
                <p className="text-xs text-gray-500 mt-2">
                  {formData.message.length}/500 caracteres
                </p>
              </div>

              {formStatus === 'success' && (
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 flex items-center gap-3">
                  <i className="ri-checkbox-circle-line text-2xl text-green-500"></i>
                  <div>
                    <p className="text-sm font-semibold text-green-400">Mensagem enviada com sucesso!</p>
                    <p className="text-xs text-green-300">Responderemos em breve para o seu email.</p>
                  </div>
                </div>
              )}

              {formStatus === 'error' && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
                  <i className="ri-error-warning-line text-2xl text-red-500"></i>
                  <div>
                    <p className="text-sm font-semibold text-red-400">Erro ao enviar mensagem</p>
                    <p className="text-xs text-red-300">Tente novamente ou contacte suporte@bet62.pt</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={formStatus === 'sending'}
                className="w-full px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white font-bold rounded-lg hover:from-red-700 hover:to-red-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {formStatus === 'sending' ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="ri-loader-4-line animate-spin"></i>
                    A enviar...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <i className="ri-send-plane-line"></i>
                    Enviar Mensagem
                  </span>
                )}
              </button>
            </form>
          </div>

          {/* Quick Contact Options */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-900 border border-red-600/30 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-red-600/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                <i className="ri-chat-3-line text-2xl text-red-400"></i>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Chat ao Vivo</h3>
              <p className="text-sm text-gray-400 mb-4">Resposta imediata 24/7</p>
              <button className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm whitespace-nowrap cursor-pointer">
                Iniciar Chat
              </button>
            </div>

            <div className="bg-gray-900 border border-red-600/30 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-red-600/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                <i className="ri-mail-line text-2xl text-red-400"></i>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Email</h3>
              <p className="text-sm text-gray-400 mb-4">Resposta em até 24 horas</p>
              <a 
                href="mailto:suporte@bet62.pt"
                className="inline-block px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm whitespace-nowrap cursor-pointer"
              >
                suporte@bet62.pt
              </a>
            </div>

            <div className="bg-gray-900 border border-red-600/30 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-red-600/15 rounded-xl flex items-center justify-center mx-auto mb-4">
                <i className="ri-phone-line text-2xl text-red-400"></i>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Telefone</h3>
              <p className="text-sm text-gray-400 mb-4">Disponível 24/7</p>
              <a 
                href="tel:+351800123456"
                className="inline-block px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm whitespace-nowrap cursor-pointer"
              >
                +351 800 123 456
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
