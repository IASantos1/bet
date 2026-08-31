import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/react-app/contexts/AppContext';
import { apiFetch } from '@/react-app/utils/api';

/**
 * Real catalog, fetched from GET /api/casino/games (cached server-side over the aggregator's
 * /v4/game/all). Never falls back to placeholder/fictional titles: when the aggregator isn't
 * configured, or this server's IP isn't whitelisted with it yet, the endpoint returns an empty
 * list with `error` set, and this page shows that honestly instead of inventing games.
 *
 * "Jogar" (handlePlay) opens a real session via POST /api/casino/play, which creates/reuses the
 * aggregator's user_code for this BET62 account (server/routes/casino.ts) and returns a real,
 * single-use launch URL, then hands it to /casino/play (CasinoPlay.tsx) to render in-app via
 * <iframe> — never window.open(), which would kick an installed PWA user out into the plain
 * browser. This account runs Seamless mode (confirmed by the account owner): the aggregator
 * debits/credits BET62's own wallet directly via /callback (server/routes/casinoCallback.ts),
 * which fully implements the real bet/win/cancel money-moving contract.
 */

const HERO_SLIDES = [
  { title: 'Slots', subtitle: 'Centenas de slots a caminho da sua conta', emoji: '🎰', gradient: 'from-fuchsia-600 via-purple-600 to-indigo-700' },
  { title: 'Mesa & Cartas', subtitle: 'Blackjack, Roleta e Bacará', emoji: '🃏', gradient: 'from-emerald-600 via-teal-600 to-cyan-700' },
  { title: 'Casino Ao Vivo', subtitle: 'Dealers reais, em direto', emoji: '🎥', gradient: 'from-rose-600 via-red-600 to-orange-600' },
];

// Curated by request — matched against the real catalog by a case-insensitive substring on
// game_name, in this order. A fragment with nothing matching it in the real (aggregator-fetched)
// catalog is simply skipped, never faked; add more fragments here as needed.
const FEATURED_GAME_FRAGMENTS = ['Gates of Olympus', 'Big Bass Bonanza 1000', 'Sweet Bonanza 2500', 'The Dog House', 'Buffalo'];

const FALLBACK_GRADIENTS = [
  'from-pink-500 to-purple-600',
  'from-amber-500 to-purple-700',
  'from-sky-500 to-blue-700',
  'from-orange-500 to-amber-800',
  'from-yellow-600 to-amber-900',
  'from-red-500 to-rose-700',
  'from-teal-500 to-purple-700',
  'from-lime-500 to-green-700',
];

function fallbackGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_GRADIENTS[h % FALLBACK_GRADIENTS.length];
}

type RemoteGame = {
  provider_id: number;
  game_code: string;
  game_name: string;
  game_image: string;
  game_image_narrow: string;
  category: string;
  launch_enable: boolean;
};

type GamesResponse = { success: boolean; games?: RemoteGame[]; stale?: boolean; error?: string | null };

const PAGE_SIZE = 14;

