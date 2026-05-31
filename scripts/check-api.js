// Native fetch is available in Node.js 18+
const WORKER_URL = 'https://redesigned-octo-train.bet62.workers.dev';

async function checkApi() {
  console.log('🔍 Checking API Health and Events...');
  console.log(`📍 Target URL: ${WORKER_URL}`);

  try {
    // 1. Check Events Endpoint
    console.log('\n👉 Fetching /api/events...');
    const t0 = Date.now();
    const res = await fetch(`${WORKER_URL}/api/events`);
    const t1 = Date.now();
    
    if (res.ok) {
        const data = await res.json();
        console.log(`✅ Status: ${res.status} OK (${t1 - t0}ms)`);
        if (Array.isArray(data)) {
            console.log(`📊 Events Found: ${data.length}`);
            if (data.length > 0) {
                console.log('📝 Sample Event:', JSON.stringify(data[0].match, null, 2));
            } else {
                console.warn('⚠️ No events returned (List is empty). Check Cron/DB.');
            }
        } else {
            console.error('❌ Unexpected response format:', data);
        }
    } else {
        console.error(`❌ Request failed: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.error('Response:', text);
    }

    // 2. Check By-Sport Endpoint (Default View)
    console.log('\n👉 Fetching /api/events/by-sport (Default soccer)...');
    const t2 = Date.now();
    const res2 = await fetch(`${WORKER_URL}/api/events/by-sport?sport=soccer`);
    const t3 = Date.now();
    
    if (res2.ok) {
        const data2 = await res2.json();
        console.log(`✅ Status: ${res2.status} OK (${t3 - t2}ms)`);
        if (Array.isArray(data2)) {
             console.log(`📊 Sport Events Found: ${data2.length}`);
             if (data2.length > 0) {
                console.log('📅 First Event Date:', data2[0].date || data2[0].event_date);
                console.log('⚽ First Event:', data2[0].match);
             }
        }
    } else {
        console.error(`❌ By-Sport Request failed: ${res2.status}`);
    }

  } catch (error) {
    console.error('❌ Network Error:', error.message);
    console.log('💡 Tip: Check if the Worker is deployed and "redesigned-octo-train.bet62.workers.dev" is correct.');
  }
}

checkApi();
