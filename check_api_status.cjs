const https = require('https');

const apiKey = '85777595535560f782c5780a421b5853';

const options = {
  hostname: 'v3.football.api-sports.io',
  path: '/status',
  method: 'GET',
  headers: {
    'x-apisports-key': apiKey
  }
};

console.log('Checking API Key status...');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Status Response:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.end();
