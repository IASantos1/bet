const http = require('http');

const urls = [
    'http://127.0.0.1:8788/api/internal/events-db'
];

function checkUrl(url) {
    return new Promise((resolve) => {
        console.log(`Checking ${url}...`);
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`[${url}] Status: ${res.statusCode} | Count: ${Array.isArray(json) ? json.length : 'Not Array'}`);
                            if (Array.isArray(json) && json.length > 0) {
                                console.log('Sample Event:', JSON.stringify(json[0], null, 2));
                                console.log('--- Date Check ---');
                                console.log(`Current System Time: ${new Date().toISOString()}`);
                                json.slice(0, 5).forEach(e => {
                                    const lastUp = e.last_updated || e.last_update || 'N/A';
                                    console.log(`ID: ${e.external_event_id} | Date: ${e.event_date} | Updated: ${lastUp} | Live: ${e.is_live}`);
                                });
                            }
                            resolve(true);
                } catch (e) {
                    console.log(`[${url}] Error parsing JSON: ${e.message}`);
                    resolve(false);
                }
            });
        });
        req.on('error', (e) => {
            console.log(`[${url}] Connection failed: ${e.message}`);
            resolve(false);
        });
        req.setTimeout(3000, () => {
            console.log(`[${url}] Timeout`);
            req.abort();
            resolve(false);
        });
    });
}

async function run() {
    for (const url of urls) {
        await checkUrl(url);
    }
}

run();
