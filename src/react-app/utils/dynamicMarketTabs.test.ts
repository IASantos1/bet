import { describe, it, expect } from 'vitest';
import {
  classifyBasketballMarket,
  classifyBaseballMarket,
  classifyTennisMarket,
  classifyVolleyballMarket,
  classifyRugbyMarket,
  classifyMmaMarket,
  classifyIceHockeyMarket,
  classifyHandballMarket,
  buildDynamicMarketTabs,
  BASKETBALL_BUCKET_ORDER,
  BASEBALL_BUCKET_ORDER,
  TENNIS_BUCKET_ORDER,
  VOLLEYBALL_BUCKET_ORDER,
  RUGBY_BUCKET_ORDER,
  MMA_BUCKET_ORDER,
  ICE_HOCKEY_BUCKET_ORDER,
  HANDBALL_BUCKET_ORDER,
} from './dynamicMarketTabs';

// Key lists below mirror what server/services/pulsescore.ts actually produces (confirmed against
// real tennis/volleyball/rugby sample responses) — see server/services/pulsescore.test.ts (if
// present) for the slug-generation side of this; this file covers the frontend's tab/bucket side.

describe('buildDynamicMarketTabs', () => {
  it('every market key ends up in "Todos" and in some named bucket — nothing is dropped', () => {
    const keys = ['h2h', 'ou_2.5', 'ou_3', 'hcp_-1.5', 'btts', 'correct_score', 'some_other_market'];
    const classify = (k: string) => (k === 'h2h' ? 'Vencedor' : k.startsWith('ou_') ? 'Totais' : k.startsWith('hcp') ? 'Handicap' : 'Especiais');
    const tabs = buildDynamicMarketTabs(keys, classify, ['Vencedor', 'Totais', 'Handicap'], (k) => k);

    expect(tabs[0].title).toBe('Todos');
    expect(new Set(tabs[0].keys)).toEqual(new Set(keys));
    const bucketed = new Set(tabs.slice(1).flatMap((t) => t.keys));
    for (const k of keys) expect(bucketed.has(k)).toBe(true);
  });

  it('dedupes "Todos" by resolved title, not raw key, without dropping the market entirely', () => {
    // Two different raw keys that a titler resolves to the same display name (e.g. an alias) —
    // only one should appear in "Todos", but both still exist in their own bucket.
    const keys = ['h2h', 'match_winner_alias'];
    const classify = () => 'Vencedor';
    const title = (k: string) => (k === 'match_winner_alias' ? 'Vencedor da Partida' : 'Vencedor da Partida');
    const tabs = buildDynamicMarketTabs(keys, classify, ['Vencedor'], title);
    expect(tabs[0].keys.length).toBe(1);
    expect(tabs.find((t) => t.title === 'Vencedor')?.keys.length).toBe(2);
  });

  it('an unclassified bucket discovered at runtime (not in bucketOrder) still gets its own tab, ordered before Especiais', () => {
    const keys = ['known_a', 'mystery_b', 'truly_unclassified_c'];
    const classify = (k: string) => (k === 'known_a' ? 'Conhecido' : k === 'mystery_b' ? 'Misterioso' : 'Especiais');
    const tabs = buildDynamicMarketTabs(keys, classify, ['Conhecido'], (k) => k);
    const titles = tabs.map((t) => t.title);
    expect(titles).toContain('Misterioso');
    expect(titles).toContain('Especiais');
    expect(titles.indexOf('Misterioso')).toBeLessThan(titles.indexOf('Especiais'));
  });
});

