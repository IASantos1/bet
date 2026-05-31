const { fetch } = require('undici');

async function checkApi() {
  console.log('🔍 Checking API Response for Visibility Rules & Odds...');
  const API_URL = 'http://127.0.0.1:8787/api/events/by-sport?sport=soccer';

  try {
    const res = await fetch(API_URL);
    if (!res.ok) {
        console.error(`❌ Request failed: ${res.status}`);
        return;
    }

    const data = await res.json();
    
    // Check Pre-Match Visibility Rule (Kickoff - 12h)
    const pregame = data.pregame || [];
    const live = data.live || [];
    const now = new Date();
    
    console.log(`📊 Found ${live.length} LIVE events and ${pregame.length} PREGAME events.`);

    let violationCount = 0;
    let validCount = 0;

    pregame.forEach(evt => {
        const eventDate = new Date(evt.event_date);
        const hoursUntilKickoff = (eventDate - now) / (1000 * 60 * 60);
        
        if (hoursUntilKickoff > 12.1) { // 12.1 to allow slight buffer
            console.warn(`⚠️ VIOLATION: Event ${evt.team_match} starts in ${hoursUntilKickoff.toFixed(1)}h (Should be hidden)`);
            violationCount++;
        } else {
            validCount++;
        }

        // Check Odds Structure
        if (!evt.odds || (!Array.isArray(evt.odds) && !evt.odds.length && Object.keys(evt.odds).length === 0)) {
             console.warn(`⚠️ MISSING ODDS: Event ${evt.team_match} has no odds.`);
        }
    });

    if (violationCount === 0) {
        console.log(`✅ VISIBILITY RULE PASSED: All ${validCount} pre-match events are within 12h window.`);
    } else {
        console.error(`❌ VISIBILITY RULE FAILED: ${violationCount} events outside window.`);
    }

    // Check Brasileirão specifically
    const brasilEvents = [...live, ...pregame].filter(e => 
        (e.league || '').toLowerCase().includes('brasil') || 
        (e.league || '').toLowerCase().includes('série a')
    );

    console.log(`\n🇧🇷 Found ${brasilEvents.length} Brazil-related events.`);
    brasilEvents.forEach(e => {
        const hasMarkets = e.odds && (Array.isArray(e.odds) ? e.odds.length > 0 : Object.keys(e.odds).length > 0);
        console.log(`   - ${e.team_match} (${e.league}) | Odds Available: ${hasMarkets ? '✅' : '❌'} | Live: ${e.is_live}`);
        if (hasMarkets) {
             // Inspect first market structure
             const markets = Array.isArray(e.odds) ? e.odds : (e.odds.markets || []);
             const h2h = Array.isArray(markets) ? markets.find(m => m.key === 'h2h') : markets['h2h'];
             if (h2h) {
                 console.log(`     -> Market H2H found with ${h2h.selections ? h2h.selections.length : (h2h.outcomes ? h2h.outcomes.length : 'unknown')} selections.`);
             } else {
                 console.log(`     -> Markets exist but H2H not found/structured differently.`);
                 console.log(`     -> Raw Odds keys: ${Object.keys(e.odds)}`);
             }
        }
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkApi();
