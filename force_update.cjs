const http = require('http');

async function callEndpoint(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: 8787,
            path: path,
            method: 'GET',
            headers: {
                'User-Agent': 'Node/DebugScript'
            }
        };

        console.log(`Calling ${path}...`);
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`Response Status: ${res.statusCode}`);
                try {
                    const json = JSON.parse(data);
                    // Summarize to avoid flooding terminal
                    if (json.results) console.log(`Results count: ${json.results.length}`);
                    else if (Array.isArray(json)) console.log(`Array length: ${json.length}`);
                    else console.log('Response:', JSON.stringify(json).substring(0, 200) + '...');
                } catch (e) {
                    console.log('Response body:', data.substring(0, 200));
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`Error calling ${path}:`, e.message);
            resolve(); // Resolve anyway to continue chain
        });

        req.end();
    });
}

async function run() {
    console.log('Starting Force Update Sequence...');
    console.log('Target: 127.0.0.1:8787');

    // 1. Trigger Robust Integration (Fetches from API-Sports)
    await callEndpoint('/api/debug/run-robust-integration');

    console.log('Waiting 5 seconds for DB operations...');
    await new Promise(r => setTimeout(r, 5000));

    // 2. Trigger Event Sync (Imported -> Events Table)
    await callEndpoint('/api/debug/sync-events');

    console.log('Force Update Sequence Complete.');
}

run();
