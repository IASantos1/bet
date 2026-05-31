
const http = require('http');

console.log('Checking for Critical Leagues...');

const options = {
  hostname: '127.0.0.1',
  port: 8787,
  path: '/api/events/by-sport?sport=soccer',
  method: 'GET',
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const events = [...(json.live || []), ...(json.pregame || [])];
      console.log(`Total Soccer Events: ${events.length}`);
      
      const criticalKeywords = ['Top 10', 'Elite 1', 'Premier 15s', 'Premiership'];
      
      const criticalEvents = events.filter(e => {
          const l = (e.league || '').toLowerCase();
          return criticalKeywords.some(k => l.includes(k.toLowerCase()));
      });
      
      console.log(`Critical Events Found: ${criticalEvents.length}`);
      
      if (criticalEvents.length > 0) {
          console.log('\n--- Critical Events Details ---');
          criticalEvents.slice(0, 10).forEach(e => { // Show first 10
              console.log(`[${e.league}] ${e.home_team} vs ${e.away_team}`);
              console.log(`   Odds: 1:${e.home_odd} | X:${e.draw_odd} | 2:${e.away_odd}`);
              console.log(`   Status: ${e.status} | Live: ${e.is_live}`);
              console.log('---');
          });
      } else {
          console.log('No critical leagues found.');
          // List a few leagues that WERE found to debug
          const leagues = [...new Set(events.map(e => e.league))].slice(0, 10);
          console.log('Sample leagues found:', leagues.join(', '));
      }

    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
