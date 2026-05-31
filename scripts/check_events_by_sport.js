import axios from 'axios';

const API_URL = 'http://localhost:8787/api';

async function checkEventsBySport() {
    console.log('Checking /api/events/by-sport?sport=soccer ...');
    
    try {
        const url = `${API_URL}/events/by-sport?sports=soccer`;
        console.log(`Fetching: ${url}`);
        const response = await axios.get(url);
        
        console.log('Response Status:', response.status);
        
        if (response.data.live && response.data.live.length > 0) {
            console.log(`Found ${response.data.live.length} live events.`);
        } else {
            console.log('No live events.');
        }

        if (response.data.pregame && response.data.pregame.length > 0) {
             console.log(`Found ${response.data.pregame.length} pregame events.`);
             const soccerEvents = response.data.pregame.filter(e => e.league && (e.league.toLowerCase().includes('soccer') || e.sport === 'soccer' || e.fixture?.sport === 'soccer' || !e.sport)); // Some might not have sport explicit in root
             
             console.log(`Found ${soccerEvents.length} potential soccer events in pregame.`);
             
             if (soccerEvents.length > 0) {
                 console.log('Sample Soccer Event:', JSON.stringify(soccerEvents[0], null, 2));
             } else {
                 console.log('Sample Event (Non-Soccer?):', JSON.stringify(response.data.pregame[0], null, 2));
             }

        } else {
            console.log('No pregame events.');
        }

    } catch (error) {
        console.error('Request failed:', error.response ? error.response.data : error.message);
    }
}

checkEventsBySport();
