// sportsbook-config.ts

export interface MarketConfig {
  marketType: string;
  displayName: string;
  priority: number;
  availablePreMatch: boolean;
  availableInPlay: boolean;
  minOdds: number;
  maxOdds: number;
  preMatchMargin: number;     // em %
  inPlayMargin: number;       // em %
  stakeMultiplierPre: number;
  stakeMultiplierInPlay: number;
  pauseTriggers: string[];
  reopenDelaySeconds: number;
}

export interface SportConfig {
  sportKey: string;
  displayName: string;
  enabled: boolean;
  liveEnabled: boolean;
  defaultMaxStake: number;
  liveMaxStakeMultiplier: number;
  updateInterval: {
    preMatch: number; // segundos
    inPlay: number;
  };
  pauseDuration: {
    [key: string]: number; // ex: goal, red_card, timeout, set_end...
    default: number;
  };
  markets: MarketConfig[];
  leagueOverrides?: Record<string, Partial<SportConfig & { markets?: never }>>;
}

export interface RiskLimits {
  maxExposureGlobal: number;
  maxExposurePerMatch: number;
  maxExposurePerMarket: number;
  maxExposurePerUser: number;
  minStake: number;
  maxStakePreMatch: number;
  maxStakeInPlay: number;
  maxStakePerBet: number;
  minOddsAccepted: number;
  maxOddsAccepted: number;
  maxOddsDeviation: number;
  maxBetsPerUserPerDay: number;
  maxActiveBetsPerUser: number;
  maxBetSlipSelections: number;
}

export interface LiveBettingRules {
  enabled: boolean;
  delaySeconds: {
    min: number;
    max: number;
    default: number;
    onSignificantChange: number;
  };
  softLiveMode: boolean;
  softLiveMultiplier: number;
  autoAcceptOddsChange: boolean;
  maxOddsChangeAccepted: number;
  requireConfirmation: boolean;
  pauseTriggers: string[];
  priorityMarkets: string[];
}

