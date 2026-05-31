
// import fetch from 'node-fetch'; // Native fetch in Node 18+

async function testLogin() {
    console.log('Testing login...');
    try {
        const response = await fetch('http://127.0.0.1:8787/api/auth/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'test@example.com', 
                password: 'password123'
            })
        });

        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(`Body: ${text}`);

        if (response.status === 500) {
            console.error('CRITICAL: 500 Internal Server Error detected');
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

testLogin();
