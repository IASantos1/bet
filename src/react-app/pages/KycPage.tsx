import { useApp } from '@/react-app/contexts/AppContext';

export default function KycPage() {
  const { darkMode } = useApp();

  return (
    <div className={`min-h-screen p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Verificação de Identidade (KYC)</h1>
        
        <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm mb-6`}>
          <p className="mb-4">
            Para cumprir com a legislação em vigor e garantir a segurança da sua conta, necessitamos que nos envie um documento de identificação válido.
          </p>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200 mb-6">
            <strong>Nota:</strong> A verificação é obrigatória antes do primeiro levantamento. O processo é manual e pode demorar até 24h.
          </div>

          <div className="space-y-4">
             <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
                <div className="text-4xl mb-2">📄</div>
                <h3 className="font-semibold mb-1">Carregar Documento</h3>
                <p className="text-xs text-gray-500 mb-4">CC (Frente e Verso) ou Passaporte</p>
                
                {/* Linking to Profile for now as logic is there */}
                <a 
                   href="/profile?tab=Documentos" 
                   className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                >
                   Ir para Área de Upload
                </a>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
