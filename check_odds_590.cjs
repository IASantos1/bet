const http = require('http');

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
        console.log('Event 590 Data:', JSON.stringify(json.results, null, 2));
    } catch (e) {
        console.log(e);
    }
  });
});

req.end();