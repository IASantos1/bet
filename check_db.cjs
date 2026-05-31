
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/cab7c828feca5ae65720a33b155801a8520541f792e307ba5e76d30bb4c42067.sqlite');

if (!fs.existsSync(dbPath)) {
    console.error('DB not found at:', dbPath);
    process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

try {
    const count = db.prepare('SELECT COUNT(*) as c FROM events').get();
    console.log('Total events:', count.c);

    const rows = db.prepare('SELECT id, start_time, is_live, sport, league FROM events ORDER BY updated_at DESC LIMIT 5').all();
    console.log('Recent events:', rows);

    const now = new Date().toISOString();
    console.log('Current time (JS):', now);

    const timeCheck = db.prepare("SELECT datetime(?, '-4 hours') as dt").get(now);
    console.log('SQLite datetime check:', timeCheck);

    // Test the actual query logic
    const query = `
    SELECT count(*) as c
    FROM events e
    WHERE 
        (
            (e.is_live = 1 AND e.start_time >= datetime(?, '-24 hours'))
            OR
            (e.start_time >= datetime(?, '-4 hours') AND e.start_time <= datetime(?, '+30 hours'))
        )
    `;
    const matchCount = db.prepare(query).get(now, now, now);
    console.log('Matching events count:', matchCount.c);

} catch (e) {
    console.error('Error:', e);
} finally {
    db.close();
}
