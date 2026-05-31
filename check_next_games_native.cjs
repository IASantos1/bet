const http = require('http');

console.log('Starting check_next_games...');

const postData = JSON.stringify({
  query: `
    SELECT id, event_date, home_team, away_team, status
    FROM events 
    WHERE event_date > '${new Date().toISOString()}'
    ORDER BY event_date ASC
    LIMIT 10
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
        console.log('Upcoming Events in DB:', JSON.stringify(json.results, null, 2));
        
        if (json.results && json.results.length > 0) {
            const first = json.results[0];
            const diff = (new Date(first.event_date) - new Date()) / (1000 * 60 * 60);
            console.log(`Hours to next game (${first.home_team} vs ${first.away_team}): ${diff.toFixed(2)}h`);
        } else {
            console.log('No upcoming events found in DB.');
        }
    } catch (e) {
        console.log('Error parsing JSON:', e.message);
        console.log('Raw data:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();