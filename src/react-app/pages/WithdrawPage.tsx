import { useApp } from '@/react-app/contexts/AppContext';
import { WithdrawForm } from '@/react-app/components/WithdrawForm';

export default function WithdrawPage() {
  const { darkMode } = useApp();
  
  return (
    <div className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className={`max-w-xl mx-auto rounded-2xl shadow-xl overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
             <h2 className="text-xl font-bold">Levantamentos</h2>
             <p className="text-sm text-gray-500">Transfira o seu saldo para a sua conta bancária.</p>
        </div>
        
        <div className="p-6">
            <WithdrawForm />
        </div>
      </div>
    </div>
  );
}
