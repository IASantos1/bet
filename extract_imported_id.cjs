
const { execSync } = require('child_process');
const fs = require('fs');

try {
  // Execute wrangler d1 command and pipe output to a file
  const cmd = `npx wrangler d1 execute bet62-db --local --command "SELECT payload FROM imported_odds WHERE payload LIKE '%2026-02-25%' LIMIT 1" > temp_payload.txt`;
  
  // Set env vars for local wrangler
  const env = { ...process.env, WRANGLER_HOME: '.wrangler-local', USERPROFILE: '.wrangler-local', APPDATA: '.wrangler-local/AppData/Roaming' };
  
  execSync(cmd, { env, shell: 'powershell.exe' });
  
  const content = fs.readFileSync('temp_payload.txt', 'utf8');
  // Find JSON part (it might be wrapped in table format)
  // Wrangler output is table. But payload is JSON.
  // We can look for { "fixture": ... } or similar.
  
  const match = content.match(/\{.*\}/);
  if (match) {
      const jsonStr = match[0].replace(/""/g, '"'); // Fix escaped quotes if any
      // Actually Wrangler might truncate output.
      console.log('Found JSON-like content. Extracting ID...');
      
      // Try to find "id": 12345 pattern
      const idMatch = content.match(/"id":\s*(\d+)/);
      if (idMatch) {
          console.log(`Found ID: ${idMatch[1]}`);
          const dateMatch = content.match(/"date":\s*"([^"]+)"/);
          if (dateMatch) console.log(`Found Date: ${dateMatch[1]}`);
      } else {
          console.log('Could not find ID in payload.');
          console.log(content.substring(0, 500));
      }
  } else {
      console.log('Could not find JSON structure.');
      console.log(content.substring(0, 500));
  }

} catch (e) {
  console.error('Error:', e.message);
}
