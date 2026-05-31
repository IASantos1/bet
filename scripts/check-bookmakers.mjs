
import https from 'https';

const API_KEY = 'cbef02a7c902f0dfb7260b0b638fffa0';

const sports = [
    { name: 'football', version: 'v3', endpoint: '/odds/bookmakers' },
    { name: 'basketball', version: 'v1', endpoint: '/bookmakers' }, // Try /bookmakers instead of /odds/bookmakers? Or maybe /odds/bookmakers is correct but empty?
    { name: 'baseball', version: 'v1', endpoint: '/odds/bookmakers' },
    { name: 'hockey', version: 'v1', endpoint: '/odds/bookmakers' },
    { name: 'rugby', version: 'v1', endpoint: '/odds/bookmakers' },
    { name: 'volleyball', version: 'v1', endpoint: '/odds/bookmakers' },
    { name: 'handball', version: 'v1', endpoint: '/odds/bookmakers' },
    { name: 'mma', version: 'v1', endpoint: '/odds/bookmakers' },
    { name: 'nfl', version: 'v1', endpoint: '/odds/bookmakers' }, // NFL might be under American Football? api-american-football?
    { name: 'formula-1', version: 'v1', endpoint: '/odds/bookmakers' }
];

async function fetchBookmakers(sportObj) {
    return new Promise((resolve) => {
        const hostname = sportObj.name === 'nfl' 
            ? 'v1.american-football.api-sports.io' 
            : `${sportObj.version}.${sportObj.name}.api-sports.io`;
            
        const options = {
            hostname,
            path: sportObj.endpoint,
            method: 'GET',
            headers: {
                'x-apisports-key': API_KEY
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ sport: sportObj.name, data: json.response, full: json });
                } catch (e) {
                    resolve({ sport: sportObj.name, error: e.message });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ sport: sportObj.name, error: e.message });
        });

        req.end();
    });
}

async function main() {
    console.log('Fetching bookmakers...');
    for (const s of sports) {
        try {
            const result = await fetchBookmakers(s);
            if (result.data && Array.isArray(result.data)) {
                console.log(`\n--- ${s.name.toUpperCase()} Bookmakers (${result.data.length}) ---`);
                // Find Bet365
                const bet365 = result.data.find(b => b.name.toLowerCase().includes('bet365'));
                if (bet365) {
                    console.log(`FOUND BET365! ID: ${bet365.id}, Name: ${bet365.name}`);
                } else {
                    console.log('Bet365 NOT FOUND. First 5:');
                    result.data.slice(0, 5).forEach(b => {
                        console.log(`ID: ${b.id}, Name: ${b.name}`);
                    });
                }
            } else {
                console.log(`\nError fetching ${s.name}:`, result.error || 'No data or invalid format');
                if (s.name === 'basketball') {
                     console.log('Basketball response:', JSON.stringify(result.full, null, 2));
                }
            }
        } catch (err) {
            console.error(err);
        }
    }
}

main();
