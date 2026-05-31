const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function runQuery() {
  const dbPath = path.resolve(__dirname, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/86273418e2440317e335552955f26939634280f55097f53a6c9d968b6c039d93.sqlite');
  
  // Use sqlite3 command line if available, or just use the d1 tool via wrangler?
  // Actually, we can use the `worker` script logic but simpler.
  // Or just use `wrangler d1 execute`?
  // Let's use `wrangler d1 execute` as it is reliable.
  
  const cmd = `npx wrangler d1 execute DB --local --command "SELECT id, payload FROM imported_odds WHERE updated_at > datetime('now', '-1 hour') LIMIT 5" --json`;
  
  console.log('Executing:', cmd);
  
  const child = spawn('cmd.exe', ['/c', cmd], {
    cwd: process.cwd(),
    env: process.env
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => stdout += data.toString());
  child.stderr.on('data', (data) => stderr += data.toString());

  child.on('close', (code) => {
    if (code !== 0) {
      console.error('Error:', stderr);
      return;
    }
    
    try {
        // Find the JSON array in the output
        const jsonStart = stdout.indexOf('[');
        const jsonEnd = stdout.lastIndexOf(']');
        if (jsonStart === -1 || jsonEnd === -1) {
            console.log("No JSON found in output:", stdout);
            return;
        }
        
        const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
        const rows = JSON.parse(jsonStr);
        
        rows.forEach(row => {
            try {
                const payload = JSON.parse(row.payload);
                console.log(`\nID: ${row.id}`);
                console.log(`Payload Keys: ${Object.keys(payload).join(', ')}`);
                console.log(`league:`, payload.league);
                console.log(`league_name:`, payload.league_name);
                console.log(`fixture.league_name:`, payload.fixture?.league_name);
                console.log(`Is league_name object?`, typeof payload.league_name === 'object');
            } catch (e) {
                console.error(`Failed to parse payload for ${row.id}:`, e.message);
            }
        });
    } catch (e) {
        console.error('Failed to parse output:', e.message);
        console.log('Raw output:', stdout);
    }
  });
}

runQuery();
