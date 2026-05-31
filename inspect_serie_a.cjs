
async function inspectSerieA() {
  try {
    console.log('Querying events for Parma, Udinese, Flamengo...');
    
    const query = `
      SELECT id, sport, league, home_team, away_team, event_date, home_odd, draw_odd, away_odd, markets, market_status, is_live 
              FROM events 
              WHERE 
        home_team LIKE '%Parma%' OR 
        home_team LIKE '%Udinese%' OR 
        home_team LIKE '%Flamengo%' OR 
        home_team LIKE '%Remo%' OR
        home_team LIKE '%Santos%' OR
        league LIKE '%Serie A%'
      LIMIT 20
    `;

    const res = await fetch('http://127.0.0.1:8787/api/dev/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    
    if (!res.ok) {
        console.error('Error fetching:', res.status, res.statusText);
        const txt = await res.text();
        console.error(txt);
        return;
    }

    const json = await res.json();
    if (json.results) {
        json.results.forEach(evt => {
            console.log(`[${evt.id}] ${evt.league} | ${evt.home_team} vs ${evt.away_team} | Date: ${evt.event_date}`);
                    console.log(`   Status: ${evt.market_status} | Live: ${evt.is_live}`);
                    console.log(`   Odds: ${evt.home_odd}/${evt.draw_odd}/${evt.away_odd}`);
            console.log(`   Markets: ${evt.markets ? evt.markets.substring(0, 100) + '...' : 'NULL'}`);
            console.log('---');
        });
    } else {
        console.log("No results");
    }

  } catch (e) {
    console.error(e);
  }
}

inspectSerieA();
