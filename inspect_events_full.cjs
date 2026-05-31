const { fetch } = require('undici');

async function run() {
  try {
    console.log('Fetching events from /api/dev/list-events...');
    const response = await fetch('http://127.0.0.1:8787/api/dev/list-events?limit=100');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Found ${data.count} synced events.`);

    if (data.events && data.events.length > 0) {
      console.log('\n--- Synced Events Sample ---');
      data.events.slice(0, 10).forEach(e => {
          const mkts = (typeof e.markets === 'string') ? JSON.parse(e.markets) : (e.markets || {});
          const h2h = mkts.h2h || [];
          const odds = h2h.length > 0 
              ? `1(${h2h[0]?.value}) X(${h2h[1]?.value}) 2(${h2h[2]?.value})`
              : `1(${e.home_odd || 0}) X(${e.draw_odd || 0}) 2(${e.away_odd || 0})`;

          console.log(`[${e.id}] ${e.league}: ${e.home_team} vs ${e.away_team} (Sport: ${e.sport})`);
          console.log(`      Date: ${e.event_date} | Status: ${e.status} | Live: ${e.live}`);
          console.log(`      Odds: ${odds}`);
          
          if (!e.home_team || !e.away_team) {
              console.log('  >>> WARNING: EMPTY NAMES DETECTED <<<');
          }
      });
      
      // Check for Premiership specifically
      const premiership = data.events.filter(e => e.league && e.league.includes('Premiership'));
      if (premiership.length > 0) {
          console.log(`\n--- Premiership Events (${premiership.length}) ---`);
          premiership.forEach(e => {
              console.log(`[${e.id}] ${e.home_team} vs ${e.away_team}`);
              console.log(`      Odds: 1(${e.home_odd || 0}) X(${e.draw_odd || 0}) 2(${e.away_odd || 0})`);
          });
      } else {
          console.log('\nNo Premiership events found in events table.');
      }
      
    } else {
      console.log('No events found in events table.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

run();
