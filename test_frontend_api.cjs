
// const fetch = require('node-fetch');

async function testFrontendApi() {
    try {
        console.log('Fetching /api/events/by-sport?sport=soccer...');
        const res = await fetch('http://127.0.0.1:8787/api/events/by-sport?sport=soccer');
        const json = await res.json();
        
        console.log('Received JSON type:', typeof json);
        console.log('JSON keys:', Object.keys(json));
        console.log('Live count:', json.live?.length);
        console.log('Pregame count:', json.pregame?.length);

        if (json.mode === 'raw') {
            console.log('RAW MODE ENABLED (Unexpected)');
            return;
        }
        
        let events = [];
        if (Array.isArray(json)) {
            events = json;
        } else if (json.live || json.pregame) {
            events = [...(json.live || []), ...(json.pregame || [])];
        } else {
            console.log('Unknown response structure:', Object.keys(json));
            return;
        }
        
        console.log(`Received ${events.length} events total (Live: ${json.live?.length || 0}, Pregame: ${json.pregame?.length || 0}).`);
        
        // Analyze leagues
        const leagues = {};
        const emptyNames = [];
        const missingOdds = [];
        
        events.forEach(e => {
            // Check league
            const leagueName = e.league?.name || e.league || 'Unknown';
            leagues[leagueName] = (leagues[leagueName] || 0) + 1;
            
            // Check names
            const hName = e.home?.name || e.home_team?.name || e.home_team || '';
            const aName = e.away?.name || e.away_team?.name || e.away_team || '';
            
            if (!hName || !aName || hName === 'undefined' || aName === 'undefined') {
                emptyNames.push(e);
            }
            
            // Check odds
            const hOdd = parseFloat(e.odds?.home || e.home_odd || 0);
            const dOdd = parseFloat(e.odds?.draw || e.draw_odd || 0);
            const aOdd = parseFloat(e.odds?.away || e.away_odd || 0);
            
            const hasOdds = hOdd > 0 || dOdd > 0 || aOdd > 0;
            if (!hasOdds) {
                missingOdds.push({ ...e, _odds: { h: hOdd, d: dOdd, a: aOdd } });
            }
        });
        
        console.log('\n--- Event List (First 10) ---');
        events.slice(0, 10).forEach(e => {
             const statusShort = e.status?.short || e.status || '??';
             console.log(`[${e.id}] ${e.league?.name || e.league} | ${e.home_team?.name || e.home_team} vs ${e.away_team?.name || e.away_team} | Date: ${e.event_date || e.date} | Status: ${statusShort} | Odds: 1(${e.odds?.home || e.home_odd}) X(${e.odds?.draw || e.draw_odd}) 2(${e.odds?.away || e.away_odd})`);
             if (statusShort.toString().toUpperCase().includes('OBJECT')) {
                 console.log('DEBUG STATUS OBJ:', JSON.stringify(e.status));
             }
        });

        console.log('\n--- League Distribution ---');
        Object.keys(leagues).sort().forEach(l => {
            console.log(`${l}: ${leagues[l]}`);
        });
        
        console.log('\n--- Empty Names Check ---');
        if (emptyNames.length > 0) {
            console.log(`Found ${emptyNames.length} events with empty names:`);
            emptyNames.slice(0, 5).forEach(e => console.log(`  [${e.id}] League: ${e.league.name}`));
        } else {
            console.log('No events with empty names found.');
        }
        
        console.log('\n--- Missing Odds Check ---');
        if (missingOdds.length > 0) {
            console.log(`Found ${missingOdds.length} events with missing odds (0.00):`);
            missingOdds.slice(0, 5).forEach(e => console.log(`  [${e.id}] ${e.home_team.name} vs ${e.away_team.name}`));
        } else {
            console.log('All events have at least one non-zero odd.');
        }

        // Sample event dump
        if (json.length > 0) {
            console.log('\n--- Sample Event Dump ---');
            const sample = json[0];
            console.log(JSON.stringify({
                id: sample.id,
                teams: `${sample.home_team.name} vs ${sample.away_team.name}`,
                odds: {
                    home: sample.home_odd,
                    draw: sample.draw_odd,
                    away: sample.away_odd
                },
                league: sample.league.name,
                is_live: sample.is_live
            }, null, 2));
        }
        
    } catch (e) {
        console.error('Error fetching API:', e);
    }
}

testFrontendApi();
