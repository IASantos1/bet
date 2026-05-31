const http = require('http');

async function fetchEvents(sport) {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:8787/api/events?sport=${sport}`;
    console.log(`Fetching ${url}...`);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          console.error(`Error parsing JSON for ${sport}:`, data.substring(0, 100));
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.error(`Error fetching ${sport}:`, err.message);
      resolve([]);
    });
  });
}

async function run() {
  const sports = ['soccer', 'basketball', 'tennis', 'ice-hockey', 'volleyball'];
  
  for (const sport of sports) {
    const events = await fetchEvents(sport);
    // Filter for live events if the API returns mixed
    const liveEvents = Array.isArray(events) ? events.filter(e => e.is_live === 1 || e.status === 'LIVE' || (e.fixture && e.fixture.status && ['1H','2H','Q1','Q2','S1','S2'].includes(e.fixture.status.short))) : [];
    
    console.log(`\n--- ${sport.toUpperCase()} ---`);
    console.log(`Total Events: ${Array.isArray(events) ? events.length : 0}`);
    console.log(`Live Events: ${liveEvents.length}`);
    
    if (liveEvents.length > 0) {
      const sample = liveEvents[0];
      console.log('Sample Live Event:');
      console.log(`  ID: ${sample.id}`);
      console.log(`  Match: ${sample.home_team} vs ${sample.away_team}`);
      console.log(`  Status: ${sample.status || sample.fixture?.status?.short}`);
      console.log(`  Elapsed: ${sample.elapsed || sample.fixture?.status?.elapsed}`);
      console.log(`  Score: ${JSON.stringify(sample.goals || sample.score)}`);
      console.log(`  Markets: ${sample.markets ? sample.markets.length : 0}`);
    }
  }
}

run();
