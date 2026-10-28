// Sanctions screening: the public lists (EU CSV, UN XML, UK CSV) read, players compared, matches decided.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { parseEuCsv, parseUnXml, parseUkCsv, matchStrength, createSanctions, screen, decideHit, sanctionsView } from '../server/sanctions.js';
import { withdrawEligibility } from '../server/withdrawrules.js';
import { riskAlerts } from '../server/risk.js';

const EU = [
  'Entity_LogicalId;Entity_SubjectType;NameAlias_WholeName;BirthDate_BirthDate',
  '13;person;Viktor Ivanovich PETROV;1970-05-02',
  '13;person;Viktor Petrov;',
  '14;enterprise;Petrov Trading LLC;',
  '15;person;"Ana ""La Jefa"" Gomez";1980-01-01',
].join('\n');
const UN = `<CONSOLIDATED_LIST><INDIVIDUALS>
  <INDIVIDUAL><DATAID>1</DATAID><REFERENCE_NUMBER>QDi.001</REFERENCE_NUMBER><FIRST_NAME>Abdul</FIRST_NAME><SECOND_NAME>Rahman</SECOND_NAME><THIRD_NAME>Yasin</THIRD_NAME>
    <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Abdul Rahman Said Yasin</ALIAS_NAME></INDIVIDUAL_ALIAS>
    <INDIVIDUAL_DATE_OF_BIRTH><TYPE_OF_DATE>EXACT</TYPE_OF_DATE><YEAR>1960</YEAR></INDIVIDUAL_DATE_OF_BIRTH></INDIVIDUAL>
</INDIVIDUALS></CONSOLIDATED_LIST>`;
const UK = ['Last Updated,01/10/2026', 'Name 6,Name 1,Name 2,Name 3,Name 4,Name 5,Title,DOB,Group Type,Group ID',
  'SMITH,John,,,,,Mr,15/03/1975,Individual,9001', 'ACME,,,,,,,,Entity,9002'].join('\n');

test('the three lists are read: people only, every name, dates of birth', () => {
  const eu = parseEuCsv(EU);
  assert.deepEqual(eu.map((p) => [p.ref, [...p.names], [...p.births]]), [
    ['EU-13', ['Viktor Ivanovich PETROV', 'Viktor Petrov'], ['1970-05-02']], ['EU-15', ['Ana "La Jefa" Gomez'], ['1980-01-01']]]);
  const [un] = parseUnXml(UN);
  assert.deepEqual([un.ref, [...un.names], [...un.births]], ['UN-QDi.001', ['Abdul Rahman Yasin', 'Abdul Rahman Said Yasin'], ['1960']]);
  assert.deepEqual(parseUkCsv(UK).map((p) => [p.ref, [...p.names], [...p.births]]), [['UK-9001', ['John SMITH'], ['1975-03-15']]]);
});

test('a name matches when all of one is in the other; the date of birth confirms or rules it out', () => {
  assert.equal(matchStrength('Viktor Petrov', '1970-05-02', 'viktor petrov', '1970-05-02'), 'strong');
  assert.equal(matchStrength('Viktor Ivanovich Petrov', null, 'viktor petrov', '1970-05-02'), 'possible');
  assert.equal(matchStrength('Viktor Petrov', '1990-01-01', 'viktor petrov', '1970-05-02'), null);
  assert.equal(matchStrength('Abdul Yasin', '1960-07-01', 'abdul rahman yasin', '1960'), 'possible');
  assert.equal(matchStrength('Viktor Silva', '1970-05-02', 'viktor petrov', '1970-05-02'), null);
  assert.equal(matchStrength('Petrov', null, 'viktor petrov', null), null);
});

test('refresh, screen, decide: a match blocks withdrawals until cleared; a confirmed one blocks the account', async () => {
  const db = openDb(':memory:');
  const user = (name, birth) => Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, kyc_status, created_at) VALUES (?, ?, ?, 'x', 'approved', ?)")
    .run(`${name.replace(/\s/g, '')}@x`, name, birth, nowIso()).lastInsertRowid);
  const viktor = user('Viktor Petrov', '1970-05-02');
  const other = user('Maria Petrov', '1970-05-02');
  const bodies = { eu: EU, un: UN, uk: 'x' };
  const fetchImpl = async (url) => (url === 'bad' ? { ok: false, status: 500 } : { ok: true, text: async () => bodies[url] });
  const s = createSanctions(db, { urls: { eu: 'eu', un: 'un', uk: 'bad' } , fetchImpl });
  assert.equal(await s.refresh(), 1);
  const v = sanctionsView(db);
  assert.deepEqual(v.sources.map((x) => [x.id, x.people, !!x.error]), [['eu', 2, false], ['un', 1, false], ['uk', 0, true]]);
  assert.deepEqual(v.hits.map((h) => [h.userId, h.strength, h.ref]), [[viktor, 'strong', 'EU-13']]);
  const row = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  assert.equal(withdrawEligibility(db, row(viktor)).code, 'ACCOUNT_REVIEW');
  assert.notEqual(withdrawEligibility(db, row(other)).code, 'ACCOUNT_REVIEW');
  assert.equal(screen(db, viktor), 0); // once per listed person
  decideHit(db, v.hits[0].id, 'cleared', 1);
  assert.equal(row(viktor).sanctions_status, 'clear');
  assert.notEqual(withdrawEligibility(db, row(viktor)).code, 'ACCOUNT_REVIEW');
  // A new player with a listed name: confirmed, blocked.
  const ana = user('Ana Gomez', '1980-01-01');
  screen(db, ana);
  const hit = sanctionsView(db).hits.find((h) => h.userId === ana);
  decideHit(db, hit.id, 'confirmed', 1);
  assert.deepEqual([row(ana).sanctions_status, row(ana).risk_profile], ['confirmed', 'blocked']);
  assert.throws(() => decideHit(db, hit.id, 'xyz', 1), /inválida/);
  // Politically exposed (declared): an alert.
  db.prepare('UPDATE users SET pep_declared = 1 WHERE id = ?').run(other);
  assert.match(riskAlerts(db).find((a) => a.userId === other).reasons.join(), /politicamente exposta/);
});
