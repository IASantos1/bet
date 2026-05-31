const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/football/odds/upcoming',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) { // upcoming returns array directly? or { response: ... }?
         // Check index.ts line 3510: sendJson(res, 200, result); -> result is array
         console.log(`Recebidos ${parsed.length} jogos.`);
         
         // Check for specific games
         const targets = ['Sporting', 'Pachuca', 'Constantine', 'Belouizdad'];
         targets.forEach(t => {
             const found = parsed.find(g => 
                 (g.homeTeam && g.homeTeam.includes(t)) || 
                 (g.awayTeam && g.awayTeam.includes(t))
             );
             if (found) {
                 console.log(`[ENCONTRADO] ${found.homeTeam} x ${found.awayTeam} | Odds: ${JSON.stringify(found.odds)}`);
             } else {
                 console.log(`[AUSENTE] ${t}`);
             }
         });
      } else if (parsed.response) {
         console.log(`Recebidos ${parsed.response.length} jogos (wrapper).`);
      } else {
         console.log("Resposta inesperada:", parsed);
      }
    } catch (e) {
      console.error(e);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
