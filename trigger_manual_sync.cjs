
async function run() {
    try {
        console.log('Triggering manual sync...');
        const res = await fetch('http://127.0.0.1:8787/api/dev/run-sync', {
            method: 'POST'
        });
        const json = await res.json();
        console.log('Sync result:', JSON.stringify(json, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