describe('classifyTennisMarket', () => {
  it('buckets FULL_TIME h2h separately from a FIRST_SET h2h (no collision, matches server-side period suffixing)', () => {
    expect(classifyTennisMarket('h2h')).toBe('Vencedor');
    expect(classifyTennisMarket('h2h_1s')).toBe('1º Set');
  });

  it('routes tennis-specific market bases to their own buckets', () => {
    expect(classifyTennisMarket('total_games_20')).toBe('Total de Jogos');
    expect(classifyTennisMarket('game_hcp_-3.5')).toBe('Handicap');
    expect(classifyTennisMarket('hcp_-1')).toBe('Handicap');
    expect(classifyTennisMarket('correct_score')).toBe('Placar Exato');
    expect(classifyTennisMarket('ou_2.5')).toBe('Totais');
  });

  it('falls back to Especiais for the rawName-derived OTHER-bucket slugs PulseScore actually sends for tennis', () => {
    // These match real slugs from server/services/pulsescore.ts's OTHER-bucket rawName fallback,
    // confirmed against the real tennis single-event sample (see that module's own tests).
    expect(classifyTennisMarket('sets_handicap')).toBe('Especiais');
    expect(classifyTennisMarket('set_match')).toBe('Especiais');
    expect(classifyTennisMarket('1_result_total_19.5')).toBe('Especiais');
  });

  it('a full realistic tennis market key list is fully covered end to end', () => {
    const keys = [
      'h2h', 'h2h_1s',
      'total_games_20', 'total_games_20.5', 'total_games_9.5_1s',
      'hcp_-3.5', 'game_hcp_5.5_1s',
      'correct_score', 'odd_even',
      'sets_handicap_-1.5', 'set_match', 'sets_scoring',
    ];
    const tabs = buildDynamicMarketTabs(keys, classifyTennisMarket, TENNIS_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys.length).toBe(keys.length);
    expect(tabs.some((t) => t.title === '1º Set')).toBe(true);
    expect(tabs.some((t) => t.title === 'Especiais')).toBe(true);
  });
});

describe('classifyVolleyballMarket', () => {
  it('splits FULL_TIME markets from SECOND_SET markets into distinct tabs', () => {
    expect(classifyVolleyballMarket('h2h')).toBe('Vencedor');
    expect(classifyVolleyballMarket('ou_173.5')).toBe('Totais');
    expect(classifyVolleyballMarket('ou_44.5_2s')).toBe('2º Set');
  });

  it('a full realistic volleyball market key list is fully covered end to end', () => {
    const keys = ['h2h', 'ou_173.5', 'hcp_8.5', 'correct_score', 'ou_44.5_2s', 'hcp_2.5_2s', 'score_after_sets', 'set_match'];
    const tabs = buildDynamicMarketTabs(keys, classifyVolleyballMarket, VOLLEYBALL_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys.length).toBe(keys.length);
    expect(tabs.some((t) => t.title === '2º Set')).toBe(true);
  });
});

describe('classifyRugbyMarket', () => {
  it('splits FIRST_HALF/SECOND_HALF markets into 1º/2º Tempo, keeps FULL_TIME markets in their own named buckets', () => {
    expect(classifyRugbyMarket('h2h')).toBe('Resultados');
    expect(classifyRugbyMarket('dc')).toBe('Dupla Chance');
    expect(classifyRugbyMarket('htft')).toBe('HT/FT');
    expect(classifyRugbyMarket('ou_53.5_1h')).toBe('1º Tempo');
    expect(classifyRugbyMarket('hcp_-10.5_2h')).toBe('2º Tempo');
  });

  it('a full realistic rugby market key list (230-market real event shape) is fully covered end to end', () => {
    const keys = [
      'h2h', 'dc', 'ou_53.5', 'hcp_-10.5', 'htft', 'race_to_points_5',
      'ou_44.5_1h', 'hcp_-10.5_1h', 'ou_44.5_2h', 'hcp_-10.5_2h',
      'ht_ft_to_win_by_9.013', 'european_handicap_-5',
    ];
    const tabs = buildDynamicMarketTabs(keys, classifyRugbyMarket, RUGBY_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys.length).toBe(keys.length);
    expect(tabs.some((t) => t.title === '1º Tempo')).toBe(true);
    expect(tabs.some((t) => t.title === '2º Tempo')).toBe(true);
    expect(tabs.some((t) => t.title === 'HT/FT')).toBe(true);
  });
});

