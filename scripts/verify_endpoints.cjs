
const http = require('http');

const urls = [
    'http://127.0.0.1:8787/api/bookmakers?provider=odds-api',
    'http://127.0.0.1:8787/api/featured-games'
];

urls.forEach(url => {
    http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log(`\nURL: ${url}`);
            console.log(`Status: ${res.statusCode}`);
            try {
                const json = JSON.parse(data);
                console.log('Response:', JSON.stringify(json, null, 2).substring(0, 500) + '...');
            } catch (e) {
                console.log('Response (raw):', data.substring(0, 500));
            }
        });
    }).on('error', (err) => {
        console.error(`Error fetching ${url}:`, err.message);
    });
});
