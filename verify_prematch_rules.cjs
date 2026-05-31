const { fetch } = require('undici');

async function run() {
    try {
        console.log('Fetching events from API...');
        const response = await fetch('http://localhost:8787/api/events/by-sport?sport=soccer');
        
        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
            return;
        }

        const data = await response.json();
        const events = data.events || [];
        console.log(`Current Time (Script): ${new Date().toISOString()}`);
        console.log(`Received ${events.length} events.`);

        const now = new Date();
        let violations = 0;
        let validPreMatch = 0;
        let liveEvents = 0;

        events.forEach(evt => {
            const isLive = evt.is_live === 1 || evt.status === 'LIVE' || ['1H', '2H', 'HT', 'ET', 'P'].includes(evt.status);
            
            if (isLive) {
                liveEvents++;
                return;
            }

            // Pre-match check
            const eventDate = new Date(evt.event_date || evt.start_time);
            const diffMs = eventDate.getTime() - now.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);

            const hasOdds = (evt.home_odd > 0 || (evt.markets && evt.markets.length > 0) || (evt.odds && Object.keys(evt.odds).length > 0));
            const marketStatus = evt.market_status || 'unknown';

            // Rule: Show only if <= 12 hours AND has odds AND market active
            // Note: The API *should* have already filtered these. So if we see any > 12h, it's a violation (unless there's a wider window allowed for some reason, but user said 12h).
            // Actually, wait. User said "Janela recomendada: Kickoff - 12 horas".
            // If the API returns events > 12h, I need to know why.
            
            // In src/worker/index.ts, I implemented the filter.
            // If the filter works, I should NOT see any event > 12h here.

            if (diffHours > 12) {
                console.error(`[VIOLATION] Event ${evt.id} (${evt.home_team} vs ${evt.away_team}) is > 12h away (${diffHours.toFixed(1)}h).`);
                violations++;
            } else if (!hasOdds) {
                console.error(`[VIOLATION] Event ${evt.id} (${evt.home_team} vs ${evt.away_team}) has NO ODDS.`);
                violations++;
            } else if (marketStatus !== 'active' && marketStatus !== 'available' && marketStatus !== 'unknown') { // unknown because sometimes it's missing in older data
                 console.error(`[VIOLATION] Event ${evt.id} (${evt.home_team} vs ${evt.away_team}) has inactive market status: ${marketStatus}`);
                 violations++;
            } else {
                validPreMatch++;
                // console.log(`[VALID] ${evt.home_team} vs ${evt.away_team} in ${diffHours.toFixed(1)}h. Odds: Yes.`);
            }
        });

        console.log('--- Summary ---');
        console.log(`Live Events: ${liveEvents}`);
        console.log(`Valid Pre-Match (<= 12h): ${validPreMatch}`);
        console.log(`Violations: ${violations}`);

        if (violations === 0) {
            console.log('SUCCESS: All pre-match rules respected.');
        } else {
            console.log('FAILURE: Some events violate the visibility rules.');
        }

    } catch (error) {
        console.error('Script error:', error);
    }
}

run();
