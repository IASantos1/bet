const fs = require('fs');
const path = require('path');

const dumpPath = path.join(__dirname, 'future_payloads_json.txt');

try {
    let fileContent = fs.readFileSync(dumpPath, 'utf16le');
    fileContent = fileContent.trim();
    
    // Find the start of the JSON array
    const jsonStart = fileContent.indexOf('[');
    if (jsonStart !== -1) {
        fileContent = fileContent.substring(jsonStart);
    }
    
    const data = JSON.parse(fileContent);
    const rows = data[0].results;
    
    rows.forEach((row, index) => {
        try {
            const payload = JSON.parse(row.payload);
            console.log(`\n--- Row ${index + 1} (ID: ${row.id}) ---`);
            console.log(`League: ${payload.league_name}`);
            console.log(`Teams: ${payload.home_team} vs ${payload.away_team}`);
            console.log(`Has Odds: ${payload.has_odds}`);
            console.log(`Markets Count: ${payload.markets ? payload.markets.length : 0}`);
            if (payload.markets && payload.markets.length > 0) {
                console.log(`First Market: ${payload.markets[0].key} with ${payload.markets[0].outcomes.length} outcomes`);
            }
            console.log(`Odds Object: ${JSON.stringify(payload.odds)}`);
            
        } catch (e) {
            console.error("Error parsing payload:", e.message);
        }
    });

} catch (e) {
    console.error("Error reading/parsing file:", e);
}
