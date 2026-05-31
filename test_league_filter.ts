
import { isSmallLeagueName } from './src/worker/utils/leagueFilter';

const testCases = [
  { name: 'Premier League', expected: false },
  { name: 'Brasileirão', expected: false },
  { name: 'Brasileirão Sub-20', expected: true },
  { name: 'Women\'s World Cup', expected: true },
  { name: 'U21 Euro', expected: true },
  { name: 'Premier League U23', expected: true },
  { name: 'Copa do Brasil', expected: false },
  { name: 'Copa do Brasil Sub-17', expected: true },
  { name: 'Feminino A1', expected: true },
  { name: 'Ladies League', expected: true },
  { name: 'Reserve League', expected: true },
  { name: 'Amateur Cup', expected: true },
  { name: 'Champions League', expected: false },
  { name: 'UEFA Youth League', expected: true }
];

console.log('Running League Filter Tests...');
let passed = 0;
let failed = 0;

testCases.forEach(tc => {
  const result = isSmallLeagueName(tc.name);
  if (result === tc.expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: "${tc.name}" -> Expected ${tc.expected}, got ${result}`);
  }
});

console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) process.exit(1);
