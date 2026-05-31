
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
    query: "SELECT id, home_team, away_team, league, external_event_id FROM events WHERE home_team IS NULL OR home_team = '' OR home_team = 'Home Team' OR away_team IS NULL OR away_team = '' LIMIT 20"
}));
req.end();
