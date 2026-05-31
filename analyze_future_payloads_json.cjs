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
    // Wrangler output structure: [{ results: [ { id, payload }, ... ], ... }]
    const rows = data[0].results;
    
    console.log(`Found ${rows.length} rows.`);
    
    rows.forEach((row, index) => {
        console.log(`\n--- Row ${index + 1} (ID: ${row.id}) ---`);
        try {
            const payload = JSON.parse(row.payload);
            
            // League Info
            const league = payload.league || {};
            console.log(`League: ${league.name} (ID: ${league.id})`);
            console.log(`Country: ${league.country}`);
            
            // Bookmakers
            const bookmakers = payload.bookmakers || [];
            console.log(`Bookmakers Count: ${bookmakers.length}`);
            
            if (bookmakers.length > 0) {
                bookmakers.forEach((bm, i) => {
                    console.log(`  BM ${i+1}: ${bm.name} (Markets: ${bm.bets ? bm.bets.length : 0})`);
                });
            } else {
                console.log("  NO BOOKMAKERS FOUND");
            }
            
            // Check if odds exist in the payload structure
            // Sometimes odds are at top level or different structure?
            // API-Sports usually has response[0].bookmakers
            
        } catch (e) {
            console.error(`Error parsing payload for row ${index + 1}:`, e.message);
            console.log("Raw payload preview:", row.payload.substring(0, 100));
        }
    });

} catch (e) {
    console.error("Error reading/parsing file:", e);
    // console.log("Raw content preview:", fs.readFileSync(dumpPath, 'utf16le').substring(0, 500));
}