describe('classifyMmaMarket', () => {
  it('buckets both h2h and the "win_2way" fallback market (Muay Thai fights with no MATCH_RESULT) under Vencedor', () => {
    // "win_2way" is the slug server/services/pulsescore.ts derives from PulseScore's rawName
    // "Win (2Way)" — the only match-winner market some real mma fights carry (see that module's
    // extractH2H fallback and its own tests). It should read as equivalent to h2h here, not fall
    // into Especiais alongside genuinely secondary markets.
    expect(classifyMmaMarket('h2h')).toBe('Vencedor');
    expect(classifyMmaMarket('win_2way')).toBe('Vencedor');
    expect(classifyMmaMarket('dc')).toBe('Dupla Chance');
    expect(classifyMmaMarket('ou_1.5')).toBe('Totais');
  });

  it('a realistic mma market key list (Muay Thai: win_2way only, no h2h) is fully covered end to end', () => {
    const keys = ['win_2way'];
    const tabs = buildDynamicMarketTabs(keys, classifyMmaMarket, MMA_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys).toEqual(['win_2way']);
    expect(tabs.some((t) => t.title === 'Vencedor' && t.keys.includes('win_2way'))).toBe(true);
  });

  it('a realistic mma market key list (Combatsport event: h2h + win_2way + dc + ou + a secondary OTHER market) is fully covered end to end', () => {
    const keys = ['h2h', 'win_2way', 'dc', 'ou_1.5', 'fight_to_go_the_distance'];
    const tabs = buildDynamicMarketTabs(keys, classifyMmaMarket, MMA_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys.length).toBe(keys.length);
    expect(tabs.find((t) => t.title === 'Vencedor')?.keys.sort()).toEqual(['h2h', 'win_2way']);
    expect(tabs.find((t) => t.title === 'Especiais')?.keys).toEqual(['fight_to_go_the_distance']);
  });
});

describe('classifyIceHockeyMarket', () => {
  it('groups a mixed-suffix period (CONFIRMED: FIRST_HALF/SECOND_HALF for periods 1-2, THIRD_PERIOD for period 3, all in the same real match) uniformly by ordinal, not by unit letter', () => {
    expect(classifyIceHockeyMarket('h2h')).toBe('Vencedor');
    expect(classifyIceHockeyMarket('h2h_1h')).toBe('1º Período');
    expect(classifyIceHockeyMarket('h2h_2h')).toBe('2º Período');
    // THIRD_PERIOD isn't in the confirmed single-event sample, but the real events-page sample
    // confirms PulseScore emits it for ice hockey — periodSuffix() (server side) turns it into a
    // "3p" suffix (ordinal "3" + unit "p" for PERIOD), which must bucket the same way as "3h" would.
    expect(classifyIceHockeyMarket('h2h_3p')).toBe('3º Período');
  });

  it('routes ice-hockey-specific market bases to their own buckets', () => {
    expect(classifyIceHockeyMarket('dc')).toBe('Dupla Chance');
    expect(classifyIceHockeyMarket('dnb')).toBe('Empate Anula Aposta');
    expect(classifyIceHockeyMarket('ou_7.5')).toBe('Totais');
    expect(classifyIceHockeyMarket('hcp_-1')).toBe('Handicap');
    expect(classifyIceHockeyMarket('btts')).toBe('Ambas Marcam');
    expect(classifyIceHockeyMarket('correct_score')).toBe('Placar Exato');
    expect(classifyIceHockeyMarket('first_to_score')).toBe('Primeiro a Marcar');
  });

  it('a full realistic ice-hockey market key list (real single-event shape: FULL_TIME + FIRST_HALF + SECOND_HALF) is fully covered end to end', () => {
    const keys = [
      'h2h', 'dc', 'ou_7.5', 'hcp_-1', 'dnb', 'correct_score', 'odd_even', 'first_to_score', 'to_win_by_1',
      'h2h_1h', 'dc_1h', 'btts_1h', 'ou_1.5_1h', 'hcp_1_1h', 'dnb_1h', 'correct_score_1h', 'to_win_by_1_1h',
      'h2h_2h', 'dc_2h', 'btts_2h', 'ou_1.5_2h', 'hcp_1_2h', 'dnb_2h', 'correct_score_2h', 'to_win_by_1_2h',
    ];
    const tabs = buildDynamicMarketTabs(keys, classifyIceHockeyMarket, ICE_HOCKEY_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys.length).toBe(keys.length);
    expect(tabs.some((t) => t.title === '1º Período')).toBe(true);
    expect(tabs.some((t) => t.title === '2º Período')).toBe(true);
    expect(tabs.some((t) => t.title === 'Especiais')).toBe(true);
  });
});

