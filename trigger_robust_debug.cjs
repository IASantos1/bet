
async function run() {
    try {
        console.log("Triggering Robust Integration...");
        const res = await fetch('http://127.0.0.1:8787/api/dev/run-robust-integration', {
            method: 'POST'
        });
        
        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log("Raw Response:", text.substring(0, 1000)); // Print first 1000 chars

        try {
            const json = JSON.parse(text);
            console.log("Parsed JSON:", JSON.stringify(json, null, 2));
        } catch (e) {
            console.log("Response is NOT valid JSON.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
