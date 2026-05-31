
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8787/api/events';

async function checkEvents() {
  console.log('Checking events...');
  try {
    const response = await axios.get(API_URL);
    const events = response.data;
    console.log(`Found ${events.length} events.`);
    if (events.length > 0) {
      console.log('Sample event:', events[0].match);
    }
  } catch (error) {
    console.error('Check failed:', error.response ? error.response.data : error.message);
  }
}

checkEvents();