describe('classifyHandballMarket', () => {
  it('splits FIRST_HALF/SECOND_HALF markets into 1º/2º Tempo, buckets EUROPEAN_HANDICAP with ASIAN_HANDICAP under Handicap', () => {
    // EUROPEAN_HANDICAP (slugs to "ehcp" via MARKET_KEY_SLUGS in server/services/pulsescore.ts,
    // confirmed in a real handball sample) is functionally the same "handicap" question as the
    // regular ASIAN_HANDICAP ("hcp") market — bettors expect them together, not split across tabs.
    expect(classifyHandballMarket('h2h')).toBe('Vencedor');
    expect(classifyHandballMarket('dc')).toBe('Dupla Chance');
    expect(classifyHandballMarket('dnb')).toBe('Empate Anula Aposta');
    expect(classifyHandballMarket('ou_55.5')).toBe('Totais');
    expect(classifyHandballMarket('hcp_-5.5')).toBe('Handicap');
    expect(classifyHandballMarket('ehcp_-4')).toBe('Handicap');
    expect(classifyHandballMarket('h2h_1h')).toBe('1º Tempo');
    expect(classifyHandballMarket('ou_25.5_2h')).toBe('2º Tempo');
  });

  it('a full realistic handball market key list (real single-event shape: FULL_TIME only, plus several rawName-derived OTHER-bucket markets) is fully covered end to end', () => {
    const keys = [
      'h2h', 'dc', 'ou_58.5', 'hcp_-8.5', 'ehcp_-4', 'odd_even',
      'super_total_64.065', 'super_handicap_-4.003', '3way_total_63', 'individual_3way_total_1_32', 'individual_3way_total_2_29',
    ];
    const tabs = buildDynamicMarketTabs(keys, classifyHandballMarket, HANDBALL_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys.length).toBe(keys.length);
    expect(tabs.find((t) => t.title === 'Handicap')?.keys.sort()).toEqual(['ehcp_-4', 'hcp_-8.5']);
    expect(tabs.some((t) => t.title === 'Especiais')).toBe(true);
  });
});

describe('classifyBasketballMarket', () => {
  it('keeps half-based and quarter-based markets in DIFFERENT buckets (CONFIRMED: a real basketball event carries BOTH FIRST_HALF and FIRST_QUARTER markets concurrently, unlike ice hockey which only alternates naming style across non-overlapping periods)', () => {
    expect(classifyBasketballMarket('h2h')).toBe('Vencedor');
    expect(classifyBasketballMarket('h2h_1h')).toBe('1º Tempo');
    expect(classifyBasketballMarket('h2h_1q')).toBe('1º Quarto');
    expect(classifyBasketballMarket('h2h_2h')).not.toBe(classifyBasketballMarket('h2h_1q'));
    expect(classifyBasketballMarket('dnb_1q')).toBe('1º Quarto');
  });

  it('routes basketball-specific market bases to their own buckets', () => {
    expect(classifyBasketballMarket('dc')).toBe('Dupla Chance');
    // "Regular Time Double Chance" is an OTHER-bucket market that slugs via its rawName fallback
    // (server/services/pulsescore.ts) rather than the DOUBLE_CHANCE canonicalMarket's "dc" slug —
    // confirmed in a real basketball single-event sample alongside the regular "dc" market.
    expect(classifyBasketballMarket('regular_time_double_chance')).toBe('Dupla Chance');
    expect(classifyBasketballMarket('ou_150.5')).toBe('Totais');
    expect(classifyBasketballMarket('hcp_-3.5')).toBe('Handicap');
    expect(classifyBasketballMarket('ehcp_-4')).toBe('Handicap');
    expect(classifyBasketballMarket('race_to_points_1q')).toBe('1º Quarto');
    expect(classifyBasketballMarket('odd_even')).toBe('Par/Ímpar');
  });

  it('a full realistic basketball market key list (real single-event shape: FULL_TIME + FIRST_HALF + FIRST_QUARTER markets all present together) is fully covered end to end', () => {
    const keys = [
      'h2h', '1x2_in_regular_time', 'regular_time_double_chance', 'ou_150.5', 'hcp_-3.5', 'ou_home_74.5', 'ou_away_77.5', 'odd_even', 'individual_total_1_even',
      'h2h_1h', 'dc_1h', 'ou_79.5_1h', 'hcp_-1_1h', 'ou_home_40_1h', 'odd_even_1h', '1_half_individual_total_1_even_1h',
      'h2h_1q', 'dc_1q', 'ou_39.5_1q', 'dnb_1q', 'ou_home_20_1q', 'odd_even_1q', '1st_quarter_individual_total_1_even_1q',
    ];
    const tabs = buildDynamicMarketTabs(keys, classifyBasketballMarket, BASKETBALL_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys.length).toBe(keys.length);
    expect(tabs.some((t) => t.title === '1º Tempo')).toBe(true);
    expect(tabs.some((t) => t.title === '1º Quarto')).toBe(true);
    const halfBucket = tabs.find((t) => t.title === '1º Tempo')?.keys || [];
    const quarterBucket = tabs.find((t) => t.title === '1º Quarto')?.keys || [];
    expect(halfBucket.some((k) => quarterBucket.includes(k))).toBe(false);
    expect(tabs.some((t) => t.title === 'Especiais')).toBe(true);
  });
});

