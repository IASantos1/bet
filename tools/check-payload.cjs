
const { execSync } = require('child_process');

async function check() {
    try {
        console.log("Querying D1 database for Corinthians/Velo events...");
        const cmd = `npx wrangler d1 execute bet62-db --local --command "SELECT id, home_team, away_team, payload FROM imported_odds WHERE home_team LIKE '%Corinthians%' OR away_team LIKE '%Corinthians%' OR home_team LIKE '%Velo%' OR away_team LIKE '%Velo%'" --json`;
        
        const output = execSync(cmd).toString();
        const result = JSON.parse(output);
        
        if (result && result.length > 0 && result[0].results && result[0].results.length > 0) {
            const rows = result[0].results;
            console.log(`Found ${rows.length} events.`);
            
            rows.forEach(row => {
                console.log(`\nEvent DB ID: ${row.id}`);
                console.log(`Match: ${row.home_team} vs ${row.away_team}`);
                
                try {
                    const payload = JSON.parse(row.payload);
                    console.log(`Payload ID: ${payload.id || payload.fixture?.id}`);
                    console.log(`Source: ${payload.source}`);
                    
                    const status = payload.fixture?.status;
                    console.log(`Status Type: ${typeof status}`);
                    if (typeof status === 'object') {
                        console.log(`Status: Short=${status.short}, Elapsed=${status.elapsed}, Long=${status.long}`);
                    } else {
                        console.log(`Status: ${status}`);
                    }

                    const goals = payload.fixture?.goals;
                    console.log(`Goals: Home=${goals?.home}, Away=${goals?.away}`);

                    const odds = payload.odds;
                    const oddsKeys = odds ? Object.keys(odds) : [];
                    console.log(`Odds Keys: ${oddsKeys.join(', ') || 'none'}`);
                    
                    if (oddsKeys.length > 0) {
                        // Show sample odds
                        if (odds.h2h) console.log(`  H2H:`, odds.h2h);
                    }
                    
                } catch (e) {
                    console.error("Error parsing payload:", e.message);
                }
            });
        } else {
            console.log("No matching events found in imported_odds.");
        }
        
    } catch (e) {
        console.error("Error executing check:", e.message);
    }
}

check();
