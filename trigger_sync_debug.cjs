
async function run() {
    try {
        console.log("Triggering Robust Integration (Fetch Data)...");
        const res1 = await fetch('http://127.0.0.1:8787/api/dev/run-robust-integration', {
            method: 'POST'
        });
        const text1 = await res1.text();
        console.log("Integration Response:", text1.substring(0, 200) + "...");

        console.log("Waiting 5 seconds for DB commit...");
        await new Promise(r => setTimeout(r, 5000));

        console.log("Triggering Sync...");
        const res = await fetch('http://127.0.0.1:8787/api/dev/run-sync', {
            method: 'POST'
        });
        const text = await res.text();
        console.log("Sync Response:", text);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
