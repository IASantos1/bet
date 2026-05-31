
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8787/api/dev/force-import';
const TOKEN = 'dev-admin-token';

async function triggerSync() {
  console.log('Triggering force-import...');
  try {
    const response = await axios.post(API_URL, {}, {
      headers: {
        'X-Admin-Token': TOKEN,
        'Content-Type': 'application/json'
      }
    });
    console.log('Sync successful:', response.data);
  } catch (error) {
    console.error('Sync failed:', error.response ? error.response.data : error.message);
  }
}

triggerSync();
