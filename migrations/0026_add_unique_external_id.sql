-- Ensure external_event_id is unique for upserts
-- First, remove duplicates (if any) - This is a safety measure
DELETE FROM events 
WHERE external_event_id IS NOT NULL 
AND id NOT IN (
    SELECT MIN(id) 
    FROM events 
    WHERE external_event_id IS NOT NULL 
    GROUP BY external_event_id
);

-- Create the unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_id ON events(external_event_id);
