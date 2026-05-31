
const fs = require('fs');
try {
    let content = fs.readFileSync('debug_sync_logs.json', 'utf8');
    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    const json = JSON.parse(content);
    if (json.logs) {
        console.log(`Total logs: ${json.logs.length}`);
        const batchLogs = json.logs.filter(l => l.includes('batchUpsertEvents') || l.includes('Batch stats') || l.includes('Executing') || l.includes('First insert sample'));
        console.log('--- Batch Upsert Logs ---');
        batchLogs.forEach(l => console.log(l));
        
        const errorLogs = json.logs.filter(l => l.includes('Error') || l.includes('Failed') || l.includes('Dropped'));
        console.log('--- Error/Dropped Logs ---');
        errorLogs.forEach(l => console.log(l));

        const successLogs = json.logs.filter(l => l.includes('Normalized OK'));
        console.log(`--- Normalized OK Logs (${successLogs.length}) ---`);
        // successLogs.slice(0, 5).forEach(l => console.log(l));
    } else {
        console.log('No logs found in JSON');
    }
} catch (e) {
    console.error('Error parsing logs:', e.message);
}
