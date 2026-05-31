
async function run() {
  console.log('Triggering import...');
  try {
    const res = await fetch('http://127.0.0.1:8787/api/dev/force-import');
    if (!res.ok) {
        console.error('Error:', res.status, res.statusText);
        const txt = await res.text();
        console.error(txt);
    } else {
        const json = await res.json();
        console.log('Success:', json);
    }
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

run();
