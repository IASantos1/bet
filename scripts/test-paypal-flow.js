
import { SignJWT } from 'jose';

const JWT_SECRET = 'dev-jwt-secret-key-12345';
const API_URL = 'http://127.0.0.1:8787';

async function generateToken(userId) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({ sub: userId, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

async function testPayPalFlow() {
  console.log('🚀 Starting PayPal Flow Test...');
  
  // 1. Generate Token
  const userId = 'test-user-123'; // Dummy user ID
  const token = await generateToken(userId);
  console.log('🔑 Generated Test Token');

  // 2. Create Order
  console.log('\n👉 Creating Order (POST /api/deposits/paypal/create-order)...');
  try {
    const res = await fetch(`${API_URL}/api/deposits/paypal/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amount: 25.00 })
    });

    const text = await res.text();
    console.log(`Status: ${res.status}`);
    
    let data;
    try {
      data = JSON.parse(text);
      console.log('Response:', JSON.stringify(data, null, 2));
    } catch {
      console.log('Response (Text):', text);
    }

    if (res.ok && data?.orderId) {
      console.log('✅ Order Created Successfully!');
      return true;
    } else {
      console.error('❌ Order Creation Failed');
      return false;
    }
  } catch (e) {
    console.error('❌ Network Error:', e.message);
    return false;
  }
}

testPayPalFlow();
