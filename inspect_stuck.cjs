const { fetch } = require('undici');

async function inspectStuckGames() {
    try {
        const response = await fetch('http://localhost:8787/api/dev/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    SELECT 
                        id, 
                        home_team, 
                        away_team, 
                        league,
                        status, 
                        is_live, 
                        event_date,
                        datetime('now') as db_now,
                        (julianday(event_date) - julianday('now')) * 24 as hours_diff
                    FROM events 
                    WHERE home_team LIKE '%Getafe%' 
                       OR home_team LIKE '%Volendam%'
                       OR away_team LIKE '%Celta%'
                `
            })
        });
        
        const data = await response.json();
        console.log('Stuck Games:', JSON.stringify(data, null, 2));

    } catch (err) {
        console.error('Error:', err);
    }
}

inspectStuckGames();