describe('classifyBaseballMarket', () => {
  it('buckets innings-suffixed keys (CONFIRMED: FIRST_INNING/SECOND_INNING/.../NINTH_INNING and the baseball-only FIRST_FIVE_INNINGS shape) by their own ordinal, including the distinct "first 5 innings" bucket', () => {
    expect(classifyBaseballMarket('h2h')).toBe('Vencedor');
    expect(classifyBaseballMarket('h2h_1i')).toBe('1º Inning');
    expect(classifyBaseballMarket('h2h_2i')).toBe('2º Inning');
    expect(classifyBaseballMarket('dnb_9i')).toBe('9º Inning');
    expect(classifyBaseballMarket('h2h_f5i')).toBe('Primeiras 5 Innings');
    expect(classifyBaseballMarket('h2h_1i')).not.toBe(classifyBaseballMarket('h2h_f5i'));
  });

  it('routes baseball-specific market bases to their own buckets, grouping all player-prop OTHER markets under one tab', () => {
    expect(classifyBaseballMarket('dc')).toBe('Dupla Chance');
    expect(classifyBaseballMarket('dnb')).toBe('Empate Anula Aposta');
    expect(classifyBaseballMarket('ou_9.5')).toBe('Totais');
    expect(classifyBaseballMarket('hcp_-1.5')).toBe('Handicap');
    expect(classifyBaseballMarket('odd_even')).toBe('Par/Ímpar');
    // "Players' stats Pitchers."/"Players' stats Batters." markets (CONFIRMED in a real
    // single-event sample: 66 such markets on one event) all slug via the OTHER-bucket rawName
    // fallback in server/services/pulsescore.ts to keys starting with "players_stats" — grouped
    // together rather than scattered across "Especiais" alongside genuinely miscellaneous markets.
    expect(classifyBaseballMarket('players_stats_pitchers_total_strikeouts_4.5')).toBe('Estatísticas de Jogadores');
    expect(classifyBaseballMarket('players_stats_batters_total_hits_0.5')).toBe('Estatísticas de Jogadores');
    // Miscellaneous OTHER markets with no recognizable base key fall to Especiais.
    expect(classifyBaseballMarket('first_home_run')).toBe('Especiais');
    expect(classifyBaseballMarket('highest_scoring_inning')).toBe('Especiais');
  });

  it('a realistic baseball market key list (real single-event shape: FULL_TIME + 1st/2nd/9th inning + first-5-innings + a large player-stats block) is fully covered end to end', () => {
    const keys = [
      'h2h', 'ou_9.5', 'hcp_-1.5', 'ou_home_4.5', 'ou_away_4.5', 'odd_even', 'first_home_run', 'total_hits_10.5', 'highest_scoring_inning',
      'h2h_1i', 'dnb_1i', 'ou_0.5_1i', '1st_inning_total_hits_0.5_1i',
      'h2h_2i', 'dnb_2i', 'ou_0.5_2i',
      'h2h_f5i', 'dnb_f5i', 'ou_4.5_f5i',
      '9th_inning_will_home_team_bat_at_bottom_of_9th_9i',
      'players_stats_pitchers_total_strikeouts_4.5', 'players_stats_batters_total_hits_0.5',
    ];
    const tabs = buildDynamicMarketTabs(keys, classifyBaseballMarket, BASEBALL_BUCKET_ORDER, (k) => k);
    expect(tabs[0].keys.length).toBe(keys.length);
    expect(tabs.some((t) => t.title === '1º Inning')).toBe(true);
    expect(tabs.some((t) => t.title === '2º Inning')).toBe(true);
    expect(tabs.some((t) => t.title === '9º Inning')).toBe(true);
    expect(tabs.some((t) => t.title === 'Primeiras 5 Innings')).toBe(true);
    expect(tabs.find((t) => t.title === 'Estatísticas de Jogadores')?.keys.sort()).toEqual(
      ['players_stats_batters_total_hits_0.5', 'players_stats_pitchers_total_strikeouts_4.5'].sort(),
    );
    expect(tabs.some((t) => t.title === 'Especiais')).toBe(true);
  });
});
