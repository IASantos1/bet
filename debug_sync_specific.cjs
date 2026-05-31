
// const { isLeagueAllowed, isSportKeyAllowed } = require('./src/worker/config/allowedLeagues.ts'); 

const ALLOWED_LEAGUES = [
  'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
  'Primeira Liga', 'Eredivisie', 'Brasileirão Série A', 'Brasileirão Série B',
  'UEFA Champions League', 'UEFA Europa League', 'Copa Libertadores', 'Copa Sudamericana',
  'Championship', 'League One', 'League Two',
  'Premiership', 'Scottish Premiership', 
  'Elite 1', 'Premier 15s',
  'UFC', 'NBA', 'NFL', 'NHL', 'MLB'
];

function isLeagueAllowed(leagueName, country) {
    if (!leagueName) return false;
    const norm = leagueName.toLowerCase();
    
    // Check allowlist
    const allowed = ALLOWED_LEAGUES.some(l => norm.includes(l.toLowerCase()));
    if (allowed) return true;

    // Check country whitelist for specific countries
    const ALLOWED_COUNTRIES = ['England', 'Spain', 'Italy', 'Germany', 'France', 'Portugal', 'Netherlands', 'Brazil', 'Scotland'];
    if (country && ALLOWED_COUNTRIES.includes(country)) return true;

    return false;
}

async function run() {
    try {
        console.log("Fetching Premiership Event...");
        const res = await fetch('http://127.0.0.1:8787/api/dev/check-premiership');
        const data = await res.json();
        
        if (!data.events || data.events.length === 0) {
            console.log("No events found.");
            return;
        }

        const e = data.events[0];
        const payload = JSON.parse(e.payload);
        
        console.log("--- Payload Analysis ---");
        console.log(`ID: ${e.id}`);
        console.log(`Payload Keys: ${Object.keys(payload).join(', ')}`);
        
        // --- REPLICATE normalizePayload LOGIC ---
        const fx = payload.fixture || {};
        const league = payload.league || payload.league_obj || {};
        const teams = payload.teams || { home: {}, away: {} }; 
        
        const externalId = String(fx.id || payload.fixture_id || payload.id || '');
        console.log(`Extracted ID: ${externalId}`);
        
        const homeName = teams.home?.name || payload.home_team || '';
        const awayName = teams.away?.name || payload.away_team || '';
        console.log(`Home: ${homeName}, Away: ${awayName}`);
        
        const rawLeagueName = league.name || payload.league_name || '';
        console.log(`League Name: ${rawLeagueName}`);
        
        const countryName = league.country || payload.country || '';
        console.log(`Country: ${countryName}`);
        
        const sportKey = payload.sport_key;
        console.log(`Sport Key: ${sportKey}`);

        // --- REPLICATE WHITELIST CHECK ---
        let isAllowed = false;
        
        if (sportKey && (sportKey === 'soccer' || sportKey === 'basketball' || sportKey === 'mma_mixed_martial_arts')) { 
             // In real code: isSportKeyAllowed(sportKey)
             // For soccer, we check league.
             if (sportKey !== 'soccer') isAllowed = true;
        }
        
        if (!isAllowed) {
            isAllowed = isLeagueAllowed(rawLeagueName, countryName);
            console.log(`Allowed by League/Country? ${isAllowed}`);
        }
        
        if (isAllowed) {
            console.log("RESULT: Event WOULD be synced.");
        } else {
            console.log("RESULT: Event WOULD BE DROPPED.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
