
const http = require('http');

console.log('Starting check...');

const options = {
  hostname: '127.0.0.1',
  port: 8787,
  path: '/api/events/by-sport?sport=soccer',
  method: 'GET',
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Data received. Parsing...');
    try {
      const json = JSON.parse(data);
      const events = [...(json.live || []), ...(json.pregame || [])];
      console.log(`Total Soccer Events: ${events.length}`);
      
      const critical = events.filter(e => {
          const l = (e.league || '').toLowerCase();
          return l.includes('top 10') || l.includes('top10') || l.includes('elite') || l.includes('premier');
      });
      
      console.log(`Critical Events Found: ${critical.length}`);
      if (critical.length === 0) {
          console.log('Top 10/Elite leagues NOT found in the response.');
          // List some leagues found to verify
          const leagues = [...new Set(events.map(e => e.league))].slice(0, 10);
          console.log('Sample leagues found:', leagues.join(', '));
      }

      critical.forEach(e => {
          console.log(`[${e.id}] ${e.league}: ${e.home_team || e.home?.name} vs ${e.away_team || e.away?.name} (Odds: ${e.markets?.h2h?.length || 0})`);
      });

      const suspicious = events.filter(e => {
          const h = (e.home_team || e.home?.name || '').toLowerCase();
          const a = (e.away_team || e.away?.name || '').toLowerCase();
          return h.includes('home') || a.includes('away');
      });

      console.log(`Suspicious Events Found: ${suspicious.length}`);
      suspicious.forEach(e => {
          console.log(`[${e.id}] ${e.league}: ${e.home_team} vs ${e.away_team}`);
      });

    } catch (e) {
      console.error('Error parsing JSON:', e.message);
      console.log('Raw data snippet:', data.substring(0, 200));
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
