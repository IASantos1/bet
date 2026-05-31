const http = require('http');

const url = 'http://127.0.0.1:8787/api/internal/events-db?live=true';

console.log(`Fetching from ${url}...`);

const req = http.get(url, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.error(`Status Code: ${res.statusCode}`);
            console.error('Response:', data);
            return;
        }

        try {
            const events = JSON.parse(data);
            console.log(`Found ${events.length} live events.`);
            
            // Count by sport
            const bySport = {};
            events.forEach(e => {
                bySport[e.sport] = (bySport[e.sport] || 0) + 1;
            });
            console.log('Events by sport:', bySport);
            
            // Print details
            events.forEach(e => {
                console.log(`\n[${e.sport}] ${e.home_team} vs ${e.away_team}`);
                console.log(`   ID: ${e.id} | Status: ${e.status} | Time: ${e.elapsed}'`);
                console.log(`   League: "${e.league}" (Type: ${typeof e.league})`);
                console.log(`   Score: ${JSON.stringify(e.score)}`);
                
                // Check if league is [object Object]
                if (e.league === '[object Object]') {
                    console.error('   ERROR: League is [object Object]!');
                }
            });
            
        } catch (e) {
            console.error('Failed to parse JSON:', e.message);
            console.log('Raw data:', data.substring(0, 500));
        }
    });
});

req.on('error', (e) => {
    console.error('Request error:', e.message);
});

req.end();
