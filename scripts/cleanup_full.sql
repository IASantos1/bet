-- Full cleanup of events and imported odds to remove 22Bet residue
DELETE FROM events;
DELETE FROM imported_odds;
-- Also clear other related tables if necessary
DELETE FROM market_exposure;
DELETE FROM event_updates;
