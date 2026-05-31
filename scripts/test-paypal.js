
// import fetch from 'node-fetch';

async function testPayPal() {
    console.log('1. Getting Token...');
    let token = '';
    
    try {
        const loginRes = await fetch('http://localhost:5177/api/auth/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'test@example.com', 
                password: 'password123'
            })
        });
        
        const loginData = await loginRes.json();
        if (!loginData.success) {
            console.error('Login failed:', loginData);
            return;
        }
        token = loginData.token;
        console.log('Token received.');

        console.log('2. Testing PayPal Create Order...');
        const paypalRes = await fetch('http://localhost:5177/api/deposits/paypal/create-order', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                amount: 20
            })
        });

        console.log(`Status: ${paypalRes.status}`);
        const text = await paypalRes.text();
        console.log(`Body: ${text}`);

    } catch (error) {
        console.error('Test error:', error);
    }
}

testPayPal();
