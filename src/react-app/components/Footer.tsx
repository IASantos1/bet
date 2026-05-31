import { Link } from "react-router-dom";
import { useApp } from '@/react-app/contexts/AppContext';

export function Footer() {
  const { darkMode } = useApp();
  return (
    <footer className={`mt-6 border-t ${darkMode ? 'bg-gray-900 border-gray-800 text-gray-300' : 'bg-white border-gray-200 text-gray-700'}`}>
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
            <div className="text-sm">
            <span className={`${darkMode ? 'text-white' : 'text-gray-900'} font-semibold`}>BET62 Apostas Desportivas</span>
            <span className="mx-2">•</span>
            <span>Licença de operação</span>
            </div>
            <div className="flex gap-4 text-xs opacity-80">
            <Link to="/terms" className="hover:underline">Termos e Condições</Link>
            <Link to="/privacy" className="hover:underline">Política de Privacidade</Link>
            </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md border bg-red-600 text-white border-red-700 text-xs font-bold">18+</span>
          <span className="text-sm">Proibido para menores de 18 anos</span>
        </div>
      </div>
    </footer>
  );
}
