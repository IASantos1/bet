
// const fetch = require('node-fetch'); // Native fetch used

async function check() {
    try {
        const response = await fetch('http://127.0.0.1:8787/api/events/by-sport?sport=soccer');
        const data = await response.json();
        
        console.log('Live Events:', data.live.length);
        console.log('Pregame Events:', data.pregame.length);

        const suspicious = [];
        const top10 = [];

        [...data.live, ...data.pregame].forEach(e => {
            const h = e.home?.name || e.home_team;
            const a = e.away?.name || e.away_team;
            const league = e.league || '';

            if (league.toLowerCase().includes('top 10') || league.toLowerCase().includes('premier') || league.toLowerCase().includes('elite')) {
                top10.push(`${league}: ${h} vs ${a} (ID: ${e.id})`);
                if (top10.length === 1) {
                    console.log('--- Debug Event JSON ---');
                    console.log(JSON.stringify(e, null, 2));
                    console.log('------------------------');
                }
            }

            if (h === 'Home Team' || a === 'Away Team' || h === 'Home' || a === 'Away') {
                suspicious.push(`${league}: ${h} vs ${a} (ID: ${e.id})`);
            }
        });

        console.log('\n--- Critical Leagues (Top 10/Premier/Elite) ---');
        top10.slice(0, 20).forEach(l => console.log(l));

        console.log('\n--- Suspicious Names (Home/Away Team) ---');
        suspicious.slice(0, 20).forEach(l => console.log(l));
        console.log(`Total Suspicious: ${suspicious.length}`);

    } catch (e) {
        console.error(e);
    }
}

check();
