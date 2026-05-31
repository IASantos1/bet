const fetch = require('node-fetch');

async function check() {
    try {
        const res = await fetch('http://127.0.0.1:8787/api/internal/events-db?status=live');
        const data = await res.json();
        console.log(`Found ${data.length} live events`);
        
        if (data.length > 0) {
            // Check sports distribution
            const sports = {};
            data.forEach(e => {
                const s = e.sport || e.fixture?.sport || 'unknown';
                sports[s] = (sports[s] || 0) + 1;
            });
            console.log('Sports distribution:', sports);

            // Check league format for first few events
            console.log('Sample events leagues:');
            data.slice(0, 5).forEach(e => {
                console.log(`- ID: ${e.fixture?.id} | Sport: ${e.sport} | League: ${JSON.stringify(e.league)} | LeagueName: ${e.league_name}`);
            });
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

check();
