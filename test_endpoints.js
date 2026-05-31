
async function test() {
    try {
        console.log("Testing /api/debug/inspect-premiership...");
        const res1 = await fetch('http://127.0.0.1:8787/api/debug/inspect-premiership');
        const text1 = await res1.text();
        console.log("Status:", res1.status);
        console.log("Body:", text1.substring(0, 500)); // First 500 chars

        console.log("\nTesting /api/dev/run-robust-integration...");
        const res2 = await fetch('http://127.0.0.1:8787/api/dev/run-robust-integration', { method: 'POST' });
        const text2 = await res2.text();
        console.log("Status:", res2.status);
        console.log("Body:", text2.substring(0, 500));
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
