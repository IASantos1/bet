import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [animateOut, setAnimateOut] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Incremento aleatório para simular carregamento real
        const increment = Math.random() * 15 + 5;
        return Math.min(prev + increment, 100);
      });
    }, 150);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      setAnimateOut(true);
      const timer = setTimeout(() => {
        onFinish();
      }, 800); // Aguarda a animação de saída
      return () => clearTimeout(timer);
    }
  }, [progress, onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0F172A] transition-all duration-700 ease-in-out ${
        animateOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      <div className={`relative mb-12 transform transition-all duration-1000 ${animateOut ? 'scale-110 blur-sm' : 'scale-100 blur-0'}`}>
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white select-none drop-shadow-2xl flex items-center gap-2">
          BET<span className="text-red-600 animate-pulse">62</span>
        </h1>
        
        {/* Glow effect behind logo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-red-600/20 blur-[60px] rounded-full animate-pulse pointer-events-none"></div>
      </div>

      <div className="w-64 md:w-80 h-1.5 bg-gray-800/50 rounded-full overflow-hidden relative backdrop-blur-sm border border-gray-700/30">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-600 via-red-500 to-red-400 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(220,38,38,0.5)]"
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <p className="text-[10px] md:text-xs tracking-[0.3em] text-gray-400 font-medium uppercase animate-pulse">
          Carregando Odds...
        </p>
        <p className="text-[10px] text-gray-600 font-mono">
          {Math.round(progress)}%
        </p>
      </div>

      {/* Decorative background elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(220,38,38,0.1),transparent_70%)]"></div>
      </div>
    </div>
  );
}
