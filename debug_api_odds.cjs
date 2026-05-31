const https = require('https');

const API_KEY = 'cbef02a7c902f0dfb7260b0b638fffa0';
const FIXTURE_ID = '1511506'; // The ID from the check script (soccer_1511506 -> 1511506)

const options = {
  hostname: 'v3.football.api-sports.io',
  path: `/odds?fixture=${FIXTURE_ID}&bookmaker=1`,
  method: 'GET',
  headers: {
    'x-apisports-key': API_KEY
  }
};

console.log(`Fetching odds for fixture ${FIXTURE_ID}...`);

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    try {
      const json = JSON.parse(data);
      console.log('Response:', JSON.stringify(json, null, 2));
      
      if (json.response && json.response.length > 0) {
          const bookmakers = json.response[0].bookmakers;
          console.log(`Found ${bookmakers.length} bookmakers.`);
      } else {
          console.log('No odds found in response.');
      }
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
      console.log('Raw data:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
