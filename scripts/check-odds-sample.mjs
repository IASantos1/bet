
import https from 'https';

const API_KEY = 'cbef02a7c902f0dfb7260b0b638fffa0';

const sports = [
    { name: 'basketball', version: 'v1' }
];

async function fetchOdds(sport, version) {
    return new Promise((resolve) => {
        const options = {
            hostname: `${version}.${sport}.api-sports.io`,
            path: '/games?live=all', // Try games live
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
                    resolve({ sport, data: json.response, errors: json.errors });
                } catch (e) {
                    resolve({ sport, error: e.message });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ sport, error: e.message });
        });

        req.end();
    });
}

async function main() {
    console.log('Fetching basketball games...');
    for (const s of sports) {
        try {
            const result = await fetchOdds(s.name, s.version);
            if (result.data && Array.isArray(result.data) && result.data.length > 0) {
                console.log(`\n--- ${s.name.toUpperCase()} Games Sample ---`);
                const item = result.data[0];
                console.log('Sample item structure keys:', Object.keys(item));
                
                // Check if odds are present in the game object
                if (item.odds) {
                     console.log('Odds found in game object!');
                } else {
                    console.log('No odds found in game object');
                }
            } else {
                console.log(`\nError fetching ${s.name} games:`, result.errors || 'No data');
            }
        } catch (err) {
            console.error(err);
        }
    }
}

main();
