
const axios = require('axios');

async function test() {
    try {
        const response = await axios.get('http://localhost:3000/api/sports/events');
        const events = response.data;
        console.log(`Total Events: ${events.length}`);
        
        const now = Date.now();
        console.log(`Current System Time: ${new Date(now).toISOString()} (${now})`);

        let validCount = 0;
        const reasons = {};

        // Helper to check if event should be hidden (Logic copied from useSportsEvents.ts)
        const shouldHideEvent = (evt) => {
            const status = evt.fixture?.status?.short || evt.status || '';
            const finishedStatuses = ['FT', 'AET', 'PEN', 'Finished', 'Match Finished', 'AOT', 'AP', 'Ended', 'Final', 'WO', 'ABD', 'AWD'];
            
            const dstr = evt.event_date || evt.fixture?.date;
            const d = dstr ? new Date(dstr) : null;
            
            // Log first 3 events to debug dates
            if (Math.random() < 0.05) { // Sample 5%
                 // console.log(`Sample: ${evt.fixture?.name || evt.name} | Date: ${dstr} | Status: ${status} | IsLive: ${evt.is_live}`);
            }

            if (finishedStatuses.includes(status)) {
                if (d && !Number.isNaN(d.getTime())) {
                    if (now > d.getTime() + 3 * 60 * 60 * 1000) return 'Finished > 3h';
                } else {
                    return 'Finished No Date';
                }
            }
            
            const isLive = Number(evt.is_live || 0) === 1 || ['1H','2H','HT','ET','P','LIVE'].includes(status);
            if (isLive) {
                if (d && !Number.isNaN(d.getTime()) && d.getTime() < now - 5 * 60 * 60 * 1000) {
                    return 'Live > 5h';
                }
                return false; // Keep live
            }
            
            if (d && !Number.isNaN(d.getTime())) {
                 if (d.getTime() < now - 12 * 60 * 60 * 1000) return 'Global > 12h';
                 // Pre-game past event check
                 if (!isLive && d.getTime() < now - 2.5 * 60 * 60 * 1000) {
                     const diffHours = (now - d.getTime()) / (1000 * 60 * 60);
                     return `Pregame > 2.5h (Diff: ${diffHours.toFixed(2)}h) [${dstr}]`;
                 }
            }
            
            const hasOddsObject = evt.odds && Object.keys(evt.odds).length > 0;
            const hasFlatOdds = Number(evt.home_odd) > 0 || Number(evt.away_odd) > 0;
            if (!hasOddsObject && !hasFlatOdds) return 'No Odds';
            
            return false;
        };

        const rejectedSamples = [];

        events.forEach(evt => {
            const reason = shouldHideEvent(evt);
            if (reason) {
                if (!reasons[reason]) reasons[reason] = 0;
                reasons[reason]++;
                
                // Collect detailed samples for the most common rejection reason
                if (rejectedSamples.length < 5) {
                    rejectedSamples.push({
                        name: evt.fixture?.name || evt.name,
                        date: evt.event_date || evt.fixture?.date,
                        reason: reason,
                        status: evt.fixture?.status?.short || evt.status
                    });
                }
            } else {
                validCount++;
            }
        });

        console.log(`Valid Events: ${validCount}`);
        console.log('Rejection Reasons:', JSON.stringify(reasons, null, 2));
        console.log('Rejected Samples:', JSON.stringify(rejectedSamples, null, 2));

    } catch (error) {
        console.error('Error fetching events:', error.message);
    }
}

test();
