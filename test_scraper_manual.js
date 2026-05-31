
const API_BASES = [
  "https://22play88.com",
  "https://22bet.com",
  "https://22bet.ng",
  "https://22bet.com.gh",
  "https://22bet.co.tz",
  "https://22bet.co.ke",
  "https://megapari.com",
  "https://1xbet.com",
  "https://betwinner.com",
  "https://melbet.com",
  "https://1xlite-056452.top",
  "https://1xlite-333444.top",
  "https://22bet.lat",
  "https://22bet.mx",
];

const ENDPOINTS = [
  "/LiveFeed/Get1x2_VZip",
  "/LiveFeed/Get1x2",
  "/service-api/LiveFeed/Get1x2_VZip",
  "/service-api/LiveFeed/Get1x2",
  "/LiveFeed/Get1x2_Zip",
];

const SPORTS_MAP = {
  soccer: 1,
  basketball: 3,
  tennis: 4,
  'ice-hockey': 2,
  volleyball: 6,
  handball: 8,
  futsal: 9,
  'table-tennis': 10,
};

async function fetchLiveEvents(sport) {
    const sportId = SPORTS_MAP[sport.toLowerCase()] || 1;
    console.log(`[Test] Fetching live events for ${sport} (ID=${sportId})...`);

    for (const base of API_BASES) {
        // Try just the first few endpoints to save time
        for (const endpoint of ENDPOINTS.slice(0, 2)) {
            const url = `${base}${endpoint}?sports=${sportId}&count=50&mode=4&country=1&partner=152&getEmpty=true`;
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                
                const res = await fetch(url, { 
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept': 'application/json',
                        'Referer': base
                    }
                });
                clearTimeout(timeout);

                if (res.ok) {
                    const json = await res.json();
                    if (json && json.Value && Array.isArray(json.Value)) {
                        console.log(`[Success] Got ${json.Value.length} events from ${url}`);
                        // Print sample
                        if (json.Value.length > 0) {
                            const sample = json.Value[0];
                            console.log('Sample:', {
                                I: sample.I,
                                O1: sample.O1,
                                O2: sample.O2,
                                SC: sample.SC,
                                L: sample.L
                            });
                        }
                        return json.Value;
                    }
                }
            } catch (e) {
                // console.log(`Failed ${url}: ${e.message}`);
            }
        }
    }
    console.log(`[Fail] Could not fetch events for ${sport}`);
    return [];
}

async function run() {
    await fetchLiveEvents('soccer');
    await fetchLiveEvents('basketball');
    await fetchLiveEvents('tennis');
}

run();
