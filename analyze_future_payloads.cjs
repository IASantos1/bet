const fs = require('fs');
const path = require('path');

const dumpPath = path.join(__dirname, 'future_payloads_sample.txt');

try {
    // Read as UTF-16LE which is typical for PowerShell > output
    let fileContent = fs.readFileSync(dumpPath, 'utf16le');
    
    // Clean up potential BOM or other artifacts
    fileContent = fileContent.trim();
    
    console.log("File content preview (first 500 chars):");
    console.log(fileContent.substring(0, 500));
    
    // Try to find JSON-like structures
    // The output is likely a table, so we look for lines that contain JSON
    // Or we can try to extract the payload column which is usually the second column
    
    // Let's just find anything that looks like "league":{"id":...}
    const leagueMatches = fileContent.match(/"league":\{"id":\d+,"name":"([^"]+)"/g);
    if (leagueMatches) {
        console.log("\nFound Leagues:");
        leagueMatches.forEach(m => console.log(m));
    } else {
        console.log("\nNo league patterns found.");
    }

    // Check for bookmakers
    const bookmakerMatches = fileContent.match(/"bookmakers":\[/g);
    console.log(`\nFound "bookmakers":[ count: ${bookmakerMatches ? bookmakerMatches.length : 0}`);
    
    // Check for "bookmakers":[] (empty)
    const emptyBookmakers = fileContent.match(/"bookmakers":\[\]/g);
    console.log(`Found "bookmakers":[] (empty) count: ${emptyBookmakers ? emptyBookmakers.length : 0}`);

} catch (e) {
    console.error("Error reading file:", e);
}
