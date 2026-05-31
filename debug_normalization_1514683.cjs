const fs = require('fs');
const path = require('path');

// Read the D1 query result file
const filePath = path.join(__dirname, 'payload_1514683.json');
console.log(`Reading ${filePath}...`);

try {
    let rawContent = fs.readFileSync(filePath, 'utf8');
    // Strip BOM
    if (rawContent.charCodeAt(0) === 0xFEFF) {
        rawContent = rawContent.slice(1);
    }
    // Try to find the JSON array [ ... ]
    const start = rawContent.indexOf('[');
    const end = rawContent.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
        rawContent = rawContent.substring(start, end + 1);
    }
    
    const d1Result = JSON.parse(rawContent);
    
    // Extract the payload string
    // Structure: [ { "results": [ { "payload": "..." } ] } ]
    const payloadString = d1Result[0].results[0].payload;
    
    if (!payloadString) {
        console.error("Payload string not found in JSON structure.");
        process.exit(1);
    }
    
    // Parse the inner JSON payload
    const payload = JSON.parse(payloadString);
    console.log("Payload parsed successfully.");
    console.log("ID:", payload.id);
    console.log("Markets:", JSON.stringify(payload.markets, null, 2));

    // --- NORMALIZATION LOGIC START (Copy from eventSync.ts) ---
    
    const fx = payload.fixture || {};
    const teams = payload.teams || { home: {}, away: {} };
    
    // Extract names
    const homeName = (teams.home && teams.home.name) || payload.home_team || (typeof fx.home_team === 'string' ? fx.home_team : fx.home_team?.name) || '';
    const awayName = (teams.away && teams.away.name) || payload.away_team || (typeof fx.away_team === 'string' ? fx.away_team : fx.away_team?.name) || '';
    
    console.log(`Home Name: "${homeName}"`);
    console.log(`Away Name: "${awayName}"`);
    
    let h = 0, d = 0, a = 0;
    const normalizedSport = payload.sport || 'soccer'; // Default to soccer for this test

    if (payload.markets) {
        let h2hData = null;
        
        // Case A: markets is Array (RobustIntegration)
        if (Array.isArray(payload.markets)) {
            const m = payload.markets.find(m => m.key === 'h2h');
            if (m) {
                h2hData = m.selections || m.outcomes || null;
            }
        } 
        // Case B: markets is Object (Legacy/Intermediate)
        else if (payload.markets.h2h && Array.isArray(payload.markets.h2h)) {
            h2hData = payload.markets.h2h;
        }

        if (h2hData) {
             console.log("Found h2hData:", JSON.stringify(h2hData));
             
             // Heuristic for 2-way sports
             const isTwoWaySport = ['volleyball', 'tennis', 'handball', 'basketball', 'american-football', 'baseball', 'mma'].includes(normalizedSport);
             
             if (isTwoWaySport && h2hData.length === 2) {
                 console.log("Using 2-way logic");
                 // ... 2-way logic omitted for brevity as this is likely soccer ...
             } else {
                    console.log("Using Standard 3-way logic");
                    // Standard 3-way or strict matching
                    h2hData.forEach((o) => {
                        const val = String(o.outcome || o.name || o.label || o.id || '').toLowerCase();
                        // Fix: Prioritize price/odd over value to avoid NaN when value is a string label
                        const odd = Number(o.price || o.odd || (Number.isNaN(Number(o.value)) ? 0 : o.value) || 0);
                        
                        const hName = homeName.toLowerCase();
                        const aName = awayName.toLowerCase();
                
                        console.log(`Checking outcome: val="${val}", odd=${odd}`);

                        if (['1', 'home', 'casa'].includes(val) || val === hName) {
                            h = odd;
                            console.log("Matched HOME");
                        }
                        else if (['x', 'draw', 'empate'].includes(val)) {
                            d = odd;
                            console.log("Matched DRAW");
                        }
                        else if (['2', 'away', 'fora'].includes(val) || val === aName) {
                            a = odd;
                            console.log("Matched AWAY");
                        }
                    });
                }
                console.log(`[EventSync] Extracted odds: 1=${h}, X=${d}, 2=${a}`);
        } else {
            console.log("No h2hData found in markets.");
        }
    } else {
        console.log("No markets in payload.");
    }

} catch (e) {
    console.error("Error:", e);
}
