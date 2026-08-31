import { useApp } from '@/react-app/contexts/AppContext';

const CATEGORIES = [
  { icon: '🎰', label: 'Slots' },
  { icon: '🃏', label: 'Mesa' },
  { icon: '🎥', label: 'Casino Ao Vivo' },
  { icon: '🎲', label: 'Instantâneos' },
];

export default function CasinoPage() {
  const { darkMode } = useApp();

  return (
    <div className={`min-h-screen p-6 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-5xl mb-4">🎰</div>
        <h1 className="text-2xl font-bold mb-3">Casino</h1>
        <p className={`mb-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Estamos a preparar o Casino BET62. Em breve poderá jogar slots, jogos de mesa e casino ao vivo diretamente na sua conta.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map((c) => (
            <div
              key={c.label}
              className={`rounded-xl p-5 ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}
            >
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className="font-semibold text-sm">{c.label}</div>
              <div className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Em breve</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
