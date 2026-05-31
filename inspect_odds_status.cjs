const { fetch } = require('undici');

async function checkOddsStatus() {
    try {
        console.log('Fetching events from worker...');
        // Use the debug endpoint to execute a raw SQL query
        const response = await fetch('http://localhost:8787/api/dev/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    SELECT 
                        id, 
                        home_team, 
                        away_team, 
                        status, 
                        is_live, 
                        market_status, 
                        LENGTH(markets) as markets_len, 
                        home_odd,
                        event_date
                    FROM events 
                    WHERE sport = 'soccer' 
                    AND event_date >= datetime('now')
                    AND event_date <= datetime('now', '+24 hours')
                    ORDER BY event_date ASC
                    LIMIT 20
                `
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Query Result:', JSON.stringify(data, null, 2));

    } catch (error) {
        console.error('Error:', error);
    }
}

checkOddsStatus();
