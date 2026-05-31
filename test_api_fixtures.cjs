const https = require('https');

const apiKey = 'cbef02a7c902f0dfb7260b0b638fffa0'; // Using the working key from test_api_odds_fetch.cjs
const date = '2026-02-25'; // Tomorrow
const sport = 'football';

const options = {
  hostname: 'v3.football.api-sports.io',
  path: `/fixtures?date=${date}`,
  method: 'GET',
  headers: {
    'x-apisports-key': apiKey
  }
};

console.log(`Fetching fixtures for ${date}...`);

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(`Response status: ${res.statusCode}`);
      console.log(`Results count: ${json.results}`);
      
      if (json.response && json.response.length > 0) {
        console.log('Sample fixtures:');
        json.response.slice(0, 3).forEach(f => {
          console.log(`- ${f.fixture.id}: ${f.teams.home.name} vs ${f.teams.away.name} (${f.league.name})`);
        });
      } else {
        console.log('❌ No fixtures found for this date.');
        console.log('Errors:', json.errors);
      }

    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.end();
