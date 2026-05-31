
async function check() {
  try {
    const url = 'http://localhost:8787/api/events/by-sport?sports=soccer&include=odds';
    console.log('Fetching:', url);
    const res = await fetch(url);
    const data = await res.json();
    
    console.log('Live count:', data.live ? data.live.length : 0);
    console.log('Pregame count:', data.pregame ? data.pregame.length : 0);
    
    if (data.pregame && data.pregame.length > 0) {
        console.log('First pre-game event full JSON:');
        console.log(JSON.stringify(data.pregame[0], null, 2));
    } else {
        console.log('No pre-game events found.');
    }

    if (data.live && data.live.length > 0) {
            console.log('First live event sample (for comparison):');
            console.log(JSON.stringify(data.live[0], null, 2));
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

check();
