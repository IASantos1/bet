
// const fetch = require('node-fetch'); // Native fetch in Node 18+

(async () => {
    try {
        console.log('Fetching ALL events from worker...');
        // Remove status=live to fetch everything
        const res = await fetch('http://127.0.0.1:8787/api/internal/events-db');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const events = await res.json();
        console.log(`Total events: ${events.length}`);

        const soccerEvents = events;

        console.log(`Soccer/All events checked: ${soccerEvents.length}`);

        // Find Newcastle vs Man City
        const targetGame = soccerEvents.find(e => {
            const h = (e.teams?.home?.name || e.home_team || '').toLowerCase();
            const a = (e.teams?.away?.name || e.away_team || '').toLowerCase();
            // Broader search
            return (h.includes('city') && h.includes('man')) || h.includes('newcastle') ||
                   (a.includes('city') && a.includes('man')) || a.includes('newcastle');
        });

        if (targetGame) {
            console.log('FOUND TARGET GAME:');
            console.log(JSON.stringify(targetGame, null, 2));
            console.log('--- Payload Debug ---');
            if (targetGame.payload) {
                 try {
                     const p = JSON.parse(targetGame.payload);
                     console.log('Parsed Payload League:', p.league);
                     console.log('Parsed Payload League Name:', p.league_name);
                     console.log(JSON.stringify(p, null, 2));
                 } catch (e) {
                     console.log('Payload is not JSON:', targetGame.payload);
                 }
            } else {
                console.log('No payload field found on event object.');
            }
        } else {
            console.log('Target game NOT found in HTTP API response.');
            // Dump all events to see if we missed it
            const fs = require('fs');
            fs.writeFileSync('debug_dump_all.json', JSON.stringify(events, null, 2));
            console.log('Dumped all events to debug_dump_all.json');
        }

    } catch (e) {
        console.error('Error:', e);
    }
})();
