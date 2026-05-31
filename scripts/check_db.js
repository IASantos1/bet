
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8787/api/debug/db-status';
const TOKEN = 'dev-admin-token';

async function checkDb() {
  console.log('Checking DB status...');
  try {
    const response = await axios.get(API_URL, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    console.log('DB Status:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Check failed:', error.response ? error.response.data : error.message);
  }
}

checkDb();