function GameCard({ game, onPlay, big, launching }: { game: RemoteGame; onPlay: (game: RemoteGame) => void; big?: boolean; launching?: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const image = game.game_image || game.game_image_narrow;

  return (
    <div className={`group relative rounded-xl overflow-hidden shrink-0 ${big ? 'w-40 h-52' : 'w-full aspect-[3/4]'}`}>
      {image && !imgFailed ? (
        <img
          src={image}
          alt={game.game_name}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <>
          <div className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient(game.game_code)}`} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3">
            <span className="text-4xl mb-2 drop-shadow-lg">🎰</span>
            <span className="text-white font-black text-sm leading-tight drop-shadow">{game.game_name}</span>
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => onPlay(game)}
        disabled={launching}
        className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-all disabled:cursor-wait"
      >
        <span className="px-3 py-1.5 rounded-lg bg-white text-gray-900 text-xs font-bold">{launching ? 'A abrir…' : 'Jogar'}</span>
      </button>
      {image && !imgFailed && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
          <span className="text-white text-[11px] font-bold leading-tight line-clamp-1">{game.game_name}</span>
        </div>
      )}
    </div>
  );
}

export default function CasinoPage() {
  const { darkMode, addNotification, user, selfExclude } = useApp();
  const navigate = useNavigate();
  const [slide, setSlide] = useState(0);
  const [filter, setFilter] = useState('Todos');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [launchingCode, setLaunchingCode] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [games, setGames] = useState<RemoteGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/casino/games');
        const data: GamesResponse = await res.json();
        if (cancelled) return;
        setGames(data.games || []);
        setFetchError(data.error || null);
      } catch (e: any) {
        if (cancelled) return;
        setGames([]);
        setFetchError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handlePlay = async (game: RemoteGame) => {
    if (!user) {
      addNotification({ type: 'warning', message: 'Por favor, faça login para jogar' });
      return;
    }
    if (selfExclude) {
      addNotification({ type: 'error', message: 'Autoexcluído: não pode jogar' });
      return;
    }
    if (launchingCode) return; // one launch request at a time — avoids double-click double-creating the aggregator user
    setLaunchingCode(game.game_code);
    try {
      const data = await apiFetch<{ success: boolean; game_url?: string; error?: string }>('/api/casino/play', {
        method: 'POST',
        body: JSON.stringify({
          provider_id: game.provider_id,
          game_code: game.game_code,
          return_url: `${window.location.origin}/casino`,
        }),
      });
      if (data.success && data.game_url) {
        navigate('/casino/play', { state: { gameUrl: data.game_url, gameName: game.game_name } });
      } else {
        addNotification({ type: 'warning', message: data.error || 'Jogo indisponível de momento' });
      }
    } catch (e: any) {
      addNotification({ type: 'error', message: e?.message || 'Não foi possível abrir o jogo' });
    } finally {
      setLaunchingCode(null);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) if (g.category) set.add(g.category);
    return Array.from(set).sort();
  }, [games]);

  const featured = useMemo(() => {
    const picked: RemoteGame[] = [];
    const used = new Set<string>();
    for (const fragment of FEATURED_GAME_FRAGMENTS) {
      const match = games.find((g) => !used.has(g.game_code) && g.game_name.toLowerCase().includes(fragment.toLowerCase()));
      if (match) {
        picked.push(match);
        used.add(match.game_code);
      }
    }
    // Pad up to 7 with other real games so the row isn't sparse when few featured titles match.
    for (const g of games) {
      if (picked.length >= 7) break;
      if (!used.has(g.game_code)) {
        picked.push(g);
        used.add(g.game_code);
      }
    }
    return picked;
  }, [games]);

  const filtered = games.filter(
    (g) => (filter === 'Todos' || g.category === filter) && g.game_name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const visible = filtered.slice(0, visibleCount);

  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const pageBg = darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900';

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {!loading && games.length === 0 && (
          <div className={`rounded-2xl p-3 text-xs ${darkMode ? 'bg-amber-900/20 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>
            {fetchError
              ? `O catálogo real ainda não está disponível (${fetchError}). Assim que a ligação ao agregador for autorizada, os jogos aparecem aqui automaticamente.`
              : 'Nenhum jogo disponível de momento.'}
          </div>
        )}

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

        {/* Featured games row — curated titles, matched against the real catalog */}
        {featured.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔥</span>
              <h2 className="font-black uppercase tracking-wide text-sm">Jogos em Destaque</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {featured.map((g) => (
                <GameCard key={g.game_code} game={g} big onPlay={handlePlay} launching={launchingCode === g.game_code} />
              ))}
            </div>
          </div>
        )}

        {/* Filters + search */}
        {games.length > 0 && (
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {['Todos', ...categories].map((f) => (
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
        )}

        {/* Game grid */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🎰</span>
            <h2 className="font-black uppercase tracking-wide text-sm">Todos os Jogos</h2>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className={`aspect-[3/4] rounded-xl animate-pulse ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className={`rounded-xl p-8 text-center text-sm ${cardBg} border`}>Nenhum jogo encontrado.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
              {visible.map((g) => (
                <GameCard key={g.game_code} game={g} onPlay={handlePlay} launching={launchingCode === g.game_code} />
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