export const sportsbookConfig = {
  // ========================================
  // DESPORTOS SUPORTADOS
  // ========================================
  sports: {
    soccer: {
      sportKey: 'soccer',
      displayName: 'Futebol',
      enabled: true,
      liveEnabled: true,
      defaultMaxStake: 500,
      liveMaxStakeMultiplier: 0.5,
      updateInterval: {
        preMatch: 30,
        inPlay: 5,
      },
      pauseDuration: {
        goal: 10,
        red_card: 15,
        penalty: 20,
        var: 30,
        corner: 4,
        dangerous_attack: 5,
        default: 8,
      },
      markets: [
        {
          marketType: 'match_winner_3way',
          displayName: 'Vencedor do Jogo (1X2)',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.01,
          maxOdds: 50,
          preMatchMargin: 5.0,
          inPlayMargin: 7.0,
          stakeMultiplierPre: 1.0,
          stakeMultiplierInPlay: 0.6,
          pauseTriggers: ['goal', 'red_card', 'penalty', 'var'],
          reopenDelaySeconds: 10,
        },
        {
          marketType: 'over_under_2_5',
          displayName: 'Mais/Menos 2.5 Gols',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.10,
          maxOdds: 10,
          preMatchMargin: 5.5,
          inPlayMargin: 7.5,
          stakeMultiplierPre: 0.9,
          stakeMultiplierInPlay: 0.55,
          pauseTriggers: ['goal'],
          reopenDelaySeconds: 8,
        },
        {
          marketType: 'next_goal',
          displayName: 'Próximo Gol',
          priority: 1,
          availablePreMatch: false,
          availableInPlay: true,
          minOdds: 1.20,
          maxOdds: 15,
          preMatchMargin: 6.0,
          inPlayMargin: 8.0,
          stakeMultiplierPre: 0.0,
          stakeMultiplierInPlay: 0.5,
          pauseTriggers: ['goal'],
          reopenDelaySeconds: 5,
        },
        {
          marketType: 'both_teams_to_score',
          displayName: 'Ambas as Equipas Marcam',
          priority: 2,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.20,
          maxOdds: 8,
          preMatchMargin: 5.5,
          inPlayMargin: 7.5,
          stakeMultiplierPre: 0.8,
          stakeMultiplierInPlay: 0.5,
          pauseTriggers: ['goal'],
          reopenDelaySeconds: 10,
        },
        {
          marketType: 'asian_handicap',
          displayName: 'Handicap Asiático',
          priority: 2,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.50,
          maxOdds: 5,
          preMatchMargin: 4.5,
          inPlayMargin: 6.5,
          stakeMultiplierPre: 0.9,
          stakeMultiplierInPlay: 0.55,
          pauseTriggers: ['goal', 'red_card'],
          reopenDelaySeconds: 12,
        },
        {
          marketType: 'correct_score',
          displayName: 'Resultado Exato',
          priority: 4,
          availablePreMatch: true,
          availableInPlay: false,
          minOdds: 3.0,
          maxOdds: 100,
          preMatchMargin: 12.0,
          inPlayMargin: 18.0,
          stakeMultiplierPre: 0.4,
          stakeMultiplierInPlay: 0.0,
          pauseTriggers: ['goal'],
          reopenDelaySeconds: 20,
        },
      ],
    } as SportConfig,

    basketball: {
      sportKey: 'basketball',
      displayName: 'Basquetebol',
      enabled: true,
      liveEnabled: true,
      defaultMaxStake: 300,
      liveMaxStakeMultiplier: 0.6,
      updateInterval: {
        preMatch: 30,
        inPlay: 8,
      },
      pauseDuration: {
        timeout: 5,
        quarter_end: 10,
        foul: 3,
        default: 5,
      },
      markets: [
        {
          marketType: 'match_winner',
          displayName: 'Vencedor do Jogo',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.10,
          maxOdds: 20,
          preMatchMargin: 5.0,
          inPlayMargin: 7.0,
          stakeMultiplierPre: 1.0,
          stakeMultiplierInPlay: 0.65,
          pauseTriggers: ['timeout', 'quarter_end'],
          reopenDelaySeconds: 5,
        },
        {
          marketType: 'total_points',
          displayName: 'Total de Pontos',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.50,
          maxOdds: 5,
          preMatchMargin: 5.5,
          inPlayMargin: 7.5,
          stakeMultiplierPre: 0.9,
          stakeMultiplierInPlay: 0.6,
          pauseTriggers: ['quarter_end'],
          reopenDelaySeconds: 6,
        },
        {
          marketType: 'point_spread',
          displayName: 'Handicap de Pontos',
          priority: 2,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.50,
          maxOdds: 5,
          preMatchMargin: 5.0,
          inPlayMargin: 7.0,
          stakeMultiplierPre: 0.85,
          stakeMultiplierInPlay: 0.55,
          pauseTriggers: ['timeout'],
          reopenDelaySeconds: 5,
        },
      ],
    } as SportConfig,

    ice_hockey: {
      sportKey: 'ice-hockey',
      displayName: 'Hóquei no Gelo',
      enabled: true,
      liveEnabled: true,
      defaultMaxStake: 280,
      liveMaxStakeMultiplier: 0.6,
      updateInterval: {
        preMatch: 35,
        inPlay: 8,
      },
      pauseDuration: {
        goal: 8,
        penalty: 6,
        period_end: 10,
        default: 6,
      },
      markets: [
        {
          marketType: 'match_winner_3way',
          displayName: 'Vencedor do Jogo (incl. prolongamento)',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.10,
          maxOdds: 25,
          preMatchMargin: 5.5,
          inPlayMargin: 7.5,
          stakeMultiplierPre: 1.0,
          stakeMultiplierInPlay: 0.6,
          pauseTriggers: ['goal'],
          reopenDelaySeconds: 8,
        },
        {
          marketType: 'total_goals',
          displayName: 'Total de Gols',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.40,
          maxOdds: 8,
          preMatchMargin: 6.0,
          inPlayMargin: 8.0,
          stakeMultiplierPre: 0.85,
          stakeMultiplierInPlay: 0.55,
          pauseTriggers: ['goal'],
          reopenDelaySeconds: 7,
        },
      ],
    } as SportConfig,

    baseball: {
      sportKey: 'baseball',
      displayName: 'Basebol',
      enabled: true,
      liveEnabled: true,
      defaultMaxStake: 300,
      liveMaxStakeMultiplier: 0.6,
      updateInterval: {
        preMatch: 40,
        inPlay: 12,
      },
      pauseDuration: {
        inning_end: 8,
        home_run: 6,
        default: 6,
      },
      markets: [
        {
          marketType: 'match_winner',
          displayName: 'Vencedor do Jogo',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.15,
          maxOdds: 20,
          preMatchMargin: 5.0,
          inPlayMargin: 7.0,
          stakeMultiplierPre: 1.0,
          stakeMultiplierInPlay: 0.6,
          pauseTriggers: ['inning_end'],
          reopenDelaySeconds: 8,
        },
        {
          marketType: 'total_runs',
          displayName: 'Total de Corridas',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.50,
          maxOdds: 6,
          preMatchMargin: 5.5,
          inPlayMargin: 7.5,
          stakeMultiplierPre: 0.9,
          stakeMultiplierInPlay: 0.55,
          pauseTriggers: [],
          reopenDelaySeconds: 6,
        },
      ],
    } as SportConfig,

    mma: {
      sportKey: 'mma',
      displayName: 'MMA / UFC',
      enabled: true,
      liveEnabled: true,
      defaultMaxStake: 350,
      liveMaxStakeMultiplier: 0.5,
      updateInterval: {
        preMatch: 60,
        inPlay: 12,
      },
      pauseDuration: {
        round_end: 10,
        knockout: 25,
        submission: 25,
        default: 10,
      },
      markets: [
        {
          marketType: 'fight_winner',
          displayName: 'Vencedor da Luta',
          priority: 1,
          availablePreMatch: true,
          availableInPlay: true,
          minOdds: 1.10,
          maxOdds: 25,
          preMatchMargin: 6.0,
          inPlayMargin: 8.0,
          stakeMultiplierPre: 1.0,
          stakeMultiplierInPlay: 0.5,
          pauseTriggers: ['round_end'],
          reopenDelaySeconds: 10,
        },
        {
          marketType: 'method_of_victory',
          displayName: 'Método de Vitória',
          priority: 2,
          availablePreMatch: true,
          availableInPlay: false,
          minOdds: 2.0,
          maxOdds: 30,
          preMatchMargin: 9.0,
          inPlayMargin: 12.0,
          stakeMultiplierPre: 0.5,
          stakeMultiplierInPlay: 0.0,
          pauseTriggers: [],
          reopenDelaySeconds: 15,
        },
      ],
    } as SportConfig,
  },

  // ========================================
  // LIMITES DE RISCO GLOBAIS
  // ========================================
  riskLimits: {
    maxExposureGlobal: 120000,
    maxExposurePerMatch: 25000,
    maxExposurePerMarket: 8000,
    maxExposurePerUser: 5000,
    minStake: 1,
    maxStakePreMatch: 500,
    maxStakeInPlay: 300,
    maxStakePerBet: 1500,
    minOddsAccepted: 1.01,
    maxOddsAccepted: 100,
    maxOddsDeviation: 12,
    maxBetsPerUserPerDay: 120,
    maxActiveBetsPerUser: 25,
    maxBetSlipSelections: 15,
  } as RiskLimits,

  // ========================================
  // REGRAS DE APOSTAS AO VIVO
  // ========================================
  liveBetting: {
    enabled: true,
    delaySeconds: {
      min: 3,
      max: 6,
      default: 3,
      onSignificantChange: 6,
    },
    softLiveMode: true,
    softLiveMultiplier: 0.55,
    autoAcceptOddsChange: false,
    maxOddsChangeAccepted: 6,
    requireConfirmation: true,
    pauseTriggers: [
      'goal', 'red_card', 'penalty', 'var', 'timeout',
      'quarter_end', 'set_end', 'inning_end', 'round_end',
    ],
    priorityMarkets: [
      'match_winner',
      'over_under',
      'next_goal',
      'total_points',
      'point_spread',
      'asian_handicap',
    ],
  } as LiveBettingRules,

  // ... (podes manter as outras secções: oddsCalculation, cache, alerts, features, etc.)
};

export default sportsbookConfig;
