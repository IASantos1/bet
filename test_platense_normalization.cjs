const fs = require('fs');
const path = require('path');

// Read the payload dump file
const dumpPath = path.join(__dirname, 'payload_dump_generic.txt');
let fileContent = fs.readFileSync(dumpPath, 'utf16le'); // PowerShell default encoding

// Find the start of the JSON array - look for the specific structure of D1 output
const jsonStart = fileContent.indexOf('[\r\n  {\r\n    "results":'); 
const altJsonStart = fileContent.indexOf('[{"results":');
const altJsonStart2 = fileContent.indexOf('[\n  {\n    "results":');

const start = jsonStart !== -1 ? jsonStart : (altJsonStart !== -1 ? altJsonStart : altJsonStart2);

if (start === -1) {
    console.error("Could not find JSON array start in file");
    // Fallback: try finding the first [ after "1 command executed successfully."
    const marker = "1 command executed successfully.";
    const markerIndex = fileContent.indexOf(marker);
    if (markerIndex !== -1) {
        const potentialStart = fileContent.indexOf('[', markerIndex);
        if (potentialStart !== -1) {
             console.log("Using fallback strategy to find JSON start");
             const jsonContent = fileContent.substring(potentialStart, fileContent.lastIndexOf(']') + 1);
             try {
                 data = JSON.parse(jsonContent);
             } catch (e) {
                 console.error("Fallback parsing failed:", e.message);
                 process.exit(1);
             }
        } else {
             process.exit(1);
        }
    } else {
        process.exit(1);
    }
} else {
    const jsonEnd = fileContent.lastIndexOf(']');
    const jsonContent = fileContent.substring(start, jsonEnd + 1);
    
    try {
        data = JSON.parse(jsonContent);
    } catch (e) {
        console.error("Failed to parse JSON content:", e.message);
        process.exit(1);
    }
}

const payloadString = data[0].results[0].payload;
const payload = JSON.parse(payloadString);

console.log("Parsed payload successfully");
console.log(`Event: ${payload.home_team} vs ${payload.away_team}`);
console.log(`Date: ${payload.event_date}`);

// Simulate EventSync logic
let h = 0, d = 0, a = 0;
const homeName = payload.home_team;
const awayName = payload.away_team;
const externalId = payload.id;
const normalizedSport = payload.sport || 'soccer'; // Assume soccer

console.log(`\n--- Simulating Odds Extraction ---`);

if (payload.markets) {
    let h2hData = null;

    if (Array.isArray(payload.markets)) {
        const m = payload.markets.find(m => m.key === 'h2h');
        if (m) {
            h2hData = m.selections || m.outcomes || null;
            console.log(`Found 'h2h' market in array. Outcomes count: ${h2hData ? h2hData.length : 0}`);
        } else {
            console.log("No 'h2h' market found in payload.markets array");
        }
    } else if (payload.markets.h2h && Array.isArray(payload.markets.h2h)) {
        h2hData = payload.markets.h2h;
        console.log("Found 'h2h' market in object");
    }

    if (h2hData) {
        let homeFound = false;
        let awayFound = false;

        // Logic from EventSync (Fixed version)
        h2hData.forEach((o) => {
            const val = String(o.outcome || o.name || o.label || o.id || '').toLowerCase();
            // Fix: Prioritize price/odd over value
            const odd = Number(o.price || o.odd || (Number.isNaN(Number(o.value)) ? 0 : o.value) || 0);
            
            const hName = homeName.toLowerCase();
            const aName = awayName.toLowerCase();

            console.log(`Checking outcome: val="${val}", odd=${odd} (raw: price=${o.price}, value=${o.value})`);

            if (['1', 'home', 'casa'].includes(val) || val === hName || hName.includes(val) || val.includes(hName)) {
                h = odd;
                homeFound = true;
                console.log(`  -> Matched HOME: ${h}`);
            }
            else if (['x', 'draw', 'empate'].includes(val)) {
                d = odd;
                console.log(`  -> Matched DRAW: ${d}`);
            }
            else if (['2', 'away', 'fora'].includes(val) || val === aName || aName.includes(val) || val.includes(aName)) {
                a = odd;
                awayFound = true;
                console.log(`  -> Matched AWAY: ${a}`);
            }
        });

        console.log(`Extracted: 1=${h}, X=${d}, 2=${a}`);
    }
} else {
    console.log("No 'markets' property in payload");
}
