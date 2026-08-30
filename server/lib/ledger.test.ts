import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ensureSchema } from './db';
import { randomId } from './crypto';
import {
  walletService,
  withTransaction,
  opReserveForBet,
  opSettleBetWon,
  opSettleBetLost,
  opVoidBet,
  WalletError,
} from './ledger';

const DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/bet62_test';

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function createUser(): Promise<string> {
  const id = randomId(12);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, password_salt) VALUES ($1, $2, 'x', 'y')`,
    [id, `${id}@test.local`],
  );
  await pool.query(`INSERT INTO profiles (id, user_id, email, balance) VALUES ($1, $2, $3, 0)`, [
    randomId(12),
    id,
    `${id}@test.local`,
  ]);
  return id;
}

async function ledgerEntriesFor(userId: string) {
  const r = await pool.query(
    `SELECT account, direction, amount::float8 AS amount FROM ledger_entries WHERE user_id = $1 ORDER BY id`,
    [userId],
  );
  return r.rows;
}

beforeAll(async () => {
  await ensureSchema(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('Wallet + Ledger engine', () => {
  it('deposits credit available balance and post a balanced double-entry', async () => {
    const userId = await createUser();
    const result = await walletService.deposit(pool, { userId, amount: 100, idempotencyKey: `dep:${userId}:1` });
    expect(result.wallet.available).toBe(100);

    const entries = await ledgerEntriesFor(userId);
    expect(entries).toEqual([{ account: 'PLAYER_AVAILABLE', direction: 'credit', amount: 100 }]);
  });

  it('never double-credits a deposit when the same idempotency key is replayed (spec §9, §65)', async () => {
    const userId = await createUser();
    const key = `dep:${userId}:webhook`;

    const r1 = await walletService.deposit(pool, { userId, amount: 50, idempotencyKey: key });
    const r2 = await walletService.deposit(pool, { userId, amount: 50, idempotencyKey: key });
    const r3 = await walletService.deposit(pool, { userId, amount: 50, idempotencyKey: key });

    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(r3.replayed).toBe(true);

    const wallet = await walletService.getWallet(pool, userId);
    expect(wallet.available).toBe(50); // NOT 150

    const entries = await ledgerEntriesFor(userId);
    expect(entries).toHaveLength(1);
  });

  it('rejects a bet reservation larger than the available balance instead of going negative', async () => {
    const userId = await createUser();
    await walletService.deposit(pool, { userId, amount: 20, idempotencyKey: `dep:${userId}` });

    await expect(
      walletService.reserveForBet(pool, { userId, amount: 20.01, idempotencyKey: `bet:${userId}`, betId: 'b1' }),
    ).rejects.toBeInstanceOf(WalletError);

    const wallet = await walletService.getWallet(pool, userId);
    expect(wallet.available).toBe(20);
    expect(wallet.reserved).toBe(0);
  });

  it('never drives the balance negative under concurrent bet reservations for the same user (spec §47, §63)', async () => {
    const userId = await createUser();
    await walletService.deposit(pool, { userId, amount: 100, idempotencyKey: `dep:${userId}` });

    // Ten concurrent €20 reservations against a €100 balance: exactly 5 must succeed.
    const attempts = Array.from({ length: 10 }, (_, i) =>
      walletService.reserveForBet(pool, { userId, amount: 20, idempotencyKey: `bet:${userId}:${i}`, betId: `bet-${i}` }).then(
        () => 'ok' as const,
        () => 'rejected' as const,
      ),
    );
    const outcomes = await Promise.all(attempts);

    const ok = outcomes.filter((o) => o === 'ok').length;
    const rejected = outcomes.filter((o) => o === 'rejected').length;
    expect(ok).toBe(5);
    expect(rejected).toBe(5);

    const wallet = await walletService.getWallet(pool, userId);
    expect(wallet.available).toBe(0);
    expect(wallet.reserved).toBe(100);
    expect(wallet.available).toBeGreaterThanOrEqual(0); // never negative
  });

  it('settling the same bet twice never pays out twice (spec §64)', async () => {
    const userId = await createUser();
    await walletService.deposit(pool, { userId, amount: 100, idempotencyKey: `dep:${userId}` });
    await withTransaction(pool, (client) => opReserveForBet(client, { userId, amount: 10, idempotencyKey: `res:${userId}`, betId: 'winbet' }));

    const key = `settle:winbet:won`;
    const first = await withTransaction(pool, (client) => opSettleBetWon(client, { userId, stake: 10, payout: 25, idempotencyKey: key, betId: 'winbet' }));
    const second = await withTransaction(pool, (client) => opSettleBetWon(client, { userId, stake: 10, payout: 25, idempotencyKey: key, betId: 'winbet' }));

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);

    const wallet = await walletService.getWallet(pool, userId);
    expect(wallet.available).toBe(90 + 25); // 100 - 10 reserved + 25 payout, not 100-10+25+25
    expect(wallet.reserved).toBe(0);
  });

  it('a lost bet moves the stake to house revenue and never touches available balance again', async () => {
    const userId = await createUser();
    await walletService.deposit(pool, { userId, amount: 100, idempotencyKey: `dep:${userId}` });
    await withTransaction(pool, (client) => opReserveForBet(client, { userId, amount: 10, idempotencyKey: `res:${userId}`, betId: 'lossbet' }));

    await withTransaction(pool, (client) => opSettleBetLost(client, { userId, stake: 10, idempotencyKey: `settle:lossbet`, betId: 'lossbet' }));

    const wallet = await walletService.getWallet(pool, userId);
    expect(wallet.available).toBe(90);
    expect(wallet.reserved).toBe(0);
  });

  it('void returns the exact stake to available exactly once even if called twice', async () => {
    const userId = await createUser();
    await walletService.deposit(pool, { userId, amount: 100, idempotencyKey: `dep:${userId}` });
    await withTransaction(pool, (client) => opReserveForBet(client, { userId, amount: 10, idempotencyKey: `res:${userId}`, betId: 'voidbet' }));

    const key = `settle:voidbet:void`;
    await withTransaction(pool, (client) => opVoidBet(client, { userId, stake: 10, idempotencyKey: key, betId: 'voidbet' }));
    await withTransaction(pool, (client) => opVoidBet(client, { userId, stake: 10, idempotencyKey: key, betId: 'voidbet' }));

    const wallet = await walletService.getWallet(pool, userId);
    expect(wallet.available).toBe(100); // stake returned once, not twice
    expect(wallet.reserved).toBe(0);
  });

  it('every posted ledger transaction is internally balanced (sum(debit) === sum(credit))', async () => {
    const userId = await createUser();
    await walletService.deposit(pool, { userId, amount: 100, idempotencyKey: `dep:${userId}` });
    await withTransaction(pool, (client) => opReserveForBet(client, { userId, amount: 40, idempotencyKey: `res:${userId}`, betId: 'balcheck' }));
    await withTransaction(pool, (client) => opSettleBetWon(client, { userId, stake: 40, payout: 90, idempotencyKey: `settle:balcheck`, betId: 'balcheck' }));

    const r = await pool.query(
      `SELECT transaction_id,
              SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END)::float8 AS debit,
              SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END)::float8 AS credit
       FROM ledger_entries
       WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id = $1)
       GROUP BY transaction_id`,
      [userId],
    );
    for (const row of r.rows) {
      expect(row.debit).toBe(row.credit);
    }
  });
});
