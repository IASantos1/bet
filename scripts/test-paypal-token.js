
async function testPayPalToken() {
    const clientId = "AVH5-CoY-PDfHQV46wcKn4ZlcItmmjfjINXKs3Gonfn6pDvr5_DqsB6TkMHiFSe-uEMkfAgoJ2BNAd3V";
    const clientSecret = "ELJOA5SlAqJvfRSCzayL99dUuT17aDgYDb7DyLixDP9e_NAq-QoH8W9Uh_bmhHXbWVKb74AIAbOnZvuY";
    
    // Try Sandbox first
    let baseUrl = 'https://api-m.sandbox.paypal.com';
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    console.log('Testing PayPal Token (Sandbox)...');
    
    try {
        let response = await fetch(`${baseUrl}/v1/oauth2/token`, {
            method: 'POST',
            body: 'grant_type=client_credentials',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('SUCCESS (Sandbox)! Access Token received.');
            console.log('Scope:', data.scope);
            return;
        } else {
            console.log(`Sandbox Failed: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.log('Response:', text);
        }

        // Try Live
        console.log('\nTesting PayPal Token (Live)...');
        baseUrl = 'https://api-m.paypal.com';
        response = await fetch(`${baseUrl}/v1/oauth2/token`, {
            method: 'POST',
            body: 'grant_type=client_credentials',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('SUCCESS (Live)! Access Token received.');
            console.log('Scope:', data.scope);
        } else {
            console.log(`Live Failed: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.log('Response:', text);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testPayPalToken();
