import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type http from 'http';
import pg from 'pg';
import { ensureSchema } from '../lib/db';
import { randomId } from '../lib/crypto';
import { walletService } from '../lib/ledger';
import { handleCasinoCallback } from './casinoCallback';

const DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/bet62_test';
const TOKEN = 'test-callback-token';

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function createUser(startingBalance = 100): Promise<string> {
  const id = randomId(12);
  await pool.query(`INSERT INTO users (id, email, password_hash, password_salt) VALUES ($1, $2, 'x', 'y')`, [id, `${id}@test.local`]);
  await pool.query(`INSERT INTO profiles (id, user_id, email, balance) VALUES ($1, $2, $3, 0)`, [randomId(12), id, `${id}@test.local`]);
  await pool.query(`INSERT INTO casino_users (user_id, user_code) VALUES ($1, $2)`, [id, Math.floor(Math.random() * 1_000_000)]);
  if (startingBalance > 0) {
    await walletService.deposit(pool, { userId: id, amount: startingBalance, idempotencyKey: `dep:${id}` });
  }
  return id;
}

function account(userId: string): string {
  return `bet62_${userId}`;
}

function makeReq(body: any, token: string = TOKEN): http.IncomingMessage {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))]) as any;
  stream.headers = { 'callback-token': token };
  stream.method = 'POST';
  return stream as http.IncomingMessage;
}

function makeRes() {
  let statusCode = 200;
  let ended = '';
  const res: any = {
    setHeader: () => void 0,
    end: (chunk?: any) => {
      if (chunk) ended = chunk.toString();
    },
  };
  Object.defineProperty(res, 'statusCode', {
    get: () => statusCode,
    set: (v: number) => {
      statusCode = v;
    },
  });
  return { res: res as http.ServerResponse, body: () => JSON.parse(ended || '{}') };
}

async function call(body: any, token: string = TOKEN) {
  const { res, body: getBody } = makeRes();
  const handled = await handleCasinoCallback(pool, makeReq(body, token), res, new URL('http://x/callback'));
  return { handled, body: getBody() };
}

async function currentBalance(userId: string): Promise<number> {
  const w = await walletService.getWallet(pool, userId);
  return w.available;
}

beforeAll(async () => {
  await ensureSchema(pool);
  process.env.CASINO_CALLBACK_TOKEN = TOKEN;
});

afterAll(async () => {
  await pool.end();
});

