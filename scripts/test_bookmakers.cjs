
const http = require('http');

const url = 'http://127.0.0.1:8787/api/bookmakers?provider=odds-api&sport=soccer';

console.log(`Fetching bookmakers from ${url}...`);

http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('Response:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Raw Response:', data);
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
