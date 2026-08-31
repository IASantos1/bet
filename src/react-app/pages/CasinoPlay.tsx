import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Renders a real GoldSlotPalace launch URL (from POST /api/casino/play) inside the app itself —
 * an <iframe>, the standard way every casino aggregator's game client is embedded on the
 * operator's own site — instead of window.open()'ing it into a separate browser tab. That matters
 * doubly for the installed PWA: a new tab there escapes the app shell into the regular browser,
 * breaking the "installed app" feel entirely, not just looking wrong in a normal browser tab.
 *
 * The launch URL is single-use and expires in ~10 minutes (aggregator spec), so it's passed via
 * router state rather than a query param — nothing worth bookmarking or reloading into staleness.
 * A direct hit on this route with no state (refresh, bookmarked link) bounces back to /casino.
 */
export default function CasinoPlay() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state || {}) as { gameUrl?: string; gameName?: string };
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!state.gameUrl) navigate('/casino', { replace: true });
  }, [state.gameUrl, navigate]);

  if (!state.gameUrl) return null;

  // Portalled straight to <body>: App.tsx wraps every route in a framer-motion <motion.div> for
  // page transitions, which sets a CSS `transform` on that ancestor — creating a new containing
  // block that traps `position: fixed` inside it instead of the real viewport. Without the portal
  // this overlay just renders as an ordinary block in the page flow, leaving the site's own
  // Header/Footer visible around it. EventDetails.tsx's mobile sidebar uses the same escape hatch.
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-900 text-white shrink-0">
        <button
          type="button"
          onClick={() => navigate('/casino')}
          className="flex items-center gap-1.5 text-sm font-bold px-2 py-1 rounded hover:bg-white/10"
        >
          ← Voltar
        </button>
        <span className="text-sm font-semibold truncate">{state.gameName || 'Casino'}</span>
        <span className="w-16" aria-hidden />
      </div>
      <div className="relative flex-1">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
          </div>
        )}
        <iframe
          src={state.gameUrl}
          title={state.gameName || 'Jogo de casino'}
          onLoad={() => setLoaded(true)}
          allow="autoplay; fullscreen"
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    </div>,
    document.body,
  );
}
