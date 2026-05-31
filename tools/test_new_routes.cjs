
const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:8787';

async function test() {
    console.log('Testing new API-Sports routes on Worker...');

    try {
        // 1. Fetch Fixtures (Live)
        console.log('\n--- 1. Fetch Fixtures (Live) ---');
        try {
            const res1 = await axios.get(`${BASE_URL}/api/internal/fetch-fixtures?sport=soccer&live=true`);
            console.log(`Status: ${res1.status}`);
            console.log(`Data (First 2):`, JSON.stringify(res1.data.slice(0, 2), null, 2));
            
            if (res1.data.length > 0) {
                const fixtureId = res1.data[0].fixture.id;
                console.log(`\nSelected Fixture ID for further tests: ${fixtureId}`);

                // 2. Fetch Statistics
                console.log('\n--- 2. Fetch Statistics ---');
                try {
                    const res2 = await axios.get(`${BASE_URL}/api/internal/fetch-statistics?sport=soccer&fixtureId=${fixtureId}`);
                    console.log(`Status: ${res2.status}`);
                    console.log(`Data:`, JSON.stringify(res2.data, null, 2));
                } catch (e) {
                    console.error('Stats Error:', e.response?.data || e.message);
                }

                // 3. Fetch Fixture Odds
                console.log('\n--- 3. Fetch Fixture Odds ---');
                try {
                    const res3 = await axios.get(`${BASE_URL}/api/internal/fetch-fixture-odds?sport=soccer&fixtureId=${fixtureId}`);
                    console.log(`Status: ${res3.status}`);
                    console.log(`Data:`, JSON.stringify(res3.data, null, 2));
                } catch (e) {
                    console.error('Odds Error:', e.response?.data || e.message);
                }
            } else {
                console.log('No live fixtures found to test stats/odds.');
            }

        } catch (e) {
            console.error('Fixtures Error:', e.response?.data || e.message);
        }

    } catch (e) {
        console.error('Global Error:', e.message);
    }
}

test();
