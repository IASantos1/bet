const { fetch } = require('undici');

async function triggerSync() {
    console.log('Triggering Sync...');
    try {
        // Trigger generic sync which should cover active leagues
        const response = await fetch('http://localhost:8787/api/dev/run-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true })
        });
        
        const data = await response.json();
        console.log('Sync Response:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error triggering sync:', err);
    }
}

triggerSync();
