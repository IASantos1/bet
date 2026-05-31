
const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 8788,
  path: '/api/dev/force-import',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer dev-admin-token'
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
