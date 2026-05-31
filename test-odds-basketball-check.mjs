import https from 'https';

const API_KEY = 'cbef02a7c902f0dfb7260b0b638fffa0';

function fetch(sport, version, endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const hostname = `${version}.${sport}.api-sports.io`;
    const url = `https://${hostname}/${endpoint}`;
    console.log(`Fetching: ${url}`);
    
    const options = {
      method: 'GET',
      headers: {
        'x-apisports-key': API_KEY
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ version, status: res.statusCode, json });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => resolve({ version, error: err.message }));
    req.end();
  });
}

async function run() {
  try {
    const res = await fetch('basketball', 'v1', 'status');
    console.log(`basketball v1:`, res.status, res.error || (res.json.response ? 'OK' : 'No response'));
  } catch (e) {
    console.log(`basketball v1 failed:`, e.message);
  }
}

run();
