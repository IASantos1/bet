const fs = require('fs');

// Mock Payload based on the dump
const payloadObj = {
  id: "soccer_1499169",
  fixture_id: "soccer_1499169",
  sport: "soccer",
  league_name: "Liga Nacional",
  home_team: "Cob├ín Imperial", // Keeping the weird encoding from dump to test robustness
  away_team: "Malacateco",
  event_date: "2026-02-24T21:00:00+00:00",
  status: { long: "Halftime", short: "HT", elapsed: 45, extra: 3 },
  markets: [
    {
      key: "h2h",
      outcomes: [
        { name: "Home", price: 1.57, point: "Home", value: "Home", label: "Home" },
        { name: "Draw", price: 4.2, point: "Draw", value: "Draw", label: "Draw" },
        { name: "Away", price: 8.14, point: "Away", value: "Away", label: "Away" }
      ]
    },
    {
        key: "h2h",
        outcomes: [
            { name: "Home", price: 1.24, point: "Home", value: "Home", label: "Home" },
            { name: "Away", price: 5.25, point: "Away", value: "Away", label: "Away" }
        ]
    }
  ]
};

console.log("Using Mock Payload");

// Mocking the normalizePayload logic from EventSyncService
function normalizePayload(payload) {
    const fx = payload.fixture || {};
    const teams = payload.teams || { home: {}, away: {} };
    
    // Extract names
    const homeName = teams.home?.name || payload.home_team || (typeof fx.home_team === 'string' ? fx.home_team : fx.home_team?.name) || '';
    const awayName = teams.away?.name || payload.away_team || (typeof fx.away_team === 'string' ? fx.away_team : fx.away_team?.name) || '';
    
    console.log(`Home: "${homeName}", Away: "${awayName}"`);
    
    let h = 0, d = 0, a = 0;
    
    // Logic from EventSyncService
    if (payload.markets) {
        let h2hData = null;
        
        // Case A: markets is Array (RobustIntegration)
        if (Array.isArray(payload.markets)) {
            const m = payload.markets.find(m => m.key === 'h2h');
            if (m) {
                h2hData = m.selections || m.outcomes || null;
                console.log("Found h2h market:", JSON.stringify(m, null, 2));
            } else {
                console.log("h2h market NOT found in array");
            }
        } else {
             console.log("payload.markets is NOT an array");
        }
        
        if (h2hData) {
             console.log("Processing h2hData:", JSON.stringify(h2hData, null, 2));
             
             h2hData.forEach(o => {
                 const val = String(o.outcome || o.name || o.label || o.id || '').toLowerCase();
                 // Fix: Prioritize price/odd over value, because value might be a label (e.g. "Home")
                 // Also ensure we pick a numeric value
                 let rawOdd = o.price ?? o.odd ?? o.value;
                 
                 // If rawOdd is a string that is not numeric, and we picked it from 'value', try 'price' or 'odd' if we missed them?
                 // Actually, checking explicit fields first is safer.
                 // In this payload: price=1.57, value="Home".
                 // So we MUST check price first.
                 
                 const odd = Number(o.price || o.odd || (Number.isNaN(Number(o.value)) ? 0 : o.value) || 0);
                 
                 console.log(`Checking outcome: val="${val}", odd=${odd}`);
                 
                 const hName = homeName.toLowerCase();
                 const aName = awayName.toLowerCase();

                 // Match logic
                 if (['1', 'home', 'casa'].includes(val) || val === hName || hName.includes(val)) {
                     h = odd;
                     console.log("Matched HOME");
                 }
                 else if (['x', 'draw', 'empate'].includes(val)) {
                     d = odd;
                     console.log("Matched DRAW");
                 }
                 else if (['2', 'away', 'fora'].includes(val) || val === aName || aName.includes(val)) {
                     a = odd;
                     console.log("Matched AWAY");
                 }
             });
        }
    }
    
    console.log(`Final Odds: 1=${h}, X=${d}, 2=${a}`);
    return { h, d, a };
}

normalizePayload(payloadObj);
