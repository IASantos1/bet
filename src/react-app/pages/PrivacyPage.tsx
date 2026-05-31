import { useApp } from '@/react-app/contexts/AppContext';

export default function PrivacyPage() {
  const { darkMode } = useApp();
  return (
    <div className={`min-h-screen p-8 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Política de Privacidade</h1>
        <div className={`prose ${darkMode ? 'prose-invert' : ''}`}>
          
          <h3>1. Recolha de Dados</h3>
          <p>Recolhemos informações pessoais necessárias para a prestação do serviço, incluindo nome, email, data de nascimento e dados bancários.</p>

          <h3>2. Uso da Informação</h3>
          <p>Utilizamos os seus dados para gerir a sua conta, processar transações e cumprir obrigações legais (AML/KYC).</p>

          <h3>3. Partilha de Dados</h3>
          <p>Não vendemos os seus dados. Partilhamos apenas com parceiros de pagamento (ex: IfThenPay, Revolut) estritamente para processamento de transações.</p>

          <h3>4. Segurança</h3>
          <p>Utilizamos encriptação SSL e armazenamos as suas palavras-passe com hash seguro.</p>

          <h3>5. Os Seus Direitos</h3>
          <p>Pode solicitar o acesso, retificação ou eliminação dos seus dados contactando o nosso suporte.</p>
        </div>
      </div>
    </div>
  );
}
