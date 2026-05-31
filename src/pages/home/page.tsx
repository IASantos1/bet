import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  lazy,
  Suspense,
  startTransition,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "../../components/feature/Header";
import { Footer } from "../../components/feature/Footer";
import { SportsMenu } from "../../components/feature/SportsMenu";
import { useProfile } from "../../hooks/useProfile";
import { useLiveMatches } from "../../hooks/useLiveMatches";
import { useUpcomingMatches } from "../../hooks/useUpcomingMatches";
import { useTheme } from "../../contexts/ThemeContext";
import { HeroBanners } from "./components/HeroBanners";
import { MobileBottomNav } from "../../components/feature/MobileBottomNav";

/* -------------------------------------------------
   Lazy‑loaded heavy components
   ------------------------------------------------- */
const BettingSlipPanel = lazy(() =>
  import("./components/BettingSlipPanel")
);
const MobileBettingSlip = lazy(() =>
  import("../../components/feature/MobileBettingSlip")
);
const MatchCard = lazy(() => import("./components/MatchCard"));

/* -------------------------------------------------
   Helper data (no TypeScript types – pure JS)
   ------------------------------------------------- */
const bannerStyles = [
  { gradient: "from-red-600 via-red-700 to-red-800", accent: "text-red-100" },
  { gradient: "from-emerald-600 via-emerald-700 to-teal-800", accent: "text-emerald-400" },
  { gradient: "from-rose-600 via-rose-700 to-red-800", accent: "text-rose-400" },
];

/* -------------------------------------------------
   Skeleton components (used while lazy components load)
   ------------------------------------------------- */
const MatchCardSkeleton = ({ theme }) => (
  <div
    className={`${
      theme === "dark" ? "bg-gray-800/60" : "bg-white"
    } rounded-xl p-3 animate-pulse border ${
      theme === "dark" ? "border-gray-700/40" : "border-gray-200"
    }`}
  >
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <div
          className={`w-5 h-5 ${
            theme === "dark" ? "bg-gray-700" : "bg-gray-200"
          } rounded-md`}
        ></div>
        <div
          className={`h-3 w-20 ${
            theme === "dark" ? "bg-gray-700" : "bg-gray-200"
          } rounded`}
        ></div>
      </div>
      <div
        className={`h-5 w-12 ${
          theme === "dark" ? "bg-red-900/30" : "bg-red-100"
        } rounded-md`}
      ></div>
    </div>

    <div className="space-y-2 mb-3">
      <div className="flex items-center gap-2">
        <div
          className={`w-6 h-6 ${
            theme === "dark" ? "bg-gray-700" : "bg-gray-200"
          } rounded-full`}
        ></div>
        <div
          className={`h-3 flex-1 max-w-[120px] ${
            theme === "dark" ? "bg-gray-700" : "bg-gray-200"
          } rounded`}
        ></div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`w-6 h-6 ${
            theme === "dark" ? "bg-gray-700" : "bg-gray-200"
          } rounded-full`}
        ></div>
        <div
          className={`h-3 flex-1 max-w-[100px] ${
            theme === "dark" ? "bg-gray-700" : "bg-gray-200"
          } rounded`}
        ></div>
      </div>
    </div>

    <div className="grid grid-cols-3 gap-2">
      <div
        className={`h-9 ${
          theme === "dark" ? "bg-red-900/30" : "bg-red-100"
        } rounded-lg`}
      ></div>
      <div
        className={`h-9 ${
          theme === "dark" ? "bg-red-900/30" : "bg-red-100"
        } rounded-lg`}
      ></div>
      <div
        className={`h-9 ${
          theme === "dark" ? "bg-red-900/30" : "bg-red-100"
        } rounded-lg`}
      ></div>
    </div>
  </div>
);

const MatchListSkeleton = ({ count = 5, theme }) => (
  <div className="space-y-2">
    {[...Array(count)].map((_, i) => (
      <MatchCardSkeleton key={`skeleton-${i}`} theme={theme} />
    ))}
  </div>
);

// SectionSkeleton removido (não utilizado)

/* -------------------------------------------------
   Match list – each item is lazy‑loaded individually
   ------------------------------------------------- */
const MatchList = ({
  matches,
  selections,
  onAddSelection,
  onOpenMarkets,
  theme,
}) => {
  if (!matches || matches.length === 0) return null;

  return (
    <div className="space-y-2">
      {matches.map((match, index) => (
        <Suspense
          key={
            match.id ||
            `${match.isLive ? "live" : "upcoming"}-${match.homeTeam}-${match.awayTeam}-${index}`
          }
          fallback={<MatchCardSkeleton theme={theme} />}
        >
          <MatchCard
            match={match}
            isLive={!!match.isLive}
            selections={selections}
            onAddSelection={onAddSelection}
            onOpenMarkets={onOpenMarkets}
            index={index}
          />
        </Suspense>
      ))}
    </div>
  );
};

/* -------------------------------------------------
   Main HomePage component
   ------------------------------------------------- */
