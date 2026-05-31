
async function debug() {
    try {
        const url = "http://localhost:8787/api/debug/db/latest";
        console.log("Triggering:", url);
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log("Error:", res.status, res.statusText);
            const text = await res.text();
            console.log(text);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

debug();
