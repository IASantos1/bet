async function run() {
    try {
        const url = 'http://localhost:8787/api/events?include=odds';
        console.log('Fetching:', url);
        const res = await fetch(url);
        const data = await res.json();
        console.log('Events count:', data.length);
        if (data.length > 0) {
            console.log('First event:', JSON.stringify(data[0], null, 2));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
