
async function run() {
    try {
        console.log("Fetching Imported Odds List...");
        const res = await fetch('http://127.0.0.1:8787/api/dev/list-odds?limit=1000');
        const data = await res.json();
        
        console.log(`Count: ${data.count}`);
                    
                    if (data.events.length > 0) {
                        console.log("First Event Keys:", Object.keys(data.events[0]));
                        console.log("First Event Sport:", data.events[0].sport);
                         
                         // Search for Premiership or Scotland
                         const premiershipEvents = data.events.filter(e => {
                             const pStr = JSON.stringify(e).toLowerCase();
                             return pStr.includes('premiership') || pStr.includes('scotland');
                         });
                         
                         console.log(`Premiership/Scotland Events Found: ${premiershipEvents.length}`);
                         
                         if (premiershipEvents.length > 0) {
                             const e = premiershipEvents[0];
                             console.log("Premiership Event Sample:", JSON.stringify(e, null, 2));
                             // Try to parse payload
                             try {
                                 const p = JSON.parse(e.payload);
                                 console.log("Payload ID:", p.fixture?.id || p.id);
                                 console.log("Payload League:", p.league?.name || p.league_obj?.name);
                                 console.log("Payload Country:", p.league?.country || p.league_obj?.country || p.country);
                                 console.log("Payload League Obj:", JSON.stringify(p.league_obj || {}));
                             } catch(err) {
                                 console.log("Payload parse error:", err.message);
                             }
                         }
                         
                         const soccerEvents = data.events.filter(e => e.sport === 'soccer' || e.sport_key === 'soccer');
                        console.log(`Soccer Events Found: ${soccerEvents.length}`);
                        // ... rest of code
                         
                         if (soccerEvents.length > 0) {
                             const e = soccerEvents[0];
                             console.log("Soccer Event Sample:", JSON.stringify(e, null, 2));
                             // Try to parse payload
                             try {
                                 const p = JSON.parse(e.payload);
                                 console.log("Soccer Payload ID:", p.fixture?.id || p.id);
                                 console.log("Soccer Payload League:", p.league?.name || p.league_obj?.name);
                                 console.log("Soccer Payload Country:", p.league?.country || p.league_obj?.country || p.country);
                             } catch(err) {
                                 console.log("Payload parse error:", err.message);
                             }
                         }
                    }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
