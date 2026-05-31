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
            
            if (h2h) {
                h2h.outcomes.forEach(o => {
                    const val = String(o.outcome || o.name || o.label || o.id || '').toLowerCase();
                    const odd = Number(o.price || o.odd || (Number.isNaN(Number(o.value)) ? 0 : o.value) || 0);
                    console.log(`Outcome: "${val}" -> Odd: ${odd}`);
                    
                    if (['1', 'home', 'casa'].includes(val)) console.log("  Matches HOME");
                    else if (['x', 'draw', 'empate'].includes(val)) console.log("  Matches DRAW");
                    else if (['2', 'away', 'fora'].includes(val)) console.log("  Matches AWAY");
                    else console.log("  Matches NOTHING");
                });
            }
            
        } catch (e) {
            console.error("Error parsing payload:", e.message);
        }
    });

} catch (e) {
    console.error("Error reading/parsing file:", e);
}
