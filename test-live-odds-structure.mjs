
import https from 'https';

const API_KEY = 'cbef02a7c902f0dfb7260b0b638fffa0';

function checkLiveOddsStructure() {
    const options = {
        hostname: 'v3.football.api-sports.io',
        path: '/odds/live',
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
                if (json.response && json.response.length > 0) {
                    console.log('Sample item structure:', JSON.stringify(json.response[0], null, 2));
                } else {
                    console.log('No live odds currently available.');
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

checkLiveOddsStructure();
