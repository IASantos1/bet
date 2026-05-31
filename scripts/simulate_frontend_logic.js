
import axios from 'axios';

const API_URL = 'http://localhost:8787/api';

async function simulateFrontend() {
    console.log('Simulating Frontend Logic...');
    
    // 1. Fetch Data
    let data = [];
    try {
        const response = await axios.get(`${API_URL}/events/by-sport?sports=soccer`);
        data = response.data;
        console.log(`Fetched ${data.length} events.`);
    } catch (error) {
        console.error('Fetch failed:', error.message);
        return;
    }

    // 2. Logic from useSportsEvents.ts
    const category = 'soccer-all'; // Default
    let leagueFilter = '';
    
    // (Simplified category parsing matching useSportsEvents)
    if (category && category !== 'all') {
        const token = category.toLowerCase();
        if (token.includes('|')) {
            const parts = token.split('|');
            leagueFilter = parts[2].toLowerCase().replace(/\s+/g, '-');
        }
    }
    
    console.log(`League Filter: "${leagueFilter}"`);

    // Normalization
    const normalizedEvents = [];
    
    data.forEach((rawEvt) => {
         const evt = { ...rawEvt };
         
         if (!evt.id && evt.fixture?.id) evt.id = evt.fixture.id;
         
         if (!evt.home_team && evt.home) evt.home_team = evt.home;
         if (!evt.away_team && evt.away) evt.away_team = evt.away;
         if (!evt.home_team && evt.teams?.home?.name) evt.home_team = evt.teams.home.name;
         if (!evt.away_team && evt.teams?.away?.name) evt.away_team = evt.teams.away.name;
         if (!evt.home_team && evt.fixture?.home_team) {
             evt.home_team = typeof evt.fixture.home_team === 'string' ? evt.fixture.home_team : evt.fixture.home_team.name;
         }
         if (!evt.away_team && evt.fixture?.away_team) {
             evt.away_team = typeof evt.fixture.away_team === 'string' ? evt.fixture.away_team : evt.fixture.away_team.name;
         }
         
         if (evt.league && typeof evt.league === 'object' && evt.league.name) {
             evt.league = evt.league.name;
         }
         if (!evt.league && evt.fixture?.league_name) evt.league = evt.fixture.league_name;

         if (evt.sport && typeof evt.sport === 'object' && evt.sport.name) {
             evt.sport = evt.sport.name;
         }

         if (!evt.event_date && evt.date) evt.event_date = evt.date;
         if (!evt.event_date && evt.fixture?.date) evt.event_date = evt.fixture.date;

         // Odds mapping omitted for brevity, focusing on event existence

         normalizedEvents.push(evt);
    });

    console.log(`Normalized ${normalizedEvents.length} events.`);

    // Filtering
    const filteredEvents = leagueFilter 
        ? normalizedEvents.filter(evt => {
            const l = (evt.league || '').toLowerCase().replace(/\s+/g, '-');
            return l === leagueFilter || l.includes(leagueFilter) || leagueFilter.includes(l);
        })
        : normalizedEvents;

    console.log(`Filtered ${filteredEvents.length} events.`);

    const liveEvents = []; 
    const pregameEvents = []; 

    filteredEvents.forEach((evt) => { 
        let isLive = false;
        
        if (Number(evt.is_live) === 1) isLive = true;
        
        const status = evt.fixture?.status?.short || evt.status;
        if (['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(status)) {
            isLive = true;
        }

        if (isLive) {
            liveEvents.push(evt);
        } else {
            if (!['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(status)) {
                pregameEvents.push(evt);
            } else {
                console.log(`Event ${evt.id} filtered out due to status: ${status}`);
            }
        }
    });

    console.log(`Live: ${liveEvents.length}, Pregame: ${pregameEvents.length}`);
    
    if (pregameEvents.length > 0) {
        console.log('First Pregame Event:', JSON.stringify(pregameEvents[0], null, 2));
    }
}

simulateFrontend();
