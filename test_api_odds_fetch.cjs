const https = require('https');

const apiKey = 'cbef02a7c902f0dfb7260b0b638fffa0';
const date = '2026-03-08';
const fixtureId = 1519506;

const options = {
  hostname: 'v3.football.api-sports.io',
  path: `/odds?date=${date}&fixture=${fixtureId}`, // We can filter by fixture directly to save bandwidth
  method: 'GET',
  headers: {
    'x-apisports-key': apiKey
  }
};

console.log(`Fetching odds for fixture ${fixtureId} on ${date}...`);

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Response status:', res.statusCode);
      console.log('Results count:', json.results);
      
      if (json.response && json.response.length > 0) {
        console.log('✅ Odds found!');
        console.log('Bookmakers:', json.response[0].bookmakers.length);
        if (json.response[0].bookmakers.length > 0) {
            console.log('First bookmaker:', json.response[0].bookmakers[0].name);
        }
      } else {
        console.log('❌ No odds found for this fixture.');
        console.log('Full response errors:', json.errors);
      }
    } catch (e) {
      console.error('Error parsing JSON:', e);
      console.log('Raw data:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.end();
