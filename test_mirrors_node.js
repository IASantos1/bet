
const fetch = global.fetch;

const MIRRORS = [
    "https://22bet.com",
    "https://22bet.ng",
    "https://1xbet.com",
    "https://br.1xbet.com",
    "https://22play88.com"
];

// Some endpoints found in various reverse engineering docs
const ENDPOINTS = [
    "/LiveFeed/Get1x2_VZip",
    "/LiveFeed/Get1x2",
    "/service-api/LiveFeed/Get1x2_VZip",
    "/service-api/LiveFeed/Get1x2"
];

const PARAMS = new URLSearchParams({
    sports: '1', // Soccer
    count: '5',
    mode: '4',
    country: '1',
    partner: '151',
    getEmpty: 'true',
    noFilterBlockEvent: 'true',
    lng: 'en'
});

async function testMirrors() {
    console.log("Starting verbose mirror test...");

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

    for (const base of MIRRORS) {
        console.log(`\n--- Testing Base: ${base} ---`);
        
        // 1. Visit Home to get Cookies
        let cookieHeader = '';
        try {
            console.log(`[GET] ${base}/`);
            const homeRes = await fetch(base + '/', {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                },
                redirect: 'follow'
            });
            console.log(`  Status: ${homeRes.status}`);
            
            // Extract cookies
            const setCookie = homeRes.headers.get('set-cookie');
            if (setCookie) {
                // Basic parsing - join all cookies
                cookieHeader = setCookie.split(',')
                    .map(c => c.split(';')[0].trim())
                    .join('; ');
                console.log(`  Cookies acquired: ${cookieHeader.substring(0, 50)}...`);
            } else {
                console.log(`  No Set-Cookie header found.`);
            }

        } catch (e) {
            console.log(`  Home Connection Failed: ${e.message}`);
            continue; // Skip if main site is unreachable
        }

        // 2. Test Endpoints
        for (const endpoint of ENDPOINTS) {
            const url = `${base}${endpoint}?${PARAMS.toString()}`;
            console.log(`  [GET] ${url}`);

            try {
                const res = await fetch(url, {
                    headers: {
                        'User-Agent': userAgent,
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': `${base}/live/football`,
                        'Origin': base,
                        'X-Requested-With': 'XMLHttpRequest',
                        'Cookie': cookieHeader
                    }
                });

                console.log(`    Status: ${res.status}`);
                console.log(`    Type: ${res.headers.get('content-type')}`);
                
                if (res.status === 406) {
                    console.log(`    !!! 406 Not Acceptable. Server Headers:`);
                    res.headers.forEach((v, k) => console.log(`      ${k}: ${v}`));
                }

                if (res.ok) {
                    const text = await res.text();
                    console.log(`    Body Preview: ${text.substring(0, 100)}`);
                    if (text.startsWith('{')) {
                         console.log(`    >>> POSSIBLE SUCCESS!`);
                    }
                } else {
                    // Try to read error body if possible
                    try {
                        const errText = await res.text();
                        console.log(`    Error Body: ${errText.substring(0, 100)}`);
                    } catch (e) {}
                }

            } catch (e) {
                console.log(`    Req Failed: ${e.message}`);
            }
        }
    }
}

testMirrors();