export default function HomePage() {
  const navigate = useNavigate();

  // ---- State -------------------------------------------------
  const [selections, setSelections] = useState([]);
  const [activeTab, setActiveTab] = useState<"sports" | "live">("sports");
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [selectedSport, setSelectedSport] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isBetSlipExpanded, setIsBetSlipExpanded] = useState(false);
  const [toasts, setToasts] = useState([]);

  const previousOddsRef = useRef(new Map());
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null); // ✅ Ref para intervalo

  // ---- Context / Hooks ----------------------------------------
  const { profile } = useProfile();
  const { theme } = useTheme();
  const isAdmin = profile?.role === "admin" || profile?.role === "operator";

  const {
    matches: liveMatches,
    loading: liveLoading,
    refetch: refreshLive,
  } = useLiveMatches({ autoRefresh: true, interval: 15000, useWebSocket: false });

  const {
    matches: upcomingMatches,
    loading: upcomingLoading,
    refetch: refreshUpcoming,
  } = useUpcomingMatches({ autoRefresh: true, interval: 30000 });

  // ✅ Cleanup de intervalos na desmontagem
  useEffect(() => {
    return () => {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    };
  }, []);

  // ---- Memoised data -----------------------------------------
  const featuredMatches = useMemo(() => {
    const now = Date.now();
    const maxFuture = now + 3 * 24 * 60 * 60 * 1000;

    const normalizeSportKeyLocal = (sport: any): string => {
      const s = String(sport || "").toLowerCase().trim();
      if (!s) return "";
      if (s === "soccer" || s.includes("futebol") || s.includes("football")) return "soccer";
      if (s === "basketball" || s.includes("basquet")) return "basketball";
      if (s === "tennis" || s.includes("ténis") || s.includes("tênis")) return "tennis";
      if (s === "ice-hockey" || s.includes("hóquei") || s.includes("hockey")) return "ice-hockey";
      if (s === "baseball" || s.includes("basebol")) return "baseball";
      if (s === "american-football" || s === "nfl" || s.includes("futebol americano") || s.includes("futebol-americano")) return "american-football";
      if (s === "cricket" || s.includes("críquete") || s.includes("criquete")) return "cricket";
      if (s === "rugby" || s.includes("rúgbi")) return "rugby";
      if (s === "volleyball" || s.includes("voleibol") || s.includes("vôlei")) return "volleyball";
      if (s === "handball" || s.includes("andebol")) return "handball";
      if (s === "mma") return "mma";
      if (s === "formula1" || s.includes("fórmula 1") || s.includes("formula 1") || s.includes("formula1")) return "formula1";
      if (s === "golf" || s.includes("golfe") || s.includes("pga")) return "golf";
      if (s === "horse-racing" || s.includes("cavalos") || s.includes("horse")) return "horse-racing";
      if (s === "afl") return "afl";
      return s;
    };

    const isBigFootballLeagueLocal = (league: string) => {
      const l = String(league || "").toLowerCase();
      const neg =
        l.includes("serie b") ||
        l.includes("segunda") ||
        l.includes("2. liga") ||
        l.includes("liga 2") ||
        l.includes("2ª") ||
        l.includes("ii") ||
        l.includes("bundesliga 2") ||
        l.includes("la liga 2") ||
        l.includes("ligue 2") ||
        l.includes("championship");
      if (neg) return false;
      return (
        l.includes("champions league") ||
        l.includes("uefa champions") ||
        l.includes("europa league") ||
        l.includes("uefa europa") ||
        l.includes("premier league") ||
        l.includes("la liga") ||
        l.includes("liga portugal") ||
        l.includes("primeira liga") ||
        (l.includes("serie a") && !l.includes("serie a2")) ||
        (l.includes("bundesliga") && !l.includes("2")) ||
        (l.includes("ligue 1") && !l.includes("ligue 2"))
      );
    };

    const startTimeMsLocal = (m: any): number => {
      const d = new Date(m?.startTime || m?.event_date || "");
      const t = d.getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const allMatches = [...(liveMatches || []), ...(upcomingMatches || [])].filter((m) => {
      if (m?.isLive) return true;
      const t = startTimeMsLocal(m);
      if (!t) return false;
      if (t <= maxFuture) return true;
      const sk = normalizeSportKeyLocal(m?.sport);
      if (sk !== "soccer") return false;
      return isBigFootballLeagueLocal(m?.league);
    });
    const validMatches = allMatches.filter(
      (m) => m.odds?.home && m.odds?.away
    );

    const featured = [];
    const usedLeagues = new Set();

    for (const match of validMatches) {
      if (featured.length >= 3) break;
      if (!usedLeagues.has(match.league)) {
        usedLeagues.add(match.league);
        featured.push({
          match,
          isLive: !!match.isLive,
          style: bannerStyles[featured.length % 3],
        });
      }
    }

    if (featured.length < 3) {
      for (const match of validMatches) {
        if (featured.length >= 3) break;
        if (!featured.some((f) => f.match.id === match.id)) {
          featured.push({
            match,
            isLive: !!match.isLive,
            style: bannerStyles[featured.length % 3],
          });
        }
      }
    }

    return featured;
  }, [liveMatches, upcomingMatches]);

  const normalizeSportKey = useCallback((sport: any): string => {
    const s = String(sport || "").toLowerCase().trim();
    if (!s) return "";
    if (s === "soccer" || s.includes("futebol") || s.includes("football")) return "soccer";
    if (s === "basketball" || s.includes("basquet")) return "basketball";
    if (s === "tennis" || s.includes("ténis") || s.includes("tênis")) return "tennis";
    if (s === "ice-hockey" || s.includes("hóquei") || s.includes("hockey")) return "ice-hockey";
    if (s === "baseball" || s.includes("basebol")) return "baseball";
    if (s === "american-football" || s === "nfl" || s.includes("futebol americano") || s.includes("futebol-americano")) return "american-football";
    if (s === "cricket" || s.includes("críquete") || s.includes("criquete")) return "cricket";
    if (s === "rugby" || s.includes("rúgbi")) return "rugby";
    if (s === "volleyball" || s.includes("voleibol") || s.includes("vôlei")) return "volleyball";
    if (s === "handball" || s.includes("andebol")) return "handball";
    if (s === "mma") return "mma";
    if (s === "formula1" || s.includes("fórmula 1") || s.includes("formula 1") || s.includes("formula1")) return "formula1";
    if (s === "golf" || s.includes("golfe") || s.includes("pga")) return "golf";
    if (s === "horse-racing" || s.includes("cavalos") || s.includes("horse")) return "horse-racing";
    if (s === "afl") return "afl";
    return s;
  }, []);

  const isBigFootballLeague = useCallback((league: string) => {
    const l = String(league || "").toLowerCase();
    const neg =
      l.includes("serie b") ||
      l.includes("segunda") ||
      l.includes("2. liga") ||
      l.includes("liga 2") ||
      l.includes("2ª") ||
      l.includes("ii") ||
      l.includes("bundesliga 2") ||
      l.includes("la liga 2") ||
      l.includes("ligue 2") ||
      l.includes("championship");
    if (neg) return false;

    return (
      l.includes("champions league") ||
      l.includes("uefa champions") ||
      l.includes("europa league") ||
      l.includes("uefa europa") ||
      l.includes("premier league") ||
      l.includes("la liga") ||
      l.includes("liga portugal") ||
      l.includes("primeira liga") ||
      (l.includes("serie a") && !l.includes("serie a2")) ||
      (l.includes("bundesliga") && !l.includes("2")) ||
      (l.includes("ligue 1") && !l.includes("ligue 2"))
    );
  }, []);

  const startTimeMs = useCallback((m: any): number => {
    const d = new Date(m?.startTime || m?.event_date || "");
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
  }, []);

  const footballLeagueRank = useCallback((league: string): number => {
    const l = String(league || "").toLowerCase();
    if (l.includes("champions league") || l.includes("uefa champions")) return 1;
    if (l.includes("europa league") || l.includes("uefa europa")) return 2;
    if (l.includes("premier league")) return 3;
    if (l.includes("la liga")) return 4;
    if (l.includes("liga portugal") || l.includes("primeira liga")) return 5;
    if (l.includes("serie a") && !l.includes("serie b")) return 6;
    if (l.includes("bundesliga") && !l.includes("2")) return 7;
    if (l.includes("ligue 1") && !l.includes("ligue 2")) return 8;
    return 50;
  }, []);

  const sportPriorityRank = useCallback((sportKey: string): number => {
    if (sportKey === "soccer") return 1;
    if (sportKey === "tennis") return 2;
    if (sportKey === "basketball") return 3;
    if (sportKey === "ice-hockey") return 4;
    if (sportKey === "baseball") return 5;
    if (sportKey === "american-football") return 6;
    if (sportKey === "cricket") return 7;
    if (sportKey === "rugby") return 8;
    if (sportKey === "volleyball") return 9;
    if (sportKey === "handball") return 10;
    if (sportKey === "mma") return 11;
    if (sportKey === "formula1") return 12;
    if (sportKey === "golf") return 13;
    if (sportKey === "horse-racing") return 14;
    if (sportKey === "afl") return 15;
    return 99;
  }, []);

  const baseLiveMatches = useMemo(() => {
    const now = Date.now();
    const startSoonMin = 30 * 60 * 1000;
    const startSoonMax = 60 * 60 * 1000;

    const baseLive = liveMatches || [];
    const baseUpcoming = upcomingMatches || [];

    const liveIds = new Set(baseLive.map((m) => String(m?.id || "")));
    const startingSoon = baseUpcoming
      .filter((m) => {
        const t = startTimeMs(m);
        if (!t) return false;
        const diff = t - now;
        return diff >= startSoonMin && diff <= startSoonMax;
      })
      .filter((m) => !liveIds.has(String(m?.id || "")));

    const combined = [...baseLive, ...startingSoon].sort((a, b) => {
      const aLive = a?.isLive ? 1 : 0;
      const bLive = b?.isLive ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;

      const as = normalizeSportKey(a?.sport);
      const bs = normalizeSportKey(b?.sport);
      const apr = sportPriorityRank(as);
      const bpr = sportPriorityRank(bs);
      if (apr !== bpr) return apr - bpr;

      if (as === "soccer" && bs === "soccer") {
        const ar = footballLeagueRank(a?.league);
        const br = footballLeagueRank(b?.league);
        if (ar !== br) return ar - br;
      }

      const at = startTimeMs(a);
      const bt = startTimeMs(b);
      if (at && bt && at !== bt) return at - bt;
      return String(a?.league || "").localeCompare(String(b?.league || ""), "pt-PT");
    });

    const limited = combined.slice(0, 150);
    if (limited.length >= 10) return limited;
    return combined.slice(0, Math.min(150, Math.max(10, combined.length)));
  }, [liveMatches, upcomingMatches, normalizeSportKey, startTimeMs, sportPriorityRank, footballLeagueRank]);

  const baseUpcomingMatches = useMemo(() => {
    const now = Date.now();
    const maxFuture = now + 3 * 24 * 60 * 60 * 1000;

    const matches = upcomingMatches || [];

    const filtered = matches.filter((m) => {
      const t = startTimeMs(m);
      if (!t) return false;
      if (t <= maxFuture) return true;
      const sk = normalizeSportKey(m?.sport);
      if (sk !== "soccer") return false;
      return isBigFootballLeague(m?.league);
    });

    const bySport: Record<string, any[]> = {};
    for (const m of filtered) {
      const k = normalizeSportKey(m?.sport);
      if (!k) continue;
      if (!bySport[k]) bySport[k] = [];
      bySport[k].push(m);
    }

    const sortByTime = (a: any, b: any) => startTimeMs(a) - startTimeMs(b);
    const soccerSorted = (bySport["soccer"] || []).slice().sort((a, b) => {
      const ar = footballLeagueRank(a?.league);
      const br = footballLeagueRank(b?.league);
      if (ar !== br) return ar - br;
      return sortByTime(a, b);
    });
    const tennisSorted = (bySport["tennis"] || []).slice().sort(sortByTime);
    const basketSorted = (bySport["basketball"] || []).slice().sort(sortByTime);

    const otherSports = Object.entries(bySport)
      .filter(([k]) => !["soccer", "tennis", "basketball"].includes(k))
      .flatMap(([, list]) => list)
      .sort((a, b) => {
        const as = normalizeSportKey(a?.sport);
        const bs = normalizeSportKey(b?.sport);
        const apr = sportPriorityRank(as);
        const bpr = sportPriorityRank(bs);
        if (apr !== bpr) return apr - bpr;
        return sortByTime(a, b);
      });

    const out: any[] = [];
    const take = (arr: any[], n: number) => {
      for (const it of arr) {
        if (out.length >= 45) return;
        if (n <= 0) return;
        out.push(it);
        n--;
      }
    };

    take(soccerSorted, 20);
    take(tennisSorted, 10);
    take(basketSorted, 8);
    take(otherSports, 7);

    if (out.length < 45) {
      const used = new Set(out.map((m) => String(m?.id || "")));
      const remaining = [...soccerSorted, ...tennisSorted, ...basketSorted, ...otherSports].filter(
        (m) => !used.has(String(m?.id || ""))
      );
      remaining.sort((a, b) => {
        const as = normalizeSportKey(a?.sport);
        const bs = normalizeSportKey(b?.sport);
        const apr = sportPriorityRank(as);
        const bpr = sportPriorityRank(bs);
        if (apr !== bpr) return apr - bpr;
        if (as === "soccer" && bs === "soccer") {
          const ar = footballLeagueRank(a?.league);
          const br = footballLeagueRank(b?.league);
          if (ar !== br) return ar - br;
        }
        return sortByTime(a, b);
      });
      for (const it of remaining) {
        if (out.length >= 45) break;
        out.push(it);
      }
    }

    return out.slice(0, 45);
  }, [upcomingMatches, normalizeSportKey, startTimeMs, isBigFootballLeague, sportPriorityRank, footballLeagueRank]);

  const activeLeagues = useMemo<
    { league: string; sport: string; count: number }[]
  >(() => {
    const allMatches = [...(baseLiveMatches || []), ...(baseUpcomingMatches || [])];
    const leagueCounts: Record<string, { league: string; sport: string; count: number }> = {};

    allMatches.forEach((match: any) => {
      const league = match.league || "";
      if (!league) return;
      const sport = match.sport || "football";

      if (!leagueCounts[league]) {
        leagueCounts[league] = {
          league,
          sport,
          count: 0,
        };
      }
      leagueCounts[league].count += 1;
    });

    return Object.values(leagueCounts);
  }, [baseLiveMatches, baseUpcomingMatches]);

  const filteredLiveMatches = useMemo(() => {
    let matches = baseLiveMatches || [];

    if (selectedLeague) {
      const sl = selectedLeague.toLowerCase();
      matches = matches.filter((m) => String(m?.league || "").toLowerCase().includes(sl));
    } else if (selectedSport) {
      matches = matches.filter((m) => normalizeSportKey(m?.sport) === selectedSport);
    }

    return matches;
  }, [baseLiveMatches, selectedLeague, selectedSport, normalizeSportKey]);

  const filteredUpcomingMatches = useMemo(() => {
    let matches = baseUpcomingMatches || [];
    if (selectedLeague) {
      const sl = selectedLeague.toLowerCase();
      matches = matches.filter((m) => String(m?.league || "").toLowerCase().includes(sl));
    } else if (selectedSport) {
      matches = matches.filter((m) => normalizeSportKey(m?.sport) === selectedSport);
    }
    return matches;
  }, [baseUpcomingMatches, selectedLeague, selectedSport, normalizeSportKey]);

  // ---- Toast helpers -----------------------------------------
  const showToast = useCallback((message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2000);
  }, []);

  const showOddsChangeToast = useCallback(
    (homeTeam, awayTeam, selection, oldOdd, newOdd, isIncrease) => {
      const id = Date.now();
      const message = `${selection}: ${oldOdd.toFixed(2)} → ${newOdd.toFixed(2)}`;
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          type: isIncrease ? "success" : "warning",
          matchInfo: `${homeTeam} vs ${awayTeam}`,
          isOddsChange: true,
          isIncrease,
        },
      ]);

      if ("vibrate" in navigator) {
        navigator.vibrate(isIncrease ? [100, 50, 100] : [200]);
      }

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  // ---- Selection handlers --------------------------------------
  const handleAddSelection = useCallback(
    (match, selection, odd, market = "1X2") => {
      startTransition(() => {
        setSelections((prev) => {
          const exists = prev.find(
            (s) =>
              s.homeTeam === match.homeTeam &&
              s.awayTeam === match.awayTeam &&
              s.selection === selection
          );
          if (exists) {
            showToast("Já no boletim!");
            return prev;
          }
          showToast("Adicionado ao boletim!");
          return [
            ...prev,
            {
              id: Date.now(),
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              selection,
              odd,
              league: match.league,
              market,
              matchId: match.id || `${match.homeTeam}-${match.awayTeam}`,
            },
          ];
        });
      });
    },
    [showToast]
  );

  const handleRemoveSelection = useCallback((id) => {
    startTransition(() => {
      setSelections((prev) => prev.filter((s) => s.id !== id));
    });
  }, []);

  const handleClearAll = useCallback(() => {
    startTransition(() => {
      setSelections([]);
    });
  }, []);

  const handleOpenMarkets = useCallback(
    (match) => {
      if (match.id) {
        navigate(`/match/${match.id}`);
      }
    },
    [navigate]
  );

  const getFilterTitle = () => selectedLeague || selectedSport || null;

  // ---- Odds monitoring ----------------------------------------
  useEffect(() => {
    if (selections.length === 0) return;

    const allMatches = [...(liveMatches || []), ...(upcomingMatches || [])];

    selections.forEach((selection) => {
      const matchId =
        selection.matchId ||
        `${selection.homeTeam}-${selection.awayTeam}`;
      const match = allMatches.find(
        (m) =>
          m.id === matchId ||
          (m.homeTeam === selection.homeTeam && m.awayTeam === selection.awayTeam)
      );

      if (match && match.odds) {
        let currentOdd;
        if (selection.selection === match.homeTeam || selection.selection === "1") {
          currentOdd = match.odds.home;
        } else if (selection.selection === match.awayTeam || selection.selection === "2") {
          currentOdd = match.odds.away;
        } else if (
          selection.selection === "Empate" ||
          selection.selection === "X"
        ) {
          currentOdd = match.odds.draw;
        }

        if (currentOdd !== undefined) {
          const key = `${matchId}-${selection.selection}`;
          const previousOdd = previousOddsRef.current.get(key);

          if (previousOdd !== undefined && previousOdd !== currentOdd) {
            const isIncrease = currentOdd > previousOdd;
            showOddsChangeToast(
              selection.homeTeam,
              selection.awayTeam,
              selection.selection,
              previousOdd,
              currentOdd,
              isIncrease
            );

            startTransition(() => {
              setSelections((prev) =>
                prev.map((s) =>
                  s.id === selection.id ? { ...s, odd: currentOdd } : s
                )
              );
            });
          }

          previousOddsRef.current.set(key, currentOdd);
        }
      }
    });
  }, [
    liveMatches,
    upcomingMatches,
    selections,
    showOddsChangeToast,
  ]);

  const toggleBetSlipExpanded = useCallback(() => {
    setIsBetSlipExpanded((prev) => !prev);
  }, []);

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  return (
    <div className={`min-h-screen ${theme === "dark" ? "bg-gray-900" : "bg-gray-100"}`}>
      {/* Header */}
      <Header
        activeTab={activeTab}
        onSportsClick={() => {
          setActiveTab("sports");
          navigate("/");
        }}
        onLiveClick={() => {
          setActiveTab("live");
          navigate("/desportos-ao-vivo");
        }}
        isAdmin={isAdmin}
        onOpenMobileMenu={() => setShowMobileMenu(true)}
      />

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowMobileMenu(false)}
          ></div>
          <div
            className={`absolute left-0 top-0 bottom-0 w-64 ${
              theme === "dark"
                ? "bg-gray-900 border-gray-800"
                : "bg-white border-gray-200"
            } border-r overflow-y-auto animate-slide-in-left`}
          >
            <div
              className={`flex items-center justify-between px-3 py-2.5 border-b ${
                theme === "dark" ? "border-gray-800" : "border-gray-200"
              }`}
            >
              <span
                className={`text-sm font-black ${
                  theme === "dark" ? "text-white" : "text-gray-900"
                }`}
              >
                BET<span className="text-red-600">62</span>
              </span>
              <button
                onClick={() => setShowMobileMenu(false)}
                className={`w-6 h-6 flex items-center justify-center ${
                  theme === "dark" ? "bg-gray-800" : "bg-gray-100"
                } rounded-md cursor-pointer`}
              >
                <i
                  className={`ri-close-line ${
                    theme === "dark" ? "text-white" : "text-gray-700"
                  } text-sm`}
                ></i>
              </button>
            </div>

            <SportsMenu
              onSelectLeague={(league) => {
                setSelectedLeague(league);
                setShowMobileMenu(false);
              }}
              onSelectSport={(sport) => {
                setSelectedSport(sport);
                setShowMobileMenu(false);
              }}
              selectedLeague={selectedLeague}
              selectedSport={selectedSport}
              isDarkMode={theme === "dark"}
              activeLeagues={activeLeagues}
            />
          </div>
        </div>
      )}

      {/* Mobile Tab Bar */}
      <div
        className={`lg:hidden fixed top-11 left-0 right-0 z-30 ${
          theme === "dark"
            ? "bg-gray-900/95 border-gray-800/50"
            : "bg-white/95 border-gray-200"
        } backdrop-blur-md border-b px-2 py-1.5`}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setActiveTab("sports")}
            className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap cursor-pointer transition-all ${
              activeTab === "sports"
                ? "bg-red-600 text-white"
                : theme === "dark"
                ? "bg-gray-800/80 text-gray-400"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            <i className="ri-football-line mr-1"></i>Esportes
          </button>
          <button
            onClick={() => navigate("/desportos-ao-vivo")}
            className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap cursor-pointer transition-all ${
              activeTab === "live"
                ? "bg-red-500 text-white"
                : theme === "dark"
                ? "bg-gray-800/80 text-gray-400"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            <span className="w-1 h-1 bg-red-400 rounded-full inline-block mr-1 animate-pulse"></span>Ao Vivo
          </button>
          {isAdmin && (
            <Link
              to="/admin"
              className="px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap cursor-pointer bg-gradient-to-r from-red-600 to-red-700 text-white"
            >
              <i className="ri-dashboard-3-line mr-1"></i>Painel
            </Link>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex pt-[76px] md:pt-[90px] lg:pt-[68px]">
        {/* Left sidebar (desktop) */}
        <aside
          className={`hidden lg:block w-52 ${
            theme === "dark"
              ? "bg-gray-900 border-gray-700/50"
              : "bg-white border-gray-200"
          } border-r fixed left-0 top-16 bottom-0 overflow-y-auto`}
          style={{
            scrollbarWidth: "thin",
            scrollbarColor:
              theme === "dark"
                ? "#374151 transparent"
                : "#d1d5db transparent",
          }}
        >
          <SportsMenu
            onSelectLeague={setSelectedLeague}
            onSelectSport={setSelectedSport}
            selectedLeague={selectedLeague}
            selectedSport={selectedSport}
            isDarkMode={theme === "dark"}
            activeLeagues={activeLeagues}
          />
        </aside>

        {/* Main content */}
        <main
          className={`w-full lg:ml-52 lg:mr-64 min-h-screen lg:pb-0 transition-all duration-300`}
          style={{
            paddingBottom:
              selections.length > 0
                ? isBetSlipExpanded
                  ? "90vh"
                  : "140px"
                : "56px",
          }}
        >
          {/* Hero banners */}
          <div className="px-2 lg:px-3 py-2">
            <div className="flex items-center gap-1.5 mb-2">
              <i className="ri-star-fill text-red-500 text-xs"></i>
              <h2 className={`text-xs font-bold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>Destaques</h2>
            </div>
            <Suspense
              fallback={
                <div
                  className={`h-32 ${
                    theme === "dark" ? "bg-gray-800/50" : "bg-gray-200"
                  } rounded-xl animate-pulse`}
                ></div>
              }
            >
              <HeroBanners
                featuredMatches={featuredMatches}
                onSelectMatch={handleOpenMarkets}
                onAddSelection={handleAddSelection}
              />
            </Suspense>
          </div>

          {/* Filter indicator */}
            {getFilterTitle() && (
              <div
                className={`mx-2 lg:mx-3 mb-2 flex items-center justify-between ${
                  theme === "dark"
                    ? "bg-red-600/5 border-red-600/30"
                    : "bg-red-50 border-red-200"
                } border rounded-md px-2 py-1.5`}
              >
              <div className="flex items-center gap-1.5">
                <i className="ri-filter-3-line text-red-400 text-[10px]"></i>
                <span className={`text-[10px] font-medium ${theme === "dark" ? "text-red-400/80" : "text-red-600"}`}>Filtro:</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    theme === "dark"
                      ? "bg-red-600/15 text-red-300"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {getFilterTitle()}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedLeague(null);
                  setSelectedSport(null);
                }}
                className={`text-[10px] cursor-pointer flex items-center gap-0.5 ${
                  theme === "dark" ? "text-gray-500 hover:text-white" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <i className="ri-close-circle-line"></i>Limpar
              </button>
            </div>
          )}

          {/* Live / Upcoming sections */}
          <div className="px-2 lg:px-3 pb-6">
            {activeTab === "live" && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 flex items-center justify-center ${
                        theme === "dark" ? "bg-red-500/15" : "bg-red-100"
                      } rounded-md`}
                    >
                      <i className="ri-live-line text-red-400 text-xs"></i>
                    </div>
                    <div>
                      <h2 className={`text-xs font-bold leading-tight ${theme === "dark" ? "text-white" : "text-gray-900"}`}>Ao Vivo</h2>
                      <span className={`text-[9px] ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                        {liveLoading ? "..." : `${filteredLiveMatches.length} jogos`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <div className="flex items-center gap-0.5">
                        <i className="ri-refresh-line text-[10px] text-emerald-400 animate-spin" style={{ animationDuration: "3s" }}></i>
                        <span className={`text-[8px] ${theme === "dark" ? "text-emerald-400/70" : "text-emerald-600"}`}>tempo real</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={refreshLive}
                    disabled={liveLoading}
                    className={`w-6 h-6 flex items-center justify-center ${
                      theme === "dark"
                        ? "bg-gray-800/50 hover:bg-gray-800"
                        : "bg-gray-200 hover:bg-gray-300"
                    } rounded-md cursor-pointer disabled:opacity-40 transition-colors`}
                  >
                    <i className={`ri-refresh-line text-red-400 text-[10px] ${liveLoading ? "animate-spin" : ""}`}></i>
                  </button>
                </div>

                <Suspense fallback={<MatchListSkeleton count={5} theme={theme} />}>
                  {liveLoading && filteredLiveMatches.length === 0 ? (
                    <MatchListSkeleton count={5} theme={theme} />
                  ) : filteredLiveMatches.length > 0 ? (
                    <MatchList
                      matches={filteredLiveMatches}
                      selections={selections}
                      onAddSelection={handleAddSelection}
                      onOpenMarkets={handleOpenMarkets}
                      theme={theme}
                    />
                  ) : (
                    <div className="text-center py-10">
                      <div
                        className={`w-10 h-10 flex items-center justify-center ${
                          theme === "dark" ? "bg-gray-800/30" : "bg-gray-200"
                        } rounded-xl mx-auto mb-2`}
                      >
                        <i className={`ri-live-line text-xl ${theme === "dark" ? "text-gray-700" : "text-gray-400"}`}></i>
                      </div>
                      <p className={`text-xs font-medium ${theme === "dark" ? "text-gray-500" : "text-gray-600"}`}>Nenhum jogo ao vivo</p>
                      <p className={`text-[10px] mt-0.5 ${theme === "dark" ? "text-gray-600" : "text-gray-500"}`}>Volte mais tarde</p>
                    </div>
                  )}
                </Suspense>
              </section>
            )}

            {activeTab === "sports" && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 flex items-center justify-center ${
                        theme === "dark" ? "bg-red-500/10" : "bg-red-100"
                      } rounded-md`}
                    >
                      <i className="ri-calendar-line text-red-500 text-xs"></i>
                    </div>
                    <div>
                      <h2 className={`text-xs font-bold leading-tight ${theme === "dark" ? "text-white" : "text-gray-900"}`}>Pré-Jogos</h2>
                      <span className={`text-[9px] ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                        {upcomingLoading ? "..." : `${filteredUpcomingMatches.length} jogos`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={refreshUpcoming}
                    disabled={upcomingLoading}
                    className={`w-6 h-6 flex items-center justify-center ${
                      theme === "dark"
                        ? "bg-gray-800/50 hover:bg-gray-800"
                        : "bg-gray-200 hover:bg-gray-300"
                    } rounded-md cursor-pointer disabled:opacity-40 transition-colors`}
                  >
                    <i className={`ri-refresh-line text-red-500 text-[10px] ${upcomingLoading ? "animate-spin" : ""}`}></i>
                  </button>
                </div>

                <Suspense fallback={<MatchListSkeleton count={5} theme={theme} />}>
                  {upcomingLoading && filteredUpcomingMatches.length === 0 ? (
                    <MatchListSkeleton count={5} theme={theme} />
                  ) : filteredUpcomingMatches.length > 0 ? (
                    <MatchList
                      matches={filteredUpcomingMatches}
                      selections={selections}
                      onAddSelection={handleAddSelection}
                      onOpenMarkets={handleOpenMarkets}
                      theme={theme}
                    />
                  ) : (
                    <div className="text-center py-10">
                      <div
                        className={`w-10 h-10 flex items-center justify-center ${
                          theme === "dark" ? "bg-gray-800/30" : "bg-gray-200"
                        } rounded-xl mx-auto mb-2`}
                      >
                        <i className={`ri-calendar-line text-xl ${theme === "dark" ? "text-gray-700" : "text-gray-400"}`}></i>
                      </div>
                      <p className={`text-xs font-medium ${theme === "dark" ? "text-gray-500" : "text-gray-600"}`}>Nenhum pré-jogo disponível</p>
                      <button
                        onClick={refreshUpcoming}
                        className="mt-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-md cursor-pointer whitespace-nowrap transition-colors"
                      >
                        <i className="ri-refresh-line mr-1"></i>Tentar novamente
                      </button>
                    </div>
                  )}
                </Suspense>
              </section>
            )}
          </div>

          <Footer />
        </main>

        {/* Right sidebar – Betting slip (desktop) */}
        <aside
          className={`hidden lg:block w-64 ${
            theme === "dark"
              ? "bg-gray-900 border-gray-800/50"
              : "bg-white border-gray-200"
          } border-l fixed right-0 top-16 bottom-0 overflow-hidden`}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            }
          >
            <BettingSlipPanel
              selections={selections}
              onRemoveSelection={handleRemoveSelection}
              onClearAll={handleClearAll}
              onClose={() => {}}
              onSwipeClose={() => {}}
            />
          </Suspense>
        </aside>
      </div>

      {/* Mobile betting slip */}
      <div className="lg:hidden">
        <Suspense fallback={null}>
          <MobileBettingSlip
            selections={selections}
            onRemoveSelection={handleRemoveSelection}
            onClearAll={handleClearAll}
            isExpanded={isBetSlipExpanded}
            onToggleExpand={toggleBetSlipExpanded}
          />
        </Suspense>
      </div>

      {/* Bottom navigation (mobile) */}
      <MobileBottomNav
        onHomeClick={() => setActiveTab("sports")}
        onBetSlipClick={toggleBetSlipExpanded}
        betCount={selections.length}
      />

      {/* Toasts */}
      <div className="fixed top-14 right-2 z-50 space-y-1.5 max-w-xs">
        {toasts.map((toast) => (
          <div
            key={`toast-${toast.id}`}
            className={`
              ${
                toast.isOddsChange
                  ? toast.isIncrease
                    ? theme === "dark"
                      ? "bg-emerald-900/90 border-emerald-500/50"
                      : "bg-emerald-50 border-emerald-300"
                    : theme === "dark"
                    ? "bg-red-900/90 border-red-500/50"
                    : "bg-red-50 border-red-300"
                : theme === "dark"
                  ? "bg-gray-800 border-red-500/40"
                  : "bg-white border-red-300"
              } 
              border px-3 py-2 rounded-lg shadow-2xl animate-slide-in-right
            `}
          >
            {toast.isOddsChange ? (
              <div className="flex items-start gap-2">
                <div
                  className={`
                    w-6 h-6 flex items-center justify-center rounded-full
                    ${toast.isIncrease ? "bg-emerald-500/20" : "bg-red-500/20"}
                  `}
                >
                  <i
                    className={`
                      ${toast.isIncrease ? "ri-arrow-up-line text-emerald-400" : "ri-arrow-down-line text-red-400"}
                      text-sm
                    `}
                  ></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[9px] font-medium truncate ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    {toast.matchInfo}
                  </p>
                  <p
                    className={`text-[11px] font-bold ${
                      toast.isIncrease
                        ? theme === "dark"
                          ? "text-emerald-400"
                          : "text-emerald-600"
                        : theme === "dark"
                        ? "text-red-400"
                        : "text-red-600"
                    }`}
                  >
                    {toast.message}
                  </p>
                  <p className={`text-[8px] ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
                    Odd {toast.isIncrease ? "subiu" : "desceu"}!
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <i className="ri-check-circle-fill text-red-500 text-xs"></i>
                <span className={`text-[10px] font-semibold ${theme === "dark" ? "text-white" : "text-gray-700"}`}>
                  {toast.message}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
