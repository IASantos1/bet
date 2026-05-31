
import https from 'https';

const API_KEY = 'cbef02a7c902f0dfb7260b0b638fffa0'; // Using the key I found in other files

function checkLiveOddsWithBookmaker() {
    const options = {
        hostname: 'v3.football.api-sports.io',
        path: '/odds/live?bookmaker=8', // Try with Bet365
        method: 'GET',
        headers: {
            'x-apisports-key': API_KEY
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log('Status:', res.statusCode);
            try {
                const json = JSON.parse(data);
                console.log('Errors:', json.errors);
                console.log('Results:', json.results);
                if (json.response && json.response.length > 0) {
                    console.log('Sample item keys:', Object.keys(json.response[0]));
                }
            } catch (e) {
                console.log('Error parsing JSON:', e.message);
            }
        });
    });

    req.on('error', (e) => {
        console.error('Request error:', e.message);
    });

    req.end();
}

checkLiveOddsWithBookmaker();
