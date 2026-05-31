
const http = require('http');

const PORT = 4000;

function fetchUrl(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: 'GET',
    };

    console.log(`Fetching: http://localhost:${PORT}${path}`);

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data, error: e.message });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}

async function check() {
  console.log('--- Debugging Upcoming Fixtures (Retry) ---');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Simula a URL exata do frontend
    const path = `/sports/api-football-proxy?sport=football&endpoint=fixtures&from=${today}&to=${nextWeek}`;
    
    const res = await fetchUrl(path);
    console.log(`Status: ${res.status}`);
    
    if (res.data) {
       if (Array.isArray(res.data)) {
           console.log(`Response is Array. Length: ${res.data.length}`);
       } else if (res.data.response && Array.isArray(res.data.response)) {
           console.log(`Response has .response Array. Length: ${res.data.response.length}`);
           if (res.data.response.length === 0) {
               console.log('WARN: Response array is empty!');
           }
       } else {
           console.log('Response structure unexpected:', Object.keys(res.data));
       }
    } else {
       console.log('No data or parse error:', res.error || res.raw);
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();
