
async function checkDatetime() {
    try {
        console.log('Fetching /api/dev/check-datetime...');
        const res = await fetch('http://127.0.0.1:8787/api/dev/check-datetime');
        const json = await res.json();
        console.table(json.results);
    } catch (e) {
        console.error('Error:', e);
    }
}
checkDatetime();
