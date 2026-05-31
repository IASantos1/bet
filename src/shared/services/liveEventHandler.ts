import { freezeMarkets } from './marketFreezeEngine';
import type { Game } from '@/shared/types';

export function onGoal(game: Game) {
  if (!game.markets) return game;
  
  game.markets = freezeMarkets(game.markets, 'GOAL');
  // game.updatedAt = new Date(); // If Game interface has updatedAt
  return game;
}

export function onVar(game: Game) {
  if (!game.markets) return game;
  
  game.markets = freezeMarkets(game.markets, 'VAR');
  return game;
}

export function onRedCard(game: Game) {
  if (!game.markets) return game;
  
  game.markets = freezeMarkets(game.markets, 'CARD');
  return game;
}

export function onOddsUpdate(game: Game) {
    if (!game.markets) return game;

    game.markets = freezeMarkets(game.markets, 'UPDATE');
    return game;
}
