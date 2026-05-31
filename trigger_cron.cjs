const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 8787,
  path: '/cdn-cgi/handler/scheduled',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
console.log('Triggering Scheduled Event...');