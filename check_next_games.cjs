async function checkUpcoming() {
  const { fetch } = require('undici');
  try {
    const response = await fetch('http://localhost:8787/api/dev/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          SELECT id, event_date, home_team, away_team, status
          FROM events 
          WHERE event_date > ?
          ORDER BY event_date ASC
          LIMIT 10
        `,
        params: [new Date().toISOString()]
      })
    });
    const data = await response.json();
    console.log('Upcoming Events in DB:', JSON.stringify(data.results, null, 2));
    
    // Calculate hours to kickoff for the first one
    if (data.results && data.results.length > 0) {
        const first = data.results[0];
        const diff = (new Date(first.event_date) - new Date()) / (1000 * 60 * 60);
        console.log(`Hours to next game (${first.home_team} vs ${first.away_team}): ${diff.toFixed(2)}h`);
    }

  } catch (err) {
    console.error(err);
  }
}

checkUpcoming();