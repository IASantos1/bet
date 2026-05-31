
import http from 'http';

http.get('http://127.0.0.1:8787/api/events/by-sport?sport=soccer', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(`Total events: ${parsed.length}`);
      parsed.forEach(e => {
        console.log(`ID: ${e.id} | Live: ${e.is_live} | Status: ${e.status} | Home: ${e.home_team} vs Away: ${e.away_team}`);
      });
    } catch (e) {
      console.error(e.message);
      console.log(data);
    }
  });
}).on('error', (err) => {
  console.error('Error: ' + err.message);
});
