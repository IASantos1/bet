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
            console.log(`Odds Object: ${JSON.stringify(payload.odds)}`);
        } catch (e) {
            console.error("Error parsing payload:", e.message);
        }
    });

} catch (e) {
    console.error("Error reading/parsing file:", e);
}
