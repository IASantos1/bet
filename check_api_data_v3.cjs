
async function check() {
    console.log('Starting check...');
    try {
        const res = await fetch('http://127.0.0.1:8787/api/internal/events-db?status=live');
        console.log('Status:', res.status);
        const data = await res.json();
        console.log(`Found ${data.length} live events`);
        
        if (data.length > 0) {
            const sports = {};
            data.forEach(e => {
                const s = e.sport || e.fixture?.sport || 'unknown';
                sports[s] = (sports[s] || 0) + 1;
            });
            console.log('Sports distribution:', sports);

            console.log('Sample events leagues:');
            data.slice(0, 10).forEach(e => {
                const leagueStr = typeof e.league === 'object' ? JSON.stringify(e.league) : e.league;
                console.log(`- ID: ${e.fixture?.id} | Sport: ${e.sport} | League Type: ${typeof e.league} | League Val: ${leagueStr}`);
            });
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

check();
