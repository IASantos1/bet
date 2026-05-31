
async function run() {
    console.log('Triggering Robust Integration...');
    try {
        const trigger = await fetch('http://127.0.0.1:8787/api/debug/run-robust-integration');
        console.log('Trigger status:', trigger.status);
        const text = await trigger.text();
        console.log('Trigger response:', text.substring(0, 100));
        
        console.log('Waiting for logs (5s)...');
        await new Promise(r => setTimeout(r, 5000));

        console.log('Checking Events...');
        const response = await fetch('http://127.0.0.1:8787/api/events/by-sport?sport=soccer');
        const data = await response.json();
        
        console.log('Total Soccer Events:', data.live.length + data.pregame.length);

        const critical = [];
        [...data.live, ...data.pregame].forEach(e => {
             const league = (e.league || '').toLowerCase();
             if (league.includes('top 10') || league.includes('elite') || league.includes('premier')) {
                 critical.push({
                     id: e.id,
                     league: e.league,
                     home: e.home?.name || e.home_team,
                     away: e.away?.name || e.away_team,
                     odds: e.markets?.h2h?.length || 0
                 });
             }
        });

        console.log('--- Critical Events Found ---');
        critical.forEach(c => console.log(JSON.stringify(c)));

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
