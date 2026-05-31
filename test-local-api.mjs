import http from 'http';

function fetch(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    console.log('Fetching live football fixtures...');
    const res = await fetch('/football/fixtures/live');
    console.log('Status:', res.status);
    if (res.json && res.json.response) {
      const fixtures = res.json.response;
      console.log(`Found ${fixtures.length} live fixtures.`);
      
      const withOdds = fixtures.filter(f => f.odds);
      console.log(`${withOdds.length} fixtures have odds.`);
      
      if (withOdds.length > 0) {
        console.log('Sample odds:', JSON.stringify(withOdds[0].odds, null, 2));
      } else if (fixtures.length > 0) {
        console.log('Sample fixture without odds:', JSON.stringify(fixtures[0], null, 2));
      }
    } else {
      console.log('No response or invalid format', res);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

run();
