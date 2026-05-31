
const isSmallLeagueName = (name, country) => {
  const n = String(name || '').toLowerCase();
  const c = String(country || '').toLowerCase();
  if (!n) return false;

  // STRICT BLOCK: U-levels, Youth, Reserves, Women
  if (
    n.includes('youth') ||
    n.includes('u20') ||
    n.includes('u-20') ||
    n.includes('sub-20') ||
    n.includes('sub20') ||
    n.includes('u21') ||
    n.includes('u-21') ||
    n.includes('u19') ||
    n.includes('u-19') ||
    n.includes('u17') ||
    n.includes('u-17') ||
    n.includes('u18') ||
    n.includes('u-18') ||
    n.includes('u23') ||
    n.includes('u-23') ||
    n.includes('u22') ||
    n.includes('u-22') ||
    n.includes('u25') ||
    n.includes('u-25')
  ) {
    return true;
  }

  if (
    n.includes('women') ||
    n.includes('feminino') ||
    n.includes('feminina') ||
    n.includes('femininas') ||
    n.includes('feminine') ||
    n.includes('ladies') ||
    n.includes('mulheres') ||
    n.includes('womens') ||
    n.includes('w-league')
  ) {
    return true;
  }

  if (n.includes('youth cup')) return true;
  if (n.includes('sergipano')) return true;
  if (c === 'brazil' && n.includes('copinha')) return true;
  
  // Specific small/unwanted leagues
  if (n.includes('reserve') || n.includes('reserves')) return true;
  if (n.includes('amateur')) return true;
  if (n.includes('regional')) return true;
  if (n.includes('state league')) return true; 
  
  return false;
};

const testCases = [
  { name: 'Premier League', expected: false },
  { name: 'Brasileirão', expected: false },
  { name: 'Brasileirão Sub-20', expected: true }, // Should be blocked
  { name: 'Women\'s World Cup', expected: true }, // Should be blocked per user request
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

console.log('Running JS Filter Tests...');
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
