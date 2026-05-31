
// const fetch = require('node-fetch'); // Native fetch in Node 18+

async function checkApiOdds() {
    const url = 'http://127.0.0.1:8788/api/events/by-sport?sports=all';
    console.log(`Fetching from ${url}...`);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Error: ${res.status} ${res.statusText}`);
            const txt = await res.text();
            console.error(txt);
            return;
        }

        const data = await res.json();
        // The API returns { live: [], pregame: [] } or just [] depending on implementation
        // But my recent change returns { live: [], pregame: [] }
        
        let events = [];
        if (data.live) events = events.concat(data.live);
        if (data.pregame) events = events.concat(data.pregame);
        if (Array.isArray(data)) events = data;

        console.log(`Found ${events.length} events in response.`);

        const premiershipEvents = events.filter(e => 
            (e.league && e.league.includes('Premiership')) || 
            (e.home_team && ['Rangers', 'Celtic', 'Aberdeen'].includes(e.home_team))
        );

        console.log(`Found ${premiershipEvents.length} Premiership/Key events.`);

        premiershipEvents.forEach(e => {
            console.log(`[${e.id}] ${e.home_team} vs ${e.away_team}`);
            console.log(`   Odds: 1(${e.home_odd}) X(${e.draw_odd}) 2(${e.away_odd})`);
            console.log(`   Markets keys: ${Object.keys(e.markets || {}).join(', ')}`);
            if (e.markets && e.markets.h2h) {
                console.log(`   H2H Market: Found`);
            } else {
                console.log(`   H2H Market: MISSING (Should rely on fallback)`);
            }
            console.log('---');
        });

    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkApiOdds();
