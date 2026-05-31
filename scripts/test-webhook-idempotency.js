

const WEBHOOK_URL = 'http://127.0.0.1:8787/api/webhooks/ifthenpay';
const SETUP_URL = 'http://127.0.0.1:8787/api/dev/create-test-deposit';
const ADMIN_TOKEN = 'dev-admin-token';

const REFERENCE = `TEST-${Date.now()}`;
const AMOUNT = 50.00;

async function run() {
  console.log(`\n🧪 IDEMPOTENCY TEST: IfThenPay Webhook`);
  console.log(`   Reference: ${REFERENCE}`);
  console.log(`   Amount: €${AMOUNT}`);

  // 1. Setup: Create Pending Deposit
  console.log("\n1️⃣  Setting up: Creating PENDING deposit via Dev API...");
  try {
    const resSetup = await fetch(SETUP_URL, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-Admin-Token': ADMIN_TOKEN 
        },
        body: JSON.stringify({ reference: REFERENCE, amount: AMOUNT })
    });
    
    if (resSetup.status !== 200) {
        console.error(`❌ Setup Failed: ${resSetup.status} - ${await resSetup.text()}`);
        return;
    }
    console.log("✅ Deposit created successfully.");
  } catch (e) {
      console.error(`❌ Setup Error: Is the server running? (npm run worker)`);
      console.error(e.message);
      return;
  }

  const payload = {
    referencia: REFERENCE,
    estado: 'SUCESSO',
    valor: AMOUNT
  };

  // 2. First Webhook Call
  console.log("\n2️⃣  Sending FIRST Webhook (Should succeed)...");
  try {
    const res1 = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text1 = await res1.text();
    console.log(`   Status: ${res1.status}`);
    console.log(`   Response: ${text1}`);
    
    if (res1.status === 200 && text1.includes('"status":"ok"')) {
        console.log("✅ First call processed successfully.");
    } else {
        console.warn("⚠️  First call might have failed or been ignored.");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }

  // 3. Second Webhook Call
  console.log("\n3️⃣  Sending SECOND Webhook (Should be IGNORED)...");
  try {
    const res2 = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text2 = await res2.text();
    console.log(`   Status: ${res2.status}`);
    console.log(`   Response: ${text2}`);
    
    if (text2.includes('Duplicate ignored')) {
        console.log("\n🎉 SUCCESS: Idempotency Verified! Duplicate was ignored.");
    } else if (text2.includes('Already paid')) {
        console.log("\n⚠️  PARTIAL SUCCESS: It said 'Already paid' (Check logic if this is intended behavior vs 'Duplicate ignored').");
        console.log("   If logic checks 'payment_events' first, it should say 'Duplicate ignored'.");
        console.log("   If it checks deposit status first, it might say 'Already paid'.");
        console.log("   Current Logic in payments.ts: Checks payment_events FIRST.");
    } else {
        console.log("\n❌ FAILED: Did not receive expected 'Duplicate ignored' message.");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

run();
