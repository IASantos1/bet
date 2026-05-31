const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Port 8787 is working');
});
server.listen(8787, '127.0.0.1', () => {
    console.log('Server listening on 127.0.0.1:8787');
});
server.on('error', (e) => {
    console.error('Error binding to port:', e);
});
