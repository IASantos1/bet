import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/react-app/contexts/AppContext';

/**
 * There is no licensed game provider wired up yet (the user is arranging an aggregator
 * separately). Everything below is real, working layout — carousel, search, filters, pagination —
 * over placeholder content: original, non-trademarked names and CSS/emoji art, never a real
 * studio's branded titles. Swapping in the real catalog later is a matter of replacing GAMES
 * with the aggregator's feed; the layout itself doesn't change.
 */

const HERO_SLIDES = [
  { title: 'Slots', subtitle: 'Centenas de slots a caminho da sua conta', emoji: '🎰', gradient: 'from-fuchsia-600 via-purple-600 to-indigo-700' },
  { title: 'Mesa & Cartas', subtitle: 'Blackjack, Roleta e Bacará', emoji: '🃏', gradient: 'from-emerald-600 via-teal-600 to-cyan-700' },
  { title: 'Casino Ao Vivo', subtitle: 'Dealers reais, em direto', emoji: '🎥', gradient: 'from-rose-600 via-red-600 to-orange-600' },
];

type Game = { name: string; tag: string; emoji: string; gradient: string };

const GAMES: Game[] = [
  { name: 'Fruta Explosiva', tag: 'Populares', emoji: '🍬', gradient: 'from-pink-500 to-purple-600' },
  { name: 'Trono Divino', tag: 'Jackpots', emoji: '⚡', gradient: 'from-amber-500 to-purple-700' },
  { name: 'Pesca Dourada', tag: 'Rodadas Grátis', emoji: '🎣', gradient: 'from-sky-500 to-blue-700' },
  { name: 'Fora da Lei', tag: 'Novos', emoji: '🤠', gradient: 'from-orange-500 to-amber-800' },
  { name: 'Livro Perdido', tag: 'Bónus Compra', emoji: '📖', gradient: 'from-yellow-600 to-amber-900' },
  { name: 'Pomar Doce', tag: 'Populares', emoji: '🍓', gradient: 'from-red-500 to-rose-700' },
  { name: 'Ouro Selvagem', tag: 'Jackpots', emoji: '💰', gradient: 'from-yellow-500 to-orange-700' },
  { name: 'Rei Búfalo', tag: 'Novos', emoji: '🐃', gradient: 'from-purple-600 to-fuchsia-800' },
  { name: 'Comboio do Tesouro', tag: 'Bónus Compra', emoji: '🚂', gradient: 'from-slate-600 to-gray-900' },
  { name: 'Gemas Místicas', tag: 'Populares', emoji: '💎', gradient: 'from-teal-500 to-purple-700' },
  { name: 'Colheita Suculenta', tag: 'Rodadas Grátis', emoji: '🍊', gradient: 'from-lime-500 to-green-700' },
  { name: 'Cães Guardiões', tag: 'Novos', emoji: '🐕', gradient: 'from-amber-700 to-orange-900' },
  { name: 'Dragão Voador', tag: 'Jackpots', emoji: '🐉', gradient: 'from-teal-600 to-emerald-900' },
  { name: 'Ouro Pirata', tag: 'Bónus Compra', emoji: '🏴‍☠️', gradient: 'from-zinc-700 to-yellow-800' },
  { name: 'Roleta Clássica', tag: 'Roleta', emoji: '🎡', gradient: 'from-red-600 to-gray-900' },
  { name: 'Blackjack VIP', tag: 'Blackjack', emoji: '🂡', gradient: 'from-emerald-700 to-gray-900' },
  { name: 'Bacará Real', tag: 'Bacará', emoji: '🎴', gradient: 'from-indigo-700 to-purple-900' },
];

const FILTERS = ['Todos', 'Populares', 'Jackpots', 'Bónus Compra', 'Rodadas Grátis', 'Novos', 'Bacará', 'Blackjack', 'Roleta'];
const PAGE_SIZE = 14;

function GameCard({ game, onPlay, big }: { game: Game; onPlay: () => void; big?: boolean }) {
  return (
    <div className={`group relative rounded-xl overflow-hidden shrink-0 ${big ? 'w-40 h-52' : 'w-full aspect-[3/4]'}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${game.gradient}`} />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3">
        <span className="text-4xl mb-2 drop-shadow-lg">{game.emoji}</span>
        <span className="text-white font-black text-sm leading-tight drop-shadow">{game.name}</span>
      </div>
      <button
        type="button"
        onClick={onPlay}
        className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-all"
      >
        <span className="px-3 py-1.5 rounded-lg bg-white text-gray-900 text-xs font-bold">Jogar</span>
      </button>
      <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wide bg-black/40 text-white px-1.5 py-0.5 rounded">
        Em breve
      </span>
    </div>
  );
}

export default function CasinoPage() {
  const { darkMode, addNotification } = useApp();
  const [slide, setSlide] = useState(0);
  const [filter, setFilter] = useState('Todos');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const notifySoon = () => addNotification({ type: 'info', message: 'O Casino BET62 ainda está a ser preparado — este jogo estará disponível em breve.' });

  const filtered = GAMES.filter(
    (g) => (filter === 'Todos' || g.tag === filter) && g.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const visible = filtered.slice(0, visibleCount);

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const pageBg = darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900';

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <div className={`rounded-2xl p-3 text-xs ${darkMode ? 'bg-blue-900/20 text-blue-200' : 'bg-blue-50 text-blue-800'}`}>
          O catálogo de jogos está em preparação — o que vê abaixo é uma pré-visualização do layout, ainda sem jogos reais.
        </div>

        {/* Hero carousel */}
        <div className="relative rounded-2xl overflow-hidden h-56 md:h-64">
          {HERO_SLIDES.map((s, i) => (
            <div
              key={s.title}
              className={`absolute inset-0 bg-gradient-to-br ${s.gradient} flex items-center px-8 md:px-12 transition-opacity duration-500 ${i === slide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <div>
                <div className="text-5xl mb-3">{s.emoji}</div>
                <h2 className="text-3xl md:text-4xl font-black text-white mb-1">{s.title}</h2>
                <p className="text-white/80 text-sm md:text-base">{s.subtitle}</p>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSlide((s) => (s - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setSlide((s) => (s + 1) % HERO_SLIDES.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
            aria-label="Seguinte"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {HERO_SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setSlide(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </div>
        </div>

        {/* Popular games row */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🔥</span>
            <h2 className="font-black uppercase tracking-wide text-sm">Jogos Populares</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {GAMES.filter((g) => g.tag === 'Populares').concat(GAMES.slice(0, 5)).slice(0, 7).map((g, i) => (
              <GameCard key={`${g.name}-${i}`} game={g} big onPlay={notifySoon} />
            ))}
          </div>
        </div>

        {/* Filters + search */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setFilter(f); setVisibleCount(PAGE_SIZE); }}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                  filter === f ? 'bg-red-600 text-white' : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
            placeholder="Procurar jogos..."
            className={`px-3 py-2 rounded-lg text-sm border w-full md:w-56 ${darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 placeholder-gray-400'}`}
          />
        </div>

        {/* Game grid */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🎰</span>
            <h2 className="font-black uppercase tracking-wide text-sm">Slots</h2>
          </div>
          {visible.length === 0 ? (
            <div className={`rounded-xl p-8 text-center text-sm ${cardBg} border`}>Nenhum jogo encontrado.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
              {visible.map((g, i) => (
                <GameCard key={`${g.name}-${i}`} game={g} onPlay={notifySoon} />
              ))}
            </div>
          )}
          {visibleCount < filtered.length && (
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-colors"
              >
                Carregar Mais Jogos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
