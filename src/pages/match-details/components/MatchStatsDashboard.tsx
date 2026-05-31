import { useEffect, useMemo } from 'react';
import { useMatchStatistics } from '../../../hooks/useMatchStatistics';

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function formatPercent(n: number): string {
  const v = clampPercent(n);
  return `${Math.round(v)}%`;
}

function getFormPoints(form: ('W' | 'D' | 'L')[]): number {
  return form.reduce((acc, r) => acc + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
}

function computeProbabilities(params: {
  h2h?: { homeWins: number; draws: number; awayWins: number; total: number };
  homeForm?: { wins: number; draws: number; losses: number; form: ('W' | 'D' | 'L')[] };
  awayForm?: { wins: number; draws: number; losses: number; form: ('W' | 'D' | 'L')[] };
}): { homeWin: number; draw: number; awayWin: number; counts: { homeWins: number; draws: number; awayWins: number } } {
  const h2hTotal = params.h2h?.total || 0;
  const h2hHome = params.h2h?.homeWins || 0;
  const h2hDraw = params.h2h?.draws || 0;
  const h2hAway = params.h2h?.awayWins || 0;

  const homeFormPoints = params.homeForm ? getFormPoints(params.homeForm.form) : 0;
  const awayFormPoints = params.awayForm ? getFormPoints(params.awayForm.form) : 0;
  const formGames = params.homeForm?.form?.length && params.awayForm?.form?.length ? Math.min(params.homeForm.form.length, params.awayForm.form.length) : 0;
  const formMax = formGames * 3 || 1;

  const formHomeStrength = homeFormPoints / formMax;
  const formAwayStrength = awayFormPoints / formMax;

  const h2hHomeP = h2hTotal ? h2hHome / h2hTotal : 0;
  const h2hDrawP = h2hTotal ? h2hDraw / h2hTotal : 0;
  const h2hAwayP = h2hTotal ? h2hAway / h2hTotal : 0;

  const formHomeP = formHomeStrength / (formHomeStrength + formAwayStrength || 1);
  const formAwayP = formAwayStrength / (formHomeStrength + formAwayStrength || 1);
  const formDrawP = 0.18;

  const wH2h = h2hTotal > 0 ? 0.55 : 0.0;
  const wForm = 0.45;

  let homeWin = (h2hHomeP * wH2h + formHomeP * wForm) * 100;
  let awayWin = (h2hAwayP * wH2h + formAwayP * wForm) * 100;
  let draw = (h2hDrawP * wH2h + formDrawP * wForm) * 100;

  const total = homeWin + draw + awayWin || 1;
  homeWin = (homeWin / total) * 100;
  draw = (draw / total) * 100;
  awayWin = (awayWin / total) * 100;

  return {
    homeWin: clampPercent(homeWin),
    draw: clampPercent(draw),
    awayWin: clampPercent(awayWin),
    counts: { homeWins: h2hHome, draws: h2hDraw, awayWins: h2hAway },
  };
}

function computeH2HMetrics(h2hMatches: any[] | undefined) {
  const matches = Array.isArray(h2hMatches) ? h2hMatches : [];
  if (!matches.length) {
    return {
      avgGoals: null as number | null,
      over15: null as number | null,
      over25: null as number | null,
      btts: null as number | null,
    };
  }

  const totals = matches.map((m) => (m?.goals?.home ?? 0) + (m?.goals?.away ?? 0));
  const avgGoals = totals.reduce((a, b) => a + b, 0) / totals.length;
  const over15 = (totals.filter((t) => t > 1.5).length / totals.length) * 100;
  const over25 = (totals.filter((t) => t > 2.5).length / totals.length) * 100;
  const btts = (matches.filter((m) => (m?.goals?.home ?? 0) > 0 && (m?.goals?.away ?? 0) > 0).length / totals.length) * 100;

  return { avgGoals, over15, over25, btts };
}

function ResultPill({ r }: { r: 'W' | 'D' | 'L' }) {
  const cls =
    r === 'W' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : r === 'D' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30';
  return <span className={`w-6 h-6 rounded-md border flex items-center justify-center text-[10px] font-bold ${cls}`}>{r}</span>;
}

function RecentGamesCard({
  title,
  accent,
  teamForm,
}: {
  title: string;
  accent: 'blue' | 'red';
  teamForm: any | null;
}) {
  const headerColor = accent === 'blue' ? 'text-blue-400' : 'text-red-400';
  const borderColor = accent === 'blue' ? 'border-blue-500/30' : 'border-red-500/30';

  const matches = teamForm?.matches || [];

  return (
    <div className="bg-[#141416] border border-[#1A1A1D] rounded-xl overflow-hidden">
      <div className={`px-4 py-3 border-b border-[#1A1A1D] flex items-center justify-between`}>
        <h3 className={`text-xs font-bold uppercase tracking-wider ${headerColor}`}>{title}</h3>
        {teamForm?.form?.length ? (
          <div className="flex items-center gap-1.5">
            {teamForm.form.slice(0, 5).map((r: any, idx: number) => (
              <ResultPill key={`${r}-${idx}`} r={r} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="p-3 space-y-2">
        {matches.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-500">Sem dados</div>
        ) : (
          matches.map((m: any, idx: number) => {
            const date = m?.fixture?.date ? new Date(m.fixture.date) : null;
            const isHome = m?.teams?.home?.id === teamForm?.teamId;
            const scored = isHome ? (m?.goals?.home ?? 0) : (m?.goals?.away ?? 0);
            const conceded = isHome ? (m?.goals?.away ?? 0) : (m?.goals?.home ?? 0);
            const opponent = isHome ? m?.teams?.away : m?.teams?.home;
            const result: 'W' | 'D' | 'L' = scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
            const fmt = date ? date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : '';

            return (
              <div key={idx} className={`flex items-center gap-3 rounded-lg border ${borderColor} bg-[#0F0F10] px-3 py-2`}>
                <ResultPill r={result} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {opponent?.logo ? <img src={opponent.logo} alt="" className="w-4 h-4 object-contain" /> : null}
                    <span className="text-xs text-white font-semibold truncate">{opponent?.name || '-'}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{fmt}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">{scored} - {conceded}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="py-2 border-b border-[#1A1A1D] last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-gray-200 font-semibold truncate">{label}</div>
          {sub ? <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div> : null}
        </div>
        <div className="text-lg font-bold text-white tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function MetricRowButton({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left py-2 border-b border-[#1A1A1D] last:border-b-0 hover:bg-white/5 transition cursor-pointer"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-gray-200 font-semibold truncate">{label}</div>
          {sub ? <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div> : null}
        </div>
        <div className="text-lg font-bold text-white tabular-nums">{value}</div>
      </div>
    </button>
  );
}

function ProbRow({
  label,
  percent,
  color,
}: {
  label: string;
  percent: number;
  color: string;
}) {
  const width = clampPercent(percent);
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-xs text-gray-200 font-semibold mb-1">
        <span className="truncate">{label}</span>
        <span className="tabular-nums">{formatPercent(percent)}</span>
      </div>
      <div className="h-2 bg-[#0F0F10] rounded-full overflow-hidden border border-[#1A1A1D]">
        <div className={`${color} h-full`} style={{ width: `${width}%` }}></div>
      </div>
    </div>
  );
}

export default function MatchStatsDashboard({ match, onOpenMarkets }: { match: any; onOpenMarkets?: () => void }) {
  const homeName = match?.homeTeam || match?.teams?.home?.name || 'Casa';
  const awayName = match?.awayTeam || match?.teams?.away?.name || 'Fora';

  const { headToHead, recentForm, h2hLoading, formLoading, fetchH2H, fetchRecentForm } = useMatchStatistics(null, false, 60000);

  useEffect(() => {
    if (!homeName || !awayName) return;
    if (!headToHead && !h2hLoading) fetchH2H(homeName, awayName);
    if (!recentForm && !formLoading) fetchRecentForm(homeName, awayName);
  }, [homeName, awayName, headToHead, recentForm, h2hLoading, formLoading, fetchH2H, fetchRecentForm]);

  const metrics = useMemo(() => computeH2HMetrics(headToHead?.matches), [headToHead]);

  const probs = useMemo(
    () =>
      computeProbabilities({
        h2h: headToHead
          ? { homeWins: headToHead.homeWins, draws: headToHead.draws, awayWins: headToHead.awayWins, total: headToHead.total }
          : undefined,
        homeForm: recentForm?.home ? { wins: recentForm.home.wins, draws: recentForm.home.draws, losses: recentForm.home.losses, form: recentForm.home.form } : undefined,
        awayForm: recentForm?.away ? { wins: recentForm.away.wins, draws: recentForm.away.draws, losses: recentForm.away.losses, form: recentForm.away.form } : undefined,
      }),
    [headToHead, recentForm],
  );

  const avgGoalsText = metrics.avgGoals == null ? '--' : metrics.avgGoals.toFixed(2);
  const over15Text = metrics.over15 == null ? '--' : formatPercent(metrics.over15);
  const over25Text = metrics.over25 == null ? '--' : formatPercent(metrics.over25);
  const bttsText = metrics.btts == null ? '--' : formatPercent(metrics.btts);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#141416] border border-[#1A1A1D] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1A1A1D]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
              Frente a Frente - Média Equipas
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 px-4">
            <div>
              <MetricRow label="Golos Marcados" value={avgGoalsText} sub="Liga: --" />
              <MetricRow label="Mais de 1.5" value={over15Text} sub="Liga: --" />
              {onOpenMarkets ? (
                <MetricRowButton label="Cartões" value="Ver" sub="Abrir mercados" onClick={onOpenMarkets} />
              ) : (
                <MetricRow label="Total Cartões" value="--" sub="--" />
              )}
            </div>
            <div>
              <MetricRow label="AEM" value={bttsText} sub="Liga: --" />
              <MetricRow label="Mais de 2.5" value={over25Text} sub="Liga: --" />
              <MetricRow label="Cantos" value="--" sub="--" />
            </div>
          </div>
        </div>

        <div className="bg-[#141416] border border-[#1A1A1D] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1A1A1D]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
              Probabilidade de Vitória
            </h3>
          </div>
          <div className="px-4 py-3">
            <ProbRow label={homeName} percent={probs.homeWin} color="bg-blue-500" />
            <ProbRow label="Empate" percent={probs.draw} color="bg-amber-400" />
            <ProbRow label={awayName} percent={probs.awayWin} color="bg-red-500" />

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center bg-[#0F0F10] border border-[#1A1A1D] rounded-lg py-3">
                <div className="text-2xl font-extrabold text-blue-400 tabular-nums">{probs.counts.homeWins || 0}</div>
                <div className="text-[11px] text-gray-400 font-semibold">Vitórias {homeName}</div>
              </div>
              <div className="text-center bg-[#0F0F10] border border-[#1A1A1D] rounded-lg py-3">
                <div className="text-2xl font-extrabold text-amber-400 tabular-nums">{probs.counts.draws || 0}</div>
                <div className="text-[11px] text-gray-400 font-semibold">Empates</div>
              </div>
              <div className="text-center bg-[#0F0F10] border border-[#1A1A1D] rounded-lg py-3">
                <div className="text-2xl font-extrabold text-red-400 tabular-nums">{probs.counts.awayWins || 0}</div>
                <div className="text-[11px] text-gray-400 font-semibold">Vitórias {awayName}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentGamesCard title={`Últimos Jogos - ${homeName}`} accent="blue" teamForm={recentForm?.home || null} />
        <RecentGamesCard title={`Últimos Jogos - ${awayName}`} accent="red" teamForm={recentForm?.away || null} />
      </div>
    </div>
  );
}
