import { SUPPORTED_COUNTRIES } from './countries';

export const COUNTRIES = SUPPORTED_COUNTRIES;

export const DEFAULT_IBAN_PLACEHOLDER = 'PT50...';

export const CURRENCIES = {
  EUR: 'EUR',
  USD: 'USD',
  GBP: 'GBP',
  BRL: 'BRL',
};

export const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
};

export const BET_STATUS = {
  PENDING: 'pending',
  WON: 'won',
  LOST: 'lost',
  VOID: 'void',
  CASHOUT: 'cashed_out',
  CANCELED: 'canceled',
};

export const ODDS_FORMAT = {
  DECIMAL: 'decimal',
  FRACTIONAL: 'fractional',
  AMERICAN: 'american',
};