describe('Casino callback (GoldSlotPalace Seamless mode)', () => {
  it('rejects a request with the wrong Callback-Token before touching anything', async () => {
    const userId = await createUser();
    const { body } = await call({ command: 'balance', data: { account: account(userId) }, check: '21,22' }, 'wrong-token');
    expect(body.result).toBe(100);
    expect(body.status).toBe('ERROR');
  });

  it('authenticate resolves a real user and reports their balance', async () => {
    const userId = await createUser(50);
    const { body } = await call({ command: 'authenticate', data: { account: account(userId) }, check: '21' });
    expect(body.result).toBe(0);
    expect(body.data.balance).toBe(50);
  });

  it('authenticate on an unknown account fails with 21, not a crash', async () => {
    const { body } = await call({ command: 'authenticate', data: { account: 'bet62_ffffffffffffffffffffffffffffffff' }, check: '21' });
    expect(body.result).toBe(21);
  });

  it('bet debits the wallet by exactly the wagered amount', async () => {
    const userId = await createUser(100);
    const { body } = await call({
      command: 'bet',
      data: { account: account(userId), trans_guid: `t-${randomId(6)}`, amount: 9.5, round_id: 'r1', provider_id: 1, game_code: 'x' },
      check: '21,22,41,31',
    });
    expect(body.result).toBe(0);
    expect(body.data.balance).toBe(90.5);
    expect(await currentBalance(userId)).toBe(90.5);
  });

  it('bet is rejected with 31 when the wallet has insufficient funds, and nothing moves', async () => {
    const userId = await createUser(5);
    const { body } = await call({
      command: 'bet',
      data: { account: account(userId), trans_guid: `t-${randomId(6)}`, amount: 9.5 },
      check: '21,22,41,31',
    });
    expect(body.result).toBe(31);
    expect(body.data.balance).toBe(5);
    expect(await currentBalance(userId)).toBe(5); // untouched
  });

  it('a duplicate trans_guid on a second bet is rejected with 41, and the wallet is only debited once', async () => {
    const userId = await createUser(100);
    const transGuid = `t-${randomId(6)}`;
    const first = await call({ command: 'bet', data: { account: account(userId), trans_guid: transGuid, amount: 10 }, check: '21,22,41,31' });
    expect(first.body.result).toBe(0);
    const second = await call({ command: 'bet', data: { account: account(userId), trans_guid: transGuid, amount: 10 }, check: '21,22,41,31' });
    expect(second.body.result).toBe(41);
    expect(await currentBalance(userId)).toBe(90); // debited exactly once, not twice
  });

  it('win credits the wallet by exactly the won amount', async () => {
    const userId = await createUser(100);
    const { body } = await call({
      command: 'win',
      data: { account: account(userId), trans_guid: `t-${randomId(6)}`, amount: 25 },
      check: '21,22,41',
    });
    expect(body.result).toBe(0);
    expect(body.data.balance).toBe(125);
    expect(await currentBalance(userId)).toBe(125);
  });

  it('status reports OK for a live transaction and CANCELED after it is reversed', async () => {
    const userId = await createUser(100);
    const betGuid = `t-${randomId(6)}`;
    await call({ command: 'bet', data: { account: account(userId), trans_guid: betGuid, amount: 20 }, check: '21,22,41,31' });

    const before = await call({ command: 'status', data: { account: account(userId), trans_guid: betGuid }, check: '21,42' });
    expect(before.body.result).toBe(0);
    expect(before.body.data.trans_status).toBe('OK');

    await call(
      { command: 'cancel', data: { account: account(userId), trans_guid: `c-${randomId(6)}`, cancel_trans_guid: betGuid, amount: 20 }, check: '21,22,41,43' },
    );

    const after = await call({ command: 'status', data: { account: account(userId), trans_guid: betGuid }, check: '21,42' });
    expect(after.body.result).toBe(0);
    expect(after.body.data.trans_status).toBe('CANCELED');
  });

  it('status on an unknown trans_guid fails with 42', async () => {
    const userId = await createUser();
    const { body } = await call({ command: 'status', data: { account: account(userId), trans_guid: 'never-happened' }, check: '21,42' });
    expect(body.result).toBe(42);
  });

  it('cancelling a BET refunds exactly what was wagered', async () => {
    const userId = await createUser(100);
    const betGuid = `t-${randomId(6)}`;
    await call({ command: 'bet', data: { account: account(userId), trans_guid: betGuid, amount: 30 }, check: '21,22,41,31' });
    expect(await currentBalance(userId)).toBe(70);

    const { body } = await call({
      command: 'cancel',
      data: { account: account(userId), trans_guid: `c-${randomId(6)}`, cancel_trans_guid: betGuid, amount: 30 },
      check: '21,22,41,43',
    });
    expect(body.result).toBe(0);
    expect(body.data.balance).toBe(100);
    expect(await currentBalance(userId)).toBe(100);
  });

  it('cancelling a WIN claws back exactly what was credited', async () => {
    const userId = await createUser(100);
    const winGuid = `t-${randomId(6)}`;
    await call({ command: 'win', data: { account: account(userId), trans_guid: winGuid, amount: 40 }, check: '21,22,41' });
    expect(await currentBalance(userId)).toBe(140);

    const { body } = await call({
      command: 'cancel',
      data: { account: account(userId), trans_guid: `c-${randomId(6)}`, cancel_trans_guid: winGuid, amount: 40 },
      check: '21,22,41,43',
    });
    expect(body.result).toBe(0);
    expect(body.data.balance).toBe(100);
    expect(await currentBalance(userId)).toBe(100);
  });

  it('cancelling an unknown cancel_trans_guid fails with 43, and nothing moves', async () => {
    const userId = await createUser(100);
    const { body } = await call({
      command: 'cancel',
      data: { account: account(userId), trans_guid: `c-${randomId(6)}`, cancel_trans_guid: 'never-happened', amount: 5 },
      check: '21,22,41,43',
    });
    expect(body.result).toBe(43);
    expect(await currentBalance(userId)).toBe(100);
  });

  it('cancelling an already-cancelled transaction a second time is a harmless no-op, not a double refund', async () => {
    const userId = await createUser(100);
    const betGuid = `t-${randomId(6)}`;
    await call({ command: 'bet', data: { account: account(userId), trans_guid: betGuid, amount: 15 }, check: '21,22,41,31' });
    await call({ command: 'cancel', data: { account: account(userId), trans_guid: `c1-${randomId(6)}`, cancel_trans_guid: betGuid, amount: 15 }, check: '21,22,41,43' });
    expect(await currentBalance(userId)).toBe(100);

    // A second, distinct cancel event referencing the SAME original bet must not refund again.
    const { body } = await call({
      command: 'cancel',
      data: { account: account(userId), trans_guid: `c2-${randomId(6)}`, cancel_trans_guid: betGuid, amount: 15 },
      check: '21,22,41,43',
    });
    expect(body.result).toBe(0);
    expect(body.data.balance).toBe(100);
    expect(await currentBalance(userId)).toBe(100); // still 100, not 115
  });

  it('cancelling a WIN that has since been spent fails with 99 instead of driving the wallet negative', async () => {
    const userId = await createUser(0);
    const winGuid = `t-${randomId(6)}`;
    await call({ command: 'win', data: { account: account(userId), trans_guid: winGuid, amount: 50 }, check: '21,22,41' });
    // Spend it all on an unrelated bet, same as a player would by playing more.
    await call({ command: 'bet', data: { account: account(userId), trans_guid: `t-${randomId(6)}`, amount: 50 }, check: '21,22,41,31' });
    expect(await currentBalance(userId)).toBe(0);

    const { body } = await call({
      command: 'cancel',
      data: { account: account(userId), trans_guid: `c-${randomId(6)}`, cancel_trans_guid: winGuid, amount: 50 },
      check: '21,22,41,43',
    });
    expect(body.result).toBe(99);
    expect(await currentBalance(userId)).toBe(0); // never went negative
  });

  it('a suspended account is rejected with 22 and no money moves', async () => {
    const userId = await createUser(100);
    await pool.query(`UPDATE profiles SET account_status = 'SUSPENDED' WHERE user_id = $1`, [userId]);
    const { body } = await call({ command: 'bet', data: { account: account(userId), trans_guid: `t-${randomId(6)}`, amount: 10 }, check: '21,22,41,31' });
    expect(body.result).toBe(22);
    expect(await currentBalance(userId)).toBe(100);
  });
});
