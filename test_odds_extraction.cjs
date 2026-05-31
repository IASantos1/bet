const fs = require('fs');

// Read payload from file
const rawContent = fs.readFileSync('./payload_22bet.txt', 'utf8');
// Extract the JSON part (it's wrapped in SQL result array)
// The file has a lot of noise from wrangler output.
// We need to find the first '[' and last ']' that form valid JSON.

// Let's manually parse the JSON part we saw earlier
const payloadStr = `{"id":"22bet_698449049","sport":"table-tennis","league_name":"Russia Team Championship. Women","league":"Russia Team Championship. Women","home_team":"Valeria Shcherbatyh","away_team":"Yana Zhukova","event_date":"2026-02-24T14:00:00.000Z","is_live":1,"status":"LIVE","goals":{"home":2,"away":1},"score":"{\\"home\\":2,\\"away\\":1}","elapsed":0,"fixture":{"id":"22bet_698449049","status":{"short":"LIVE","long":"Em andamento","elapsed":0}},"odds":{"h2h":[{"outcome":"1","value":1.355,"odd":1.355},{"outcome":"2","value":3.06,"odd":3.06}]},"home_odd":1.355,"draw_odd":0,"away_odd":3.06,"source":"22bet"}`;

const payload = JSON.parse(payloadStr);

console.log('Testing extraction logic on payload:', JSON.stringify(payload, null, 2));

let h = 0, d = 0, a = 0;
const homeName = payload.home_team || '';
const awayName = payload.away_team || '';

// --- LOGIC FROM eventSync.ts (simplified for Node.js test) ---

// 1. Try generic 'odds' object (e.g. from scraping)
if (h === 0 && a === 0 && payload.odds && typeof payload.odds === 'object' && !Array.isArray(payload.odds)) {
    console.log('Step 1: Checking generic odds object...');
    const marketKey = Object.keys(payload.odds).find(k => k.includes('winner') || k.includes('1x2') || k.includes('h2h'));
    
    if (marketKey && payload.odds[marketKey]) {
        console.log(`Found market key: ${marketKey}`);
        // FIX: Handle both array directly OR .outcomes property
        let outcomes = null;
        const mData = payload.odds[marketKey];
        
        if (Array.isArray(mData)) {
            console.log('Market data is an Array!');
            outcomes = mData;
        } else if (mData && Array.isArray(mData.outcomes)) {
            console.log('Market data has .outcomes property!');
            outcomes = mData.outcomes;
        }

        if (outcomes) {
            console.log('Outcomes found:', outcomes);
            outcomes.forEach((o) => {
                const val = String(o.outcome || o.name || '').toLowerCase();
                const odd = Number(o.value || o.price || 0);
                
                if (['1', 'home', 'casa', 'v1'].includes(val) || val === homeName.toLowerCase()) h = odd;
                else if (['x', 'draw', 'tie', 'empate'].includes(val)) d = odd;
                else if (['2', 'away', 'fora', 'v2', 'visitante'].includes(val) || val === awayName.toLowerCase()) a = odd;
            });
        }
    }
}

// 2. Fallback flattened odds (Legacy)
// Note: Changed from 'else if' to 'if' in the fix
if (h === 0 && a === 0 && (payload.home_odd || (payload.odds && payload.odds.home_odd))) {
    console.log('Step 2: Checking legacy flat odds...');
    const pAny = payload;
    h = Number(pAny.home_odd || (pAny.odds && pAny.odds.home_odd) || 0);
    d = Number(pAny.draw_odd || (pAny.odds && pAny.odds.draw_odd) || 0);
    a = Number(pAny.away_odd || (pAny.odds && pAny.odds.away_odd) || 0);
}

console.log('---------------------------------------------------');
console.log(`Extracted Odds: Home=${h}, Draw=${d}, Away=${a}`);

if (h > 0 || a > 0) {
    console.log('SUCCESS: Odds extracted!');
} else {
    console.log('FAILURE: No odds extracted.');
}
