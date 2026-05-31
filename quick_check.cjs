
const fs = require('fs');

async function run() {
    try {
        const res = await fetch('http://127.0.0.1:8787/api/internal/events-db?status=live');
        const data = await res.json();
        let output = `Count: ${data.length}\n`;
        
        if (data.length > 0) {
            output += `Sample: ${JSON.stringify(data[0], null, 2)}\n`;
            // Check for object object
            const badLeagues = data.filter(e => e.league === '[object Object]' || (typeof e.league === 'string' && e.league.includes('{')));
            output += `Bad leagues count: ${badLeagues.length}\n`;
            if (badLeagues.length > 0) {
                output += `Bad league sample: ${badLeagues[0].league}\n`;
            }
            
            // Check non-soccer
            const nonSoccer = data.filter(e => e.sport !== 'soccer');
            output += `Non-soccer count: ${nonSoccer.length}\n`;
            if (nonSoccer.length > 0) {
                output += `Non-soccer sample: ${JSON.stringify(nonSoccer[0], null, 2)}\n`;
            }
        }
        fs.writeFileSync('check_output.txt', output);
    } catch (e) {
        fs.writeFileSync('check_output.txt', 'Error: ' + e.message);
    }
}
run();
