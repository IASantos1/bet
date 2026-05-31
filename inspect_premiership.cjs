const { fetch } = require('undici');

async function run() {
  try {
    console.log('Fetching Premiership events from /api/dev/check-premiership...');
    const response = await fetch('http://127.0.0.1:8787/api/dev/check-premiership');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Found ${data.count} Premiership/Scotland events.`);

    if (data.events && data.events.length > 0) {
      // Pick one to analyze
      const event = data.events[0];
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
      
      // Analyze structure
      console.log('\n--- Structure Check ---');
      console.log('1. Root ID:', payload.id);
      console.log('2. Fixture ID:', payload.fixture?.id);
      console.log('3. Teams Object:', payload.teams);
      console.log('4. Home Team:', payload.home_team);
      console.log('5. Markets:', Array.isArray(payload.markets) ? `Array[${payload.markets.length}]` : typeof payload.markets);
    } else {
      console.log('No events found.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

run();
