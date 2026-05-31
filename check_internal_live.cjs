const http = require('http');

const url = 'http://127.0.0.1:8787/api/internal/events-db';

console.log(`Fetching internal DB from ${url}...`);

http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const events = JSON.parse(data);
      console.log(`Total Internal Events: ${events.length}`);
      
      const live = events.filter(e => {
        // Check various live indicators
        const isLiveFlag = e.is_live === 1 || e.is_live === true;
        const statusShort = e.fixture?.status?.short || e.status?.short;
        const isLiveStatus = ['1H', '2H', 'HT', 'ET', 'LIVE', 'IN_PLAY'].includes(statusShort);
        return isLiveFlag || isLiveStatus;
      });

      console.log(`Internal Live Events: ${live.length}`);
      
      if (live.length > 0) {
        console.log('Sample Live Event ID:', live[0].fixture?.id || live[0].id);
        console.log('Sample Live Event Status:', live[0].fixture?.status || live[0].status);
        console.log('Sample Live Event is_live:', live[0].is_live);
      } else {
        console.log('No live events found internally either.');
        // Show status distribution
        const statuses = {};
        events.forEach(e => {
            const s = e.fixture?.status?.short || e.status?.short || 'UNKNOWN';
            statuses[s] = (statuses[s] || 0) + 1;
        });
        console.log('Status Distribution:', statuses);
      }

    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
}).on('error', (err) => {
  console.error('Error fetching internal DB:', err.message);
});
