
async function test() {
    try {
        console.log("Triggering Event Sync to capture debug logs...");
        const res = await fetch('http://127.0.0.1:8787/api/dev/sync-events', {
            method: 'POST'
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Body:", text.substring(0, 500));
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
