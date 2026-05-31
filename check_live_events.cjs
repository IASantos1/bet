// const fetch = require('node-fetch'); // Native fetch in Node 18+

async function fetchLiveEvents() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

        console.log('Fetching live events...');
        const response = await fetch('http://127.0.0.1:8787/api/internal/events-db?is_live=1&limit=100', {
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        console.log(`Total live events: ${data.length}`);
        
        const basketball = data.filter(e => e.sport === 'basketball');
        console.log(`Basketball live events: ${basketball.length}`);
        if (basketball.length > 0) {
             console.log('Sample basketball events:');
             basketball.slice(0, 5).forEach(e => {
                const score = e.score || (e.goals ? JSON.stringify(e.goals) : 'undefined');
                const elapsed = e.elapsed || (e.fixture?.status?.elapsed) || 'undefined';
                console.log(`- [${e.sport}] ${e.home_team} vs ${e.away_team} (ID: ${e.id})`);
                console.log(`  Status: ${JSON.stringify(e.status)}`);
                console.log(`  Elapsed: ${elapsed}`);
                console.log(`  Score: ${score}`);
             });
        }

        const nonSoccer = data.filter(e => e.sport !== 'soccer' && e.sport !== 'basketball');
        console.log(`Other non-soccer live events: ${nonSoccer.length}`);

        const soccer = data.filter(e => e.sport === 'soccer');
         if (soccer.length > 0) {
            console.log('Sample soccer events:');
            soccer.slice(0, 3).forEach(e => {
                const score = e.score || (e.goals ? JSON.stringify(e.goals) : 'undefined');
                const elapsed = e.elapsed || (e.fixture?.status?.elapsed) || 'undefined';
                console.log(`- [${e.sport}] ${e.home_team} vs ${e.away_team} (Status: ${e.status}, Elapsed: ${elapsed})`);
                 console.log(`  Score: ${score}`);
            });
        }
        
    } catch (error) {
        console.error('Error fetching events:', error.message);
    }
}

fetchLiveEvents();
