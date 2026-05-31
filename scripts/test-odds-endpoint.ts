import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = envContent.split('\n').reduce((acc, line) => {
  const [key, value] = line.split('=');
  if (key && value) acc[key.trim()] = value.trim().replace(/^"|"$/g, '');
  return acc;
}, {} as Record<string, string>);

const API_KEY = envVars.ODDS_API_KEY || envVars.VITE_ODDS_API_KEY;
const BASE_URL = 'https://api.odds-api.io/v3';

async function testOddsEndpoint() {
  if (!API_KEY) {
    console.error('❌ API Key not found');
    return;
  }

  console.log('🧪 Testing /v3/odds with sport=football...');
  
  try {
    const url = `${BASE_URL}/odds`;
    const response = await axios.get(url, {
      params: {
        apiKey: API_KEY,
        sport: 'football', // Trying bulk fetch
        limit: 2 // Limit to 2 to see structure
      },
      validateStatus: () => true
    });

    console.log(`📊 Status: ${response.status}`);
    
    if (response.status === 200) {
      const data = response.data;
      if (Array.isArray(data)) {
        console.log(`✅ Received array of ${data.length} events/odds.`);
        if (data.length > 0) {
          console.log('📝 Sample Item:');
          console.log(JSON.stringify(data[0], null, 2));
        }
      } else {
        console.log('✅ Received object.');
        console.log(JSON.stringify(data, null, 2));
      }
    } else {
      console.log('❌ Failed.');
      console.log(response.data);
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testOddsEndpoint();