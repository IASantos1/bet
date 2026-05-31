
const fetch = require('http');

const req = fetch.request('http://127.0.0.1:8788/api/dev/sql', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'}
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(data));
});

req.on('error', e => console.error(e));
req.write(JSON.stringify({
    query: "SELECT id, home_team, away_team, league FROM events LIMIT 20"
}));
req.end();
