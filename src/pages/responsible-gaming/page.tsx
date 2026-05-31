import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import { MobileBottomNav } from '../../components/feature/MobileBottomNav';

export default function ResponsibleGamingPage() {
  const [testAnswers, setTestAnswers] = useState<Record<number, number>>({});
  const [testResult, setTestResult] = useState<number | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);

  const testQuestions = [
    {
      id: 1,
      question: 'Com que frequência aposta mais do que pode pagar?',
      options: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre']
    },
    {
      id: 2,
      question: 'Sente necessidade de apostar com quantias cada vez maiores?',
      options: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre']
    },
    {
      id: 3,
      question: 'Já tentou parar ou reduzir as apostas sem sucesso?',
      options: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre']
    },
    {
      id: 4,
      question: 'Fica inquieto ou irritado quando tenta parar de apostar?',
      options: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre']
    },
    {
      id: 5,
      question: 'Aposta para escapar de problemas ou sentimentos negativos?',
      options: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre']
    },
    {
      id: 6,
      question: 'Volta a apostar no dia seguinte para recuperar perdas?',
      options: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre']
    },
    {
      id: 7,
      question: 'Mente a familiares sobre o quanto aposta?',
      options: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre']
    },
    {
      id: 8,
      question: 'As apostas causaram problemas financeiros ou relacionais?',
      options: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre']
    }
  ];

  const handleTestAnswer = (questionId: number, answerIndex: number) => {
    setTestAnswers(prev => ({ ...prev, [questionId]: answerIndex }));
  };

  const calculateTestResult = () => {
    const total = Object.values(testAnswers).reduce((sum, val) => sum + val, 0);
    setTestResult(total);
    setShowTestResult(true);
  };

  const getTestResultMessage = (score: number) => {
    if (score <= 8) {
      return {
        level: 'Baixo Risco',
        color: 'green',
        message: 'Os seus hábitos de jogo parecem estar sob controlo. Continue a jogar de forma responsável e estabeleça limites preventivos.',
        icon: 'ri-checkbox-circle-fill'
      };
    } else if (score <= 16) {
      return {
        level: 'Risco Moderado',
        color: 'amber',
        message: 'Alguns dos seus comportamentos podem indicar risco. Considere definir limites mais rigorosos e monitorizar os seus hábitos de jogo.',
        icon: 'ri-alert-fill'
      };
    } else {
      return {
        level: 'Risco Elevado',
        color: 'red',
        message: 'Os seus hábitos de jogo podem estar a tornar-se problemáticos. Recomendamos fortemente que procure ajuda profissional e considere a auto-exclusão.',
        icon: 'ri-error-warning-fill'
      };
    }
  };

  const isTestComplete = Object.keys(testAnswers).length === testQuestions.length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header />

      <main className="flex-1 pb-24 lg:pb-0">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-teal-600 to-cyan-700 text-white py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                <i className="ri-heart-pulse-line text-4xl"></i>
              </div>
              <div>
                <h1 className="text-4xl font-bold mb-2">Jogo Responsável</h1>
                <p className="text-teal-100 text-lg">O jogo deve ser sempre uma forma de entretenimento, nunca um problema</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-12">
          {/* O que é Jogo Responsável */}
          <section className="mb-12">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-14 h-14 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-information-line text-teal-600 text-3xl"></i>
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">O que é Jogo Responsável?</h2>
                  <p className="text-gray-700 text-lg leading-relaxed mb-4">
                    Jogo responsável significa apostar de forma consciente, controlada e dentro dos seus limites financeiros e emocionais. É garantir que o jogo permanece uma atividade de lazer e não se torna um problema que afeta a sua vida pessoal, profissional ou financeira.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-teal-50 rounded-xl p-4">
                      <i className="ri-money-euro-circle-line text-teal-600 text-2xl mb-2"></i>
                      <h3 className="font-bold text-gray-900 mb-1">Controlo Financeiro</h3>
                      <p className="text-sm text-gray-600">Aposte apenas o que pode perder sem afetar as suas despesas essenciais</p>
                    </div>
                    <div className="bg-cyan-50 rounded-xl p-4">
                      <i className="ri-time-line text-cyan-600 text-2xl mb-2"></i>
                      <h3 className="font-bold text-gray-900 mb-1">Gestão de Tempo</h3>
                      <p className="text-sm text-gray-600">Estabeleça limites de tempo e não deixe o jogo interferir com outras atividades</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4">
                      <i className="ri-mental-health-line text-blue-600 text-2xl mb-2"></i>
                      <h3 className="font-bold text-gray-900 mb-1">Equilíbrio Emocional</h3>
                      <p className="text-sm text-gray-600">Nunca aposte para resolver problemas ou quando estiver emocionalmente vulnerável</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Sinais de Alerta */}
          <section className="mb-12">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-14 h-14 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-alarm-warning-line text-red-600 text-3xl"></i>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">Sinais de Alerta de Jogo Problemático</h2>
                  <p className="text-gray-700 mb-6">
                    Reconhecer os sinais precoces de jogo problemático é fundamental. Se identificar vários destes comportamentos, procure ajuda:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { icon: 'ri-money-euro-circle-line', text: 'Apostar mais dinheiro do que pode pagar', color: 'red' },
                      { icon: 'ri-time-line', text: 'Passar cada vez mais tempo a apostar', color: 'orange' },
                      { icon: 'ri-emotion-unhappy-line', text: 'Sentir-se irritado ou ansioso quando não aposta', color: 'amber' },
                      { icon: 'ri-arrow-up-circle-line', text: 'Necessidade de apostar quantias maiores', color: 'red' },
                      { icon: 'ri-chat-delete-line', text: 'Mentir a familiares sobre as apostas', color: 'orange' },
                      { icon: 'ri-funds-line', text: 'Tentar recuperar perdas apostando mais', color: 'red' },
                      { icon: 'ri-bank-card-line', text: 'Pedir dinheiro emprestado para apostar', color: 'red' },
                      { icon: 'ri-team-line', text: 'Negligenciar família, trabalho ou estudos', color: 'orange' },
                      { icon: 'ri-emotion-sad-line', text: 'Usar o jogo para escapar de problemas', color: 'amber' },
                      { icon: 'ri-close-circle-line', text: 'Tentativas falhadas de parar ou reduzir', color: 'red' }
                    ].map((item, index) => (
                      <div key={index} className={`flex items-start space-x-3 p-4 bg-${item.color}-50 rounded-xl border border-${item.color}-200`}>
                        <i className={`${item.icon} text-${item.color}-600 text-xl mt-0.5 flex-shrink-0`}></i>
                        <span className="text-gray-800 text-sm">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Ferramentas Disponíveis */}
          <section className="mb-12">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-tools-line text-amber-600 text-3xl"></i>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">Ferramentas de Controlo</h2>
                  <p className="text-gray-700 mb-6">
                    Disponibilizamos várias ferramentas para ajudá-lo a manter o controlo sobre as suas atividades de jogo:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Limites de Depósito */}
                    <div className="border border-gray-200 rounded-xl p-6 hover:border-green-300 transition-colors">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <i className="ri-money-euro-circle-line text-green-600 text-2xl"></i>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-2">Limites de Depósito</h3>
                          <p className="text-sm text-gray-600 mb-3">
                            Defina limites diários, semanais ou mensais para os seus depósitos. Isto ajuda a controlar quanto dinheiro investe no jogo.
                          </p>
                          <Link
                            to="/perfil"
                            className="inline-flex items-center text-sm font-semibold text-green-600 hover:text-green-700"
                          >
                            Definir limites
                            <i className="ri-arrow-right-line ml-1"></i>
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Limites de Apostas */}
                    <div className="border border-gray-200 rounded-xl p-6 hover:border-blue-300 transition-colors">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <i className="ri-ticket-line text-blue-600 text-2xl"></i>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-2">Limites de Apostas</h3>
                          <p className="text-sm text-gray-600 mb-3">
                            Estabeleça o valor máximo que pode apostar por dia, semana ou mês. Proteja-se de apostas impulsivas.
                          </p>
                          <Link
                            to="/perfil"
                            className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Definir limites
                            <i className="ri-arrow-right-line ml-1"></i>
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Limites de Perdas */}
                    <div className="border border-gray-200 rounded-xl p-6 hover:border-purple-300 transition-colors">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <i className="ri-line-chart-line text-purple-600 text-2xl"></i>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-2">Limites de Perdas</h3>
                          <p className="text-sm text-gray-600 mb-3">
                            Defina o máximo que está disposto a perder num determinado período. Quando atingir o limite, não poderá continuar a apostar.
                          </p>
                          <Link
                            to="/perfil"
                            className="inline-flex items-center text-sm font-semibold text-purple-600 hover:text-purple-700"
                          >
                            Definir limites
                            <i className="ri-arrow-right-line ml-1"></i>
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Período de Reflexão */}
                    <div className="border border-gray-200 rounded-xl p-6 hover:border-amber-300 transition-colors">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <i className="ri-time-line text-amber-600 text-2xl"></i>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-2">Período de Reflexão</h3>
                          <p className="text-sm text-gray-600 mb-3">
                            Faça uma pausa curta de 1 a 24 horas. Pode continuar a navegar mas não pode fazer apostas durante este período.
                          </p>
                          <Link
                            to="/perfil"
                            className="inline-flex items-center text-sm font-semibold text-amber-600 hover:text-amber-700"
                          >
                            Ativar pausa
                            <i className="ri-arrow-right-line ml-1"></i>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Auto-Exclusão */}
          <section className="mb-12">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-14 h-14 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-shield-user-line text-red-600 text-3xl"></i>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">Auto-Exclusão</h2>
                  <p className="text-gray-700 mb-6">
                    A auto-exclusão é uma medida mais séria que suspende completamente a sua conta por um período que você define.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Auto-Exclusão Temporária */}
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                      <h3 className="font-bold text-red-900 mb-3 flex items-center">
                        <i className="ri-time-line mr-2"></i>
                        Auto-Exclusão Temporária
                      </h3>
                      <p className="text-sm text-red-800 mb-4">
                        Suspenda a sua conta por um período de 1 dia a 1 ano. Durante este tempo:
                      </p>
                      <ul className="space-y-2 mb-4">
                        {[
                          'Não pode fazer apostas',
                          'Não pode fazer depósitos',
                          'Não pode aceder a funcionalidades de jogo',
                          'Pode levantar fundos existentes',
                          'Receberá notificação por email'
                        ].map((item, index) => (
                          <li key={index} className="flex items-start space-x-2 text-sm text-red-800">
                            <i className="ri-checkbox-circle-fill text-red-600 mt-0.5 flex-shrink-0"></i>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        to="/perfil"
                        className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-shield-user-line mr-2"></i>
                        Ativar Auto-Exclusão
                      </Link>
                    </div>

                    {/* Auto-Exclusão Permanente */}
                    <div className="bg-gray-900 text-white rounded-xl p-6">
                      <h3 className="font-bold mb-3 flex items-center">
                        <i className="ri-close-circle-line mr-2"></i>
                        Auto-Exclusão Permanente
                      </h3>
                      <p className="text-sm text-gray-300 mb-4">
                        Encerre permanentemente a sua conta. Esta ação é irreversível e inclui:
                      </p>
                      <ul className="space-y-2 mb-4">
                        {[
                          'Encerramento definitivo da conta',
                          'Impossibilidade de criar nova conta',
                          'Remoção de dados pessoais (RGPD)',
                          'Levantamento de fundos restantes',
                          'Confirmação por email e telefone'
                        ].map((item, index) => (
                          <li key={index} className="flex items-start space-x-2 text-sm text-gray-300">
                            <i className="ri-checkbox-circle-fill text-gray-400 mt-0.5 flex-shrink-0"></i>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        to="/perfil"
                        className="inline-flex items-center px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-delete-bin-line mr-2"></i>
                        Encerrar Conta
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Teste de Auto-Avaliação */}
          <section className="mb-12">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-questionnaire-line text-purple-600 text-3xl"></i>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">Teste de Auto-Avaliação</h2>
                  <p className="text-gray-700 mb-6">
                    Responda honestamente às seguintes questões para avaliar os seus hábitos de jogo. Este teste é confidencial e apenas você verá os resultados.
                  </p>

                  {!showTestResult ? (
                    <div className="space-y-6">
                      {testQuestions.map((q) => (
                        <div key={q.id} className="bg-gray-50 rounded-xl p-6">
                          <h3 className="font-semibold text-gray-900 mb-4">
                            {q.id}. {q.question}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            {q.options.map((option, index) => (
                              <button
                                key={index}
                                onClick={() => handleTestAnswer(q.id, index)}
                                className={`p-3 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${
                                  testAnswers[q.id] === index
                                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-center pt-4">
                        <button
                          onClick={calculateTestResult}
                          disabled={!isTestComplete}
                          className={`px-8 py-4 rounded-xl font-bold text-lg transition-colors cursor-pointer whitespace-nowrap ${
                            isTestComplete
                              ? 'bg-purple-600 hover:bg-purple-700 text-white'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          <i className="ri-check-line mr-2"></i>
                          Ver Resultado
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {testResult !== null && (() => {
                        const result = getTestResultMessage(testResult);
                        return (
                          <div className={`bg-${result.color}-50 border-2 border-${result.color}-200 rounded-2xl p-8`}>
                            <div className="flex items-start space-x-4 mb-6">
                              <div className={`w-16 h-16 bg-${result.color}-100 rounded-full flex items-center justify-center flex-shrink-0`}>
                                <i className={`${result.icon} text-${result.color}-600 text-3xl`}></i>
                              </div>
                              <div className="flex-1">
                                <h3 className={`text-2xl font-bold text-${result.color}-900 mb-2`}>
                                  Resultado: {result.level}
                                </h3>
                                <p className={`text-${result.color}-800 text-lg mb-4`}>
                                  Pontuação: {testResult} de 32 pontos
                                </p>
                                <p className={`text-${result.color}-800 leading-relaxed`}>
                                  {result.message}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() => {
                                  setTestAnswers({});
                                  setTestResult(null);
                                  setShowTestResult(false);
                                }}
                                className={`px-6 py-3 bg-white border-2 border-${result.color}-300 text-${result.color}-700 rounded-xl font-semibold hover:bg-${result.color}-50 transition-colors cursor-pointer whitespace-nowrap`}
                              >
                                <i className="ri-refresh-line mr-2"></i>
                                Refazer Teste
                              </button>
                              {testResult > 8 && (
                                <Link
                                  to="/perfil"
                                  className={`px-6 py-3 bg-${result.color}-600 hover:bg-${result.color}-700 text-white rounded-xl font-semibold transition-colors cursor-pointer whitespace-nowrap`}
                                >
                                  <i className="ri-shield-user-line mr-2"></i>
                                  Definir Limites
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Recursos de Ajuda */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-teal-600 to-cyan-700 rounded-2xl p-8 text-white">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-hand-heart-line text-3xl"></i>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold mb-3">Recursos de Ajuda Externa</h2>
                  <p className="text-teal-100 mb-6">
                    Se sente que o jogo está a afetar negativamente a sua vida, não hesite em procurar ajuda profissional. Existem várias organizações especializadas em apoio a jogadores:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Linha Vida */}
                    <a
                      href="tel:800200134"
                      className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <i className="ri-phone-line text-teal-600 text-2xl"></i>
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 mb-1">Linha de Apoio ao Jogador</h3>
                          <p className="text-sm text-gray-600 mb-2">Apoio telefónico gratuito e confidencial</p>
                          <div className="text-teal-600 font-bold text-lg">800 200 134</div>
                          <p className="text-xs text-gray-500 mt-1">Dias úteis: 10h-18h</p>
                        </div>
                      </div>
                    </a>

                    {/* Jogadores Anónimos */}
                    <a
                      href="https://www.jogadoresanonimos.pt"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <i className="ri-team-line text-cyan-600 text-2xl"></i>
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 mb-1">Jogadores Anónimos</h3>
                          <p className="text-sm text-gray-600 mb-2">Grupos de apoio e reuniões</p>
                          <div className="text-cyan-600 font-semibold">jogadoresanonimos.pt</div>
                          <p className="text-xs text-gray-500 mt-1">Reuniões presenciais e online</p>
                        </div>
                      </div>
                    </a>

                    {/* SICAD */}
                    <a
                      href="https://www.sicad.pt"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <i className="ri-government-line text-blue-600 text-2xl"></i>
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 mb-1">SICAD</h3>
                          <p className="text-sm text-gray-600 mb-2">Serviço de Intervenção nos Comportamentos Aditivos</p>
                          <div className="text-blue-600 font-semibold">sicad.pt</div>
                          <p className="text-xs text-gray-500 mt-1">Informação e encaminhamento</p>
                        </div>
                      </div>
                    </a>

                    {/* Linha SOS Voz Amiga */}
                    <a
                      href="tel:213544545"
                      className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <i className="ri-customer-service-2-line text-purple-600 text-2xl"></i>
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 mb-1">SOS Voz Amiga</h3>
                          <p className="text-sm text-gray-600 mb-2">Apoio emocional 24/7</p>
                          <div className="text-purple-600 font-bold text-lg">213 544 545</div>
                          <p className="text-xs text-gray-500 mt-1">Disponível 24 horas</p>
                        </div>
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Proteção de Menores */}
          <section className="mb-12">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-shield-check-line text-orange-600 text-3xl"></i>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">Proteção de Menores</h2>
                  <p className="text-gray-700 mb-6">
                    É estritamente proibido o jogo a menores de 18 anos. Tomamos esta questão muito a sério e implementamos várias medidas de proteção:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { icon: 'ri-shield-user-line', title: 'Verificação de Idade', text: 'Validação obrigatória de identidade no registo' },
                      { icon: 'ri-lock-line', title: 'Bloqueio Automático', text: 'Contas de menores são bloqueadas imediatamente' },
                      { icon: 'ri-parent-line', title: 'Controlo Parental', text: 'Ferramentas para pais bloquearem acesso' },
                      { icon: 'ri-alert-line', title: 'Denúncia', text: 'Sistema de reporte de suspeitas de menores' }
                    ].map((item, index) => (
                      <div key={index} className="flex items-start space-x-3 p-4 bg-orange-50 rounded-xl border border-orange-200">
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <i className={`${item.icon} text-orange-600 text-xl`}></i>
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                          <p className="text-sm text-gray-600">{item.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                    <p className="text-sm text-orange-800">
                      <i className="ri-information-line mr-2"></i>
                      <strong>Pais e Educadores:</strong> Se suspeita que um menor está a aceder à plataforma, contacte-nos imediatamente através do email <a href="mailto:protecao@betwin.pt" className="font-bold underline">protecao@betwin.pt</a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Contactos de Suporte */}
          <section>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-customer-service-line text-blue-600 text-3xl"></i>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">Contacte-nos</h2>
                  <p className="text-gray-700 mb-6">
                    A nossa equipa de apoio está disponível para ajudá-lo com questões relacionadas com jogo responsável, limites de conta ou auto-exclusão.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-xl p-5">
                      <i className="ri-mail-line text-blue-600 text-2xl mb-3"></i>
                      <h3 className="font-bold text-gray-900 mb-2">Email</h3>
                      <a href="mailto:suporte@betwin.pt" className="text-blue-600 font-semibold hover:underline">
                        suporte@betwin.pt
                      </a>
                      <p className="text-xs text-gray-500 mt-2">Resposta em 24h</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-5">
                      <i className="ri-phone-line text-green-600 text-2xl mb-3"></i>
                      <h3 className="font-bold text-gray-900 mb-2">Telefone</h3>
                      <a href="tel:+351210000000" className="text-green-600 font-semibold hover:underline">
                        +351 210 000 000
                      </a>
                      <p className="text-xs text-gray-500 mt-2">Seg-Sex: 9h-20h</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-5">
                      <i className="ri-chat-3-line text-purple-600 text-2xl mb-3"></i>
                      <h3 className="font-bold text-gray-900 mb-2">Chat ao Vivo</h3>
                      <button className="text-purple-600 font-semibold hover:underline">
                        Iniciar conversa
                      </button>
                      <p className="text-xs text-gray-500 mt-2">Disponível 24/7</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
