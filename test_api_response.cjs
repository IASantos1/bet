const { fetch } = require('undici');

async function testApi() {
    try {
        console.log('Fetching events from API...');
        const response = await fetch('http://localhost:8787/api/events/by-sport?sport=soccer');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const events = data.pregame || [];
        
        console.log(`Found ${events.length} pregame events.`);
        
        if (events.length > 0) {
            const sample = events[0];
            console.log('Sample Event:', JSON.stringify({
                id: sample.id,
                home: sample.home_team,
                away: sample.away_team,
                oddsFrozen: sample.oddsFrozen,
                markets_type: Array.isArray(sample.markets) ? 'Array' : typeof sample.markets,
                h2h_exists: !!(sample.markets && (sample.markets.h2h || sample.markets.find?.(m => m.key === 'h2h'))),
                home_odd: sample.home_odd,
                draw_odd: sample.draw_odd,
                away_odd: sample.away_odd
            }, null, 2));

            // Check specifically for Parma vs Juve if possible
            const parma = events.find(e => e.home_team.includes('Parma'));
            if (parma) {
                 console.log('Parma Event:', JSON.stringify({
                    id: parma.id,
                    home: parma.home_team,
                    away: parma.away_team,
                    oddsFrozen: parma.oddsFrozen,
                    markets_keys: parma.markets ? Object.keys(parma.markets) : 'null',
                    h2h: parma.markets?.h2h
                }, null, 2));
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testApi();
