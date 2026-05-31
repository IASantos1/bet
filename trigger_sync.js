
console.log("Triggering Robust Integration...");
fetch('http://127.0.0.1:8787/api/dev/run-robust-integration', {
    method: 'POST'
})
.then(res => res.json())
.then(json => {
    console.log("Response:", JSON.stringify(json, null, 2));
})
.catch(e => {
    console.error("Error:", e);
});
