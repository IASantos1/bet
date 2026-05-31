
async function run() {
    try {
        console.log("Fetching Events List from DB...");
        const res = await fetch('http://127.0.0.1:8787/api/dev/list-events?limit=20');
        const data = await res.json();
        
        console.log(`Count: ${data.count}`);
        
        if (data.events.length > 0) {
            console.log("\nSample Events:");
            data.events.forEach(e => {
                const hasMarkets = Array.isArray(e.markets) && e.markets.length > 0;
                console.log(`- [${e.league}] ${e.home_team} vs ${e.away_team} (Live: ${e.live}, Status: ${e.status}, Markets: ${hasMarkets ? e.markets.length : 'Empty/Invalid'})`);
                if (hasMarkets) {
                    // console.log('  Markets:', JSON.stringify(e.markets.slice(0, 1)));
                }
            });
        } else {
            console.log("No events found.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
