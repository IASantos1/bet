
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8787/api/dev';
const TOKEN = 'dev-admin-token'; // Assuming this is the token based on previous context, or I should check environment variables.
// In dev.ts: const isDev = c.env.DEV_MODE === 'true' ...
// Also: const token = c.req.header('X-Admin-Token');
// const isAdmin = token && token === c.env.ADMIN_TOKEN;

// I'll try to use the token if I can find it, otherwise rely on DEV_MODE=true if the server is running in dev mode.
// Since I'm running locally, likely DEV_MODE is enabled or I can use the default token.
// The user previously mentioned "dev-admin-token" in my thought process or I saw it in a previous turn?
// Ah, in the analysis, I saw: const TOKEN = 'dev-admin-token'; in scripts/debug_odds_api.js.
// So I'll use that.

const events = [
    {
        match: "Real Madrid vs Barcelona", // Required to pass validation (!evt.match)
        home_team: "Real Madrid",
        away_team: "Barcelona",
        league: "La Liga",
        start_time: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(20, 0, 0, 0)).toISOString(), // Fixed time: Tomorrow 20:00
        sport: "soccer",
        home_odd: 2.10,
        draw_odd: 3.50,
        away_odd: 3.20
    },
    {
        match: "Manchester City vs Liverpool",
        home_team: "Manchester City",
        away_team: "Liverpool",
        league: "Premier League",
        start_time: new Date(new Date().setHours(16, 0, 0, 0)).toISOString(), // Fixed time: Today 16:00 (Live if current time is > 16:00?)
        status: "LIVE",
        is_live: 1,
        sport: "soccer",
        home_odd: 1.95,
        draw_odd: 3.80,
        away_odd: 3.50
    },
    {
        match: "Lakers vs Warriors",
        home_team: "Lakers",
        away_team: "Warriors",
        league: "NBA",
        start_time: new Date(new Date().setHours(23, 0, 0, 0)).toISOString(), // Fixed time: Today 23:00
        sport: "basketball",
        home_odd: 1.80,
        away_odd: 2.05
    },
    {
        match: "Flamengo vs Vasco",
        home_team: "Flamengo",
        away_team: "Vasco",
        league: "Brasileirão",
        start_time: new Date(new Date().setHours(18, 0, 0, 0)).toISOString(), // Fixed time: Today 18:00
        sport: "soccer",
        home_odd: 1.60,
        draw_odd: 4.00,
        away_odd: 5.50
    },
    {
        match: "Benfica vs Porto",
        home_team: "Benfica",
        away_team: "Porto",
        league: "Primeira Liga",
        start_time: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(), // Tomorrow Same Time (careful, keep stable?)
        // Let's make it stable too: Tomorrow 21:00
        start_time: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(21, 0, 0, 0)).toISOString(),
        sport: "soccer",
        home_odd: 2.50,
        draw_odd: 3.10,
        away_odd: 2.80
    }
];

async function seedEvents() {
    console.log('Seeding events...');
    
    // 1. Bulk Import
    try {
        console.log(`Sending ${events.length} events to /import/spro/bulk...`);
        const response = await axios.post(`${API_URL}/import/spro/bulk`, events, {
            headers: {
                'X-Admin-Token': TOKEN,
                'Content-Type': 'application/json'
            }
        });
        console.log('Import Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Import Failed:', error.response ? error.response.data : error.message);
        return;
    }

    // 2. Trigger Sync
    try {
        console.log('Triggering Sync via /sync-internal...');
        const response = await axios.post(`${API_URL}/sync-internal`, {}, {
             headers: {
                'X-Admin-Token': TOKEN,
                'Content-Type': 'application/json'
            }
        });
        console.log('Sync Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
         console.error('Sync Failed:', error.response ? error.response.data : error.message);
    }
}

seedEvents();
