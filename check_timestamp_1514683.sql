SELECT id, is_live, updated_at, datetime('now') as current_time 
FROM imported_odds 
WHERE id = 'soccer_1514683';

SELECT count(*) as live_count 
FROM imported_odds 
WHERE is_live = 1 AND updated_at > datetime('now', '-48 hours');

SELECT id, updated_at 
FROM imported_odds 
WHERE is_live = 1 AND updated_at > datetime('now', '-48 hours')
ORDER BY updated_at DESC
LIMIT 15;
