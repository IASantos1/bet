
async function run() {
    try {
        console.log("Checking Counts by Sport...");
        const res = await fetch('http://127.0.0.1:8787/api/dev/count-by-sport');
        const data = await res.json();
        console.log("Counts:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
