
/**
 * ✅ COMPONENTE DE CELEBRAÇÃO DE GANHO
 * - Animação de confete
 * - Notificação de ganho
 * - Som de celebração (opcional)
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface WinCelebrationProps {
  amount: number;
  betId?: string;
  onClose: () => void;
  autoClose?: number; // ms para fechar automaticamente
}

// ✅ Componente de partícula de confete
const ConfettiParticle = ({ 
  color, 
  left, 
  delay, 
  duration 
}: { 
  color: string; 
  left: number; 
  delay: number; 
  duration: number;
}) => {
  const shapes = ['square', 'circle', 'triangle'];
  const shape = shapes[Math.floor(Math.random() * shapes.length)];
  const size = 8 + Math.random() * 8;
  const rotation = Math.random() * 360;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${left}%`,
        top: '-20px',
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: shape !== 'triangle' ? color : 'transparent',
        borderRadius: shape === 'circle' ? '50%' : shape === 'square' ? '2px' : '0',
        borderLeft: shape === 'triangle' ? `${size/2}px solid transparent` : undefined,
        borderRight: shape === 'triangle' ? `${size/2}px solid transparent` : undefined,
        borderBottom: shape === 'triangle' ? `${size}px solid ${color}` : undefined,
        transform: `rotate(${rotation}deg)`,
        animation: `confetti-fall ${duration}s ease-out ${delay}s forwards`,
        opacity: 0,
      }}
    />
  );
};

// ✅ Componente principal de celebração
export default function WinCelebration({ 
  amount, 
  betId, 
  onClose, 
  autoClose = 5000 
}: WinCelebrationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [confettiParticles, setConfettiParticles] = useState<Array<{
    id: number;
    color: string;
    left: number;
    delay: number;
    duration: number;
  }>>([]);

  // ✅ Gerar partículas de confete
  useEffect(() => {
    const colors = [
      '#FFD700', // Ouro
      '#FFA500', // Laranja
      '#FF6B6B', // Vermelho claro
      '#4ECDC4', // Turquesa
      '#45B7D1', // Azul claro
      '#96CEB4', // Verde claro
      '#FFEAA7', // Amarelo claro
      '#DDA0DD', // Roxo claro
      '#98D8C8', // Menta
      '#F7DC6F', // Amarelo
    ];

    const particles = [];
    for (let i = 0; i < 100; i++) {
      particles.push({
        id: i,
        color: colors[Math.floor(Math.random() * colors.length)],
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2 + Math.random() * 2,
      });
    }
    setConfettiParticles(particles);
  }, []);

  // ✅ Auto-fechar após tempo definido
  useEffect(() => {
    if (autoClose > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  if (!isVisible) return null;

  return createPortal(
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      {/* Overlay escuro */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Confete */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {confettiParticles.map((particle) => (
          <ConfettiParticle
            key={particle.id}
            color={particle.color}
            left={particle.left}
            delay={particle.delay}
            duration={particle.duration}
          />
        ))}
      </div>

      {/* Card de celebração */}
      <div 
        className={`relative bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-3xl p-8 md:p-12 shadow-2xl transform transition-all duration-500 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-90 translate-y-10'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Brilho de fundo */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-white/0 via-white/20 to-white/40" />
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-white/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-yellow-300/30 rounded-full blur-3xl animate-pulse" />
        </div>

        {/* Conteúdo */}
        <div className="relative text-center">
          {/* Ícone de troféu */}
          <div className="mb-4 animate-bounce">
            <div className="w-24 h-24 mx-auto bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <i className="ri-trophy-fill text-5xl text-white drop-shadow-lg"></i>
            </div>
          </div>

          {/* Texto de parabéns */}
          <h2 className="text-2xl md:text-3xl font-black text-white mb-2 drop-shadow-lg">
            🎉 PARABÉNS! 🎉
          </h2>
          <p className="text-white/90 text-lg mb-6">
            A tua aposta foi ganha!
          </p>

          {/* Valor ganho */}
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 mb-6">
            <p className="text-white/80 text-sm mb-1">Ganhos</p>
            <p className="text-4xl md:text-5xl font-black text-white drop-shadow-lg">
              €{amount.toFixed(2)}
            </p>
            {betId && (
              <p className="text-white/60 text-xs mt-2">
                Aposta #{betId.slice(0, 8)}
              </p>
            )}
          </div>

          {/* Mensagem */}
          <p className="text-white/80 text-sm mb-6">
            O valor foi adicionado ao teu saldo!
          </p>

          {/* Botão de fechar */}
          <button
            onClick={handleClose}
            className="px-8 py-3 bg-white text-amber-600 font-bold rounded-xl hover:bg-white/90 transition-all shadow-lg hover:shadow-xl cursor-pointer whitespace-nowrap"
          >
            <i className="ri-check-line mr-2"></i>
            Continuar
          </button>
        </div>

        {/* Estrelas decorativas */}
        <div className="absolute top-4 left-4 text-2xl animate-spin-slow">⭐</div>
        <div className="absolute top-4 right-4 text-2xl animate-spin-slow" style={{ animationDelay: '0.5s' }}>✨</div>
        <div className="absolute bottom-4 left-4 text-2xl animate-spin-slow" style={{ animationDelay: '1s' }}>🌟</div>
        <div className="absolute bottom-4 right-4 text-2xl animate-spin-slow" style={{ animationDelay: '1.5s' }}>💫</div>
      </div>

      {/* Estilos de animação */}
      <style>{`
        @keyframes confetti-fall {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateY(100vh) rotate(720deg);
          }
        }
        
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>,
    document.body
  );
}

// ✅ Hook para usar celebração de ganho
function useWinCelebrationInternal() {
  const [celebration, setCelebration] = useState<{
    amount: number;
    betId?: string;
  } | null>(null);

  const showCelebration = useCallback((amount: number, betId?: string) => {
    setCelebration({ amount, betId });
  }, []);

  const hideCelebration = useCallback(() => {
    setCelebration(null);
  }, []);

  const CelebrationComponent = celebration ? (
    <WinCelebration
      amount={celebration.amount}
      betId={celebration.betId}
      onClose={hideCelebration}
    />
  ) : null;

  return {
    showCelebration,
    hideCelebration,
    CelebrationComponent,
    isShowing: !!celebration,
  };
}

export const useWinCelebration = useWinCelebrationInternal;
