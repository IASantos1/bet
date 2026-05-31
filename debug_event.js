
async function check() {
    try {
        const res = await fetch('http://localhost:8787/api/events/1422739/odds');
        const data = await res.json();
        console.log('updated_at:', data.updated_at);
        console.log('keys:', Object.keys(data));
        console.log('odds keys:', Object.keys(data.odds || {}));
    } catch (e) {
        console.error(e);
    }
}
check();
