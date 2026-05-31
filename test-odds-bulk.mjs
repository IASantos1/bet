
import https from 'https';

const options = {
  hostname: 'v3.football.api-sports.io',
  path: '/odds/live',
  method: 'GET',
  headers: {
    'x-apisports-key': 'cbef02a7c902f0dfb7260b0b638fffa0'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data.slice(0, 2000)); // First 2000 chars
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.end();
