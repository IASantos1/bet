
const fs = require('fs');

async function run() {
    try {
        console.log('Fetching internal DB data...');
        const res = await fetch('http://127.0.0.1:8787/api/internal/events-db?status=live');
        if (!res.ok) {
            throw new Error(`API returned ${res.status} ${res.statusText}`);
        }
        
        const events = await res.json();
        let output = `Fetched ${events.length} live events.\n`;
        
        const badLeagues = events.filter(e => 
            e.league === '[object Object]' || 
            (typeof e.league === 'string' && e.league.includes('{')) ||
            !e.league
        );
        
        output += `Found ${badLeagues.length} events with bad league names.\n`;
        
        if (badLeagues.length > 0) {
            output += 'Samples of bad leagues:\n';
            badLeagues.slice(0, 5).forEach(e => {
                output += `ID: ${e.id}, Sport: ${e.sport}, League: ${e.league}, Home: ${e.home_team}\n`;
            });
        }
        
        // Check non-soccer
        const nonSoccer = events.filter(e => e.sport !== 'soccer');
        output += `\nNon-soccer events: ${nonSoccer.length}\n`;
        if (nonSoccer.length > 0) {
             output += 'Samples of non-soccer:\n';
             nonSoccer.slice(0, 5).forEach(e => {
                 output += `ID: ${e.id}, Sport: ${e.sport}, Status: ${e.status}, Score: ${JSON.stringify(e.score)}, Elapsed: ${e.elapsed}\n`;
             });
        }

        // Check specifically for the Newcastle game mentioned by user
        const newcastle = events.find(e => e.home_team.includes('Newcastle') || e.away_team.includes('Newcastle') || e.home_team.includes('Man City') || e.away_team.includes('Man City'));
        if (newcastle) {
            output += `\nNewcastle/ManCity Game Found:\n${JSON.stringify(newcastle, null, 2)}\n`;
        } else {
            output += `\nNewcastle/ManCity Game NOT Found in current payload.\n`;
        }

        fs.writeFileSync('debug_output.txt', output);
        console.log('Output written to debug_output.txt');

    } catch (err) {
        console.error('Error:', err.message);
        fs.writeFileSync('debug_output.txt', 'Error: ' + err.message);
    }
}

run();
