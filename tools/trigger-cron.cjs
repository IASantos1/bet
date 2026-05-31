
async function trigger() {
    try {
        const url = "http://localhost:8787/api/cron/run?token=dev-admin-token&blocking=true";
        console.log("Triggering:", url);
        const res = await fetch(url, { method: 'POST' });
        const data = await res.json();
        console.log("Success:", data.success);
        console.log("Logs:");
        if (data.logs) {
            data.logs.forEach(l => console.log(l));
        } else {
            console.log("No logs returned", data);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

trigger();
