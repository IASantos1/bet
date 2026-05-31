import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Env vars are loaded via --env-file=.env
const API_KEY = process.env.API_FOOTBALL_KEY || process.env.VITE_API_FOOTBALL_KEY;

if (!API_KEY) {
  console.error('API Key not found in process.env. Run with node --env-file=.env scripts/find_specific_bookmakers.mjs');
  process.exit(1);
}

const HEADERS = {
  'x-apisports-key': API_KEY,
};

const SPORTS = {
  football: 'https://v3.football.api-sports.io',
  basketball: 'https://v1.basketball.api-sports.io',
  baseball: 'https://v1.baseball.api-sports.io',
  hockey: 'https://v1.hockey.api-sports.io',
};

async function findBookmakerId(sport, bookmakerName) {
  const url = `${SPORTS[sport]}/odds/bookmakers`;
  try {
    console.log(`Searching for ${bookmakerName} in ${sport}...`);
    const response = await fetch(url, { headers: HEADERS });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !Array.isArray(data.response)) {
        console.log(`No response for ${sport}`);
        return null;
    }

    const bookmakers = data.response;
    const found = bookmakers.find(b => b.name.toLowerCase().includes(bookmakerName.toLowerCase()));
    
    if (found) {
        console.log(`FOUND ${bookmakerName} in ${sport}: ID ${found.id}, Name: ${found.name}`);
        return found;
    } else {
        console.log(`NOT FOUND ${bookmakerName} in ${sport}`);
        // List first 5 to check
        console.log(`Available: ${bookmakers.slice(0, 5).map(b => `${b.id}:${b.name}`).join(', ')}`);
        return null;
    }
  } catch (error) {
    console.error(`Error fetching ${sport}: ${error.message}`);
    return null;
  }
}

async function run() {
  console.log('--- FINDING BOOKMAKER IDS ---');
  
  // Football - 1xBet
  // await findBookmakerId('football', '1xBet');
  
  // Hockey - 1xBet
  // await findBookmakerId('hockey', '1xBet');
  
  // Baseball - Bet365
  // await findBookmakerId('baseball', 'Bet365');

  // Basketball - Check Bet365
  await findBookmakerId('basketball', 'Bet365');
}

run();
