
const http = require('http');

const url = 'http://127.0.0.1:8787/api/events/by-sport?sport=soccer';

http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('--- LIVE EVENTS ---');
      if (json.live && Array.isArray(json.live)) {
        json.live.slice(0, 3).forEach(e => console.log(e.fixture.date));
      } else {
        console.log('No live events or invalid format');
      }
      
      console.log('--- PREGAME EVENTS ---');
      if (json.pregame && Array.isArray(json.pregame)) {
        json.pregame.slice(0, 3).forEach(e => console.log(e.fixture.date));
      } else {
        console.log('No pregame events or invalid format');
      }
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
}).on('error', (err) => {
  console.error('Error fetching:', err.message);
});
