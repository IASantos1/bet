const { fetch } = require('undici');

async function run() {
    try {
        console.log('Triggering Sync for Soccer...');
        // Note: The worker must be running on port 8787
        const response = await fetch('http://localhost:8787/api/dev/run-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sport: 'soccer' })
        });
        
        const text = await response.text();
        console.log('Response:', text);

    } catch (error) {
        console.error('Error triggering sync:', error);
    }
}

run();
