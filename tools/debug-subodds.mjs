const EXPECTED_KEYS = [
  "h2h",
  "h2h_3_way",
  "double_chance",
  "btts",
  "dnb",
  "spreads",
  "alternate_spreads",
  "totals",
  "alternate_totals",
  "cardsTotals",
  "cornersTotals",
  "cornersBtts",
  "first_half_h2h",
  "second_half_h2h",
  "first_half_totals",
  "second_half_totals",
  "team_totals",
  "alternate_team_totals",
  "player_goal_scorer_anytime",
  "player_first_goal_scorer",
  "player_last_goal_scorer",
  "cleanSheet",
  "winToNil",
  "firstTeamToScore",
  "penaltyAwarded",
];

async function main() {
  const base = "http://127.0.0.1:8787";

  console.log("Carregando eventos de /api/events/by-sport...");
  const res = await fetch(`${base}/api/events/by-sport`);
  if (!res.ok) {
    console.error("Falha ao buscar /api/events/by-sport:", res.status, res.statusText);
    process.exit(1);
  }

  const data = await res.json();
  let events = [];
  if (Array.isArray(data.live)) events = events.concat(data.live);
  if (Array.isArray(data.pregame)) events = events.concat(data.pregame);

  console.log(`Total de eventos encontrados: ${events.length}`);
  if (!events.length) {
    console.log("Nenhum evento encontrado.");
    return;
  }

  const limit = Math.min(events.length, 30);
  const seenKeys = new Set();
  const stats = new Map();

  for (let i = 0; i < limit; i++) {
    const evt = events[i];
    const id = evt.id;
    console.log(`\n[${i + 1}/${limit}] Evento ${id} - ${evt.match || `${evt.home_team} vs ${evt.away_team}`}`);

    const detRes = await fetch(`${base}/api/sports/events/${id}`);
    if (!detRes.ok) {
      console.log("  Falha ao buscar detalhes:", detRes.status, detRes.statusText);
      continue;
    }

    const detail = await detRes.json();
    const odds = detail.odds || {};
    const keys = Object.keys(odds);

    if (!keys.length) {
      console.log("  Sem odds neste evento.");
      continue;
    }

    console.log("  Chaves de odds:", keys.join(", "));

    for (const k of keys) {
      seenKeys.add(k);
      const prev = stats.get(k) || { count: 0 };
      prev.count += 1;
      stats.set(k, prev);
    }
  }

  console.log("\n=== Resumo de chaves de odds encontradas ===");
  const allKeys = Array.from(seenKeys).sort();
  for (const k of allKeys) {
    const info = stats.get(k) || { count: 0 };
    const mark = EXPECTED_KEYS.includes(k) ? "OK" : "NOVO";
    console.log(`${k.padEnd(28)} | eventos: ${String(info.count).padStart(3)} | ${mark}`);
  }

  console.log("\n=== Chaves esperadas que não apareceram ===");
  for (const key of EXPECTED_KEYS) {
    if (!seenKeys.has(key)) {
      console.log(key);
    }
  }
}

main().catch((err) => {
  console.error("Erro no debug de sub odds:", err);
  process.exit(1);
});
