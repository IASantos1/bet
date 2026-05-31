
async function check() {
    try {
        const res = await fetch('http://127.0.0.1:8787/api/health');
        console.log("Health:", res.status);
    } catch (e) {
        console.error("Health check failed:", e.message);
    }
}
check();
