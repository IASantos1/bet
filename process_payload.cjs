const fs = require('fs');

try {
    const rawData = fs.readFileSync('payload.json', 'utf-8');
    // Simple JSON parse. The previous errors suggest something weird with the file content or encoding,
    // or maybe the way I'm reading it.
    // Let's try to just find the array and parse it.
    
    const jsonStart = rawData.indexOf('[');
    const jsonEnd = rawData.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('Could not parse JSON from payload.json');
    }
    
    let jsonStr = rawData.substring(jsonStart, jsonEnd + 1);
    
    // The error "Unexpected token '', "[    {"" suggests there might be some invisible characters or issues with newlines.
    // Let's clean it up more aggressively but carefully.
    // Actually, let's just use eval() as a last resort for local debugging if JSON.parse fails repeatedly
    // due to some weird formatting from wrangler output. 
    // Let's try to just remove all newlines and multiple spaces outside of strings... 
    // which is hard.
    
    // Let's try to parse it.
    let output;
    try {
        output = JSON.parse(jsonStr);
    } catch (e) {
        // Fallback: Use eval for local debugging (safe-ish here as we control input)
        // because JSON.parse is strict about newlines etc.
        try {
            // Use Function constructor to eval
            output = new Function('return ' + jsonStr)();
        } catch (e2) {
             console.log("Eval failed too.");
             
             // Last resort: Regex extraction
             const payloadMatch = rawData.match(/"payload"\s*:\s*"(.*?[^\\])"/s);
             if (payloadMatch && payloadMatch[1]) {
                 let pStr = payloadMatch[1];
                 try {
                    let payloadStrUnescaped = JSON.parse('"' + pStr + '"');
                    output = [{ results: [{ payload: payloadStrUnescaped }] }];
                 } catch (e3) {
                     throw e;
                 }
             } else {
                 throw e;
             }
        }
    }

    if (!output[0] || !output[0].results || output[0].results.length === 0) {
        console.error('No results found.');
        process.exit(1);
    }

    let payloadStr = output[0].results[0].payload;
    let payload;
    try {
        payload = JSON.parse(payloadStr);
    } catch (e) {
        console.log("Raw payload string:", payloadStr);
        throw e;
    }
    
    // Logic from eventSync.ts
    let h = 0, d = 0, a = 0;
    
    // 1. Try generic 'odds' object
    if (h === 0 && a === 0 && payload.odds && typeof payload.odds === 'object' && !Array.isArray(payload.odds)) {
        const marketKey = Object.keys(payload.odds).find(k => k.includes('winner') || k.includes('1x2') || k.includes('h2h'));
        if (marketKey && payload.odds[marketKey]) {
            let outcomes = null;
            const mData = payload.odds[marketKey];
            if (Array.isArray(mData)) {
                outcomes = mData;
            } else if (mData && Array.isArray(mData.outcomes)) {
                outcomes = mData.outcomes;
            }

            if (outcomes) {
                outcomes.forEach((o) => {
                    const val = String(o.outcome || o.name || '').toLowerCase().trim();
                    const odd = Number(o.value || o.price || o.odd || 0);
                    const homeName = (payload.home_team || '').toLowerCase().trim();
                    const awayName = (payload.away_team || '').toLowerCase().trim();

                    if (['1', 'home', 'casa', 'v1'].includes(val) || val === homeName) h = odd;
                    else if (['x', 'draw', 'tie', 'empate'].includes(val)) d = odd;
                    else if (['2', 'away', 'fora', 'v2', 'visitante'].includes(val) || val === awayName) a = odd;
                });
            }
        }
    }

    // 2. Fallback flattened odds (Legacy)
    if (h === 0 && a === 0 && (payload.home_odd || (payload.odds && payload.odds.home_odd))) {
        h = Number(payload.home_odd || (payload.odds && payload.odds.home_odd) || 0);
        d = Number(payload.draw_odd || (payload.odds && payload.odds.draw_odd) || 0);
        a = Number(payload.away_odd || (payload.odds && payload.odds.away_odd) || 0);
    }

    console.log(`Extracted: H=${h}, D=${d}, A=${a}`);
    
    if (h === 0 && a === 0) {
        console.error('Failed to extract odds.');
        process.exit(1);
    }

    const eventId = payload.id || (payload.fixture && payload.fixture.id) || null;
    if (!eventId) {
        console.error('Failed to extract event ID from payload.');
        process.exit(1);
    }

    const sql = `UPDATE events SET home_odd = ${h}, draw_odd = ${d}, away_odd = ${a}, updated_at = '${new Date().toISOString()}' WHERE external_event_id = '${eventId}'`;
    
    // Append to a cumulative SQL file or overwrite a single one?
    // Let's overwrite 'update_event_generic.sql' which the caller can execute.
    fs.writeFileSync('update_event_generic.sql', sql);
    console.log(`Generated SQL for event ${eventId}`);
    
    // Also generate the PS script for convenience of single-run
    const psScript = `$env:WRANGLER_HOME=".\\.wrangler_local"\nnpx wrangler d1 execute bet62-db --local --file "update_event_generic.sql"`;
    fs.writeFileSync('update_event.ps1', psScript);

} catch (e) {
    console.error(e);
    process.exit(1);
}
