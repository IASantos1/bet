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
        console.log(`\n--- Row ${index + 1} (ID: ${row.id}) ---`);
        try {
            const payload = JSON.parse(row.payload);
            console.log("Top-level keys:", Object.keys(payload));
            
            // Check for nested structure
            if (payload.response) {
                console.log("Found 'response' property. Is it an array?", Array.isArray(payload.response));
                if (Array.isArray(payload.response) && payload.response.length > 0) {
                    console.log("First item keys:", Object.keys(payload.response[0]));
                }
            }
            
            if (payload.fixture) console.log("Has 'fixture' property");
            if (payload.league) console.log("Has 'league' property");
            if (payload.bookmakers) console.log("Has 'bookmakers' property");
            
        } catch (e) {
            console.error("Error parsing payload:", e.message);
        }
    });

} catch (e) {
    console.error("Error reading/parsing file:", e);
}
