const { fetch } = require('undici');

async function run() {
  try {
    // Fetch a single raw payload from the dev endpoint I created earlier, or just query DB directly if I could.
    // Since I can't query DB directly easily without D1 bindings in this script context (unless I use the worker),
    // I'll use the /list-odds endpoint which returns raw payloads.
    
    console.log('Fetching raw payloads from /api/dev/list-odds...');
    const response = await fetch('http://127.0.0.1:8787/api/dev/list-odds?limit=1&sport=soccer');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const event = data.results[0];
      console.log('--- Database Row ---');
      console.log('ID:', event.id);
      console.log('League:', event.league_name);
      
      console.log('\n--- Raw Payload JSON ---');
      let payload = event.payload;
      if (typeof payload === 'string') {
          try {
              payload = JSON.parse(payload);
          } catch (e) {
              console.log('(Payload is string but failed to parse JSON)');
          }
      }
      console.log(JSON.stringify(payload, null, 2));
      
      console.log('\n--- Key Analysis ---');
      console.log('Has .id?', !!payload.id);
      console.log('Has .fixture_id?', !!payload.fixture_id);
      console.log('Has .fixture.id?', !!(payload.fixture && payload.fixture.id));
    } else {
      console.log('No events found in imported_odds.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

run();
