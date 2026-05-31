
async function run() {
    try {
        console.log("Calling Debug Matching...");
        const res = await fetch('http://127.0.0.1:8787/api/dev/debug-matching');
        const text = await res.text();
        
        try {
            const json = JSON.parse(text);
            console.log(`Matches found: ${json.matches.length}`);
    if (json.matches.length > 0) {
        console.log("Matched Events:");
        // Debug first match structure
        console.log("Sample Match Keys:", Object.keys(json.matches[0]));
        console.log("Sample Match:", JSON.stringify(json.matches[0], null, 2));
        
        json.matches.forEach(m => {
            console.log(`- ${m.home_team} vs ${m.away_team}`);
        });
    } else {
        console.log("No matches found.");
    }
    
    // console.log("Mismatches sample:", JSON.stringify(json.mismatches.slice(0, 5), null, 2));

  } catch (e) {
            console.log("Raw Response (Not JSON):", text);
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
