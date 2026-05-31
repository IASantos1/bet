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
            const markets = payload.markets || [];
            const h2h = markets.find(m => m.key === 'h2h');
            console.log(`Has h2h market: ${!!h2h}`);
            if (h2h) {
                console.log(`h2h outcomes: ${JSON.stringify(h2h.outcomes || h2h.selections)}`);
            } else {
                console.log("Available markets:", markets.map(m => m.key).join(', '));
            }
            
        } catch (e) {
            console.error("Error parsing payload:", e.message);
        }
    });

} catch (e) {
    console.error("Error reading/parsing file:", e);
}
