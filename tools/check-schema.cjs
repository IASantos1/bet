
async function check() {
    try {
        const url = "http://localhost:8787/api/debug/schema";
        console.log("Fetching schema info from:", url);
        const res = await fetch(url);
        if (!res.ok) {
            console.log("Debug endpoint might not exist, trying to inspect via worker logs if possible or create a temporary debug endpoint.");
            // If the endpoint doesn't exist, we can't inspect directly from here unless we add the endpoint to worker.
            console.log("Status:", res.status, res.statusText);
            return;
        }
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

check();
