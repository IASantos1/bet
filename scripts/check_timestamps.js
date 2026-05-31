
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8787/api/debug/db-status';
const TOKEN = 'dev-admin-token';

async function checkTimestamps() {
  console.log('Checking timestamps...');
  try {
    const response = await axios.get(API_URL, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    const samples = response.data.samples;
    console.log('Samples:', JSON.stringify(samples, null, 2));
    
    // Also check server time vs samples
    console.log('Server Time:', response.data.server_time);
    
  } catch (error) {
    console.error('Check failed:', error.response ? error.response.data : error.message);
  }
}

checkTimestamps();
