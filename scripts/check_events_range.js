
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8787/api/events-range';

async function checkEventsRange() {
    console.log('Checking /api/events-range...');
    
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    
    try {
        const url = `${API_URL}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        console.log(`Fetching: ${url}`);
        const response = await axios.get(url);
        console.log('Response Status:', response.status);
        console.log('Response Data Length:', Array.isArray(response.data) ? response.data.length : 'Not an array');
        if (Array.isArray(response.data) && response.data.length > 0) {
            console.log('Sample Event:', JSON.stringify(response.data[0], null, 2));
        } else {
            console.log('Response Data:', JSON.stringify(response.data, null, 2));
        }
    } catch (error) {
        console.error('Request failed:', error.response ? error.response.data : error.message);
    }
}

checkEventsRange();
