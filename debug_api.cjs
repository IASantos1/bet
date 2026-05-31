
const http = require('http');

console.log("Starting debug script...");

// Use the Worker port directly
const req = http.get('http://127.0.0.1:8787/api/sports/events', (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`Raw Data Preview: ${data.substring(0, 200)}`);
    try {
      const events = JSON.parse(data);
      console.log(`Total Events: ${events.length}`);
      
      const now = Date.now();
      console.log(`Current System Time: ${new Date(now).toISOString()} (${now})`);

      let validCount = 0;
      const reasons = {};
      const rejectedSamples = [];

      // Helper to check if event should be hidden
      const shouldHideEvent = (evt) => {
            const status = evt.fixture?.status?.short || evt.status || '';
            const finishedStatuses = ['FT', 'AET', 'PEN', 'Finished', 'Match Finished', 'AOT', 'AP', 'Ended', 'Final', 'WO', 'ABD', 'AWD'];
            
            const dstr = evt.event_date || evt.fixture?.date;
            const d = dstr ? new Date(dstr) : null;
            
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

      events.forEach(evt => {
          const reason = shouldHideEvent(evt);
          if (reason) {
              if (!reasons[reason]) reasons[reason] = 0;
              reasons[reason]++;
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

    } catch (e) {
      console.error(e.message);
    }
  });

});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});
