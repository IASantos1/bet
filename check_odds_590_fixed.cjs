const http = require('http');

console.log('Checking odds for event 590...');

const postData = JSON.stringify({
  query: `
    SELECT id, home_team, away_team, home_odd, draw_odd, away_odd, markets
    FROM events 
    WHERE id = 590
  `
});

const options = {
  hostname: 'localhost',
  port: 8787,
  path: '/api/dev/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
        const json = JSON.parse(data);
        const evt = json.results[0];
        console.log('Event 590:', {
            id: evt.id,
            home: evt.home_team,
            away: evt.away_team,
            h_odd: evt.home_odd,
            d_odd: evt.draw_odd,
            a_odd: evt.away_odd,
            markets_len: evt.markets ? evt.markets.length : 0
        });
        
        // Check if markets is a JSON string
        if (typeof evt.markets === 'string') {
             console.log('Markets is string, first 50 chars:', evt.markets.substring(0, 50));
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();