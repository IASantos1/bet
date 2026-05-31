-- Migration 0036: Unified match engine tables (API-Football + Odds-API.io)

DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS match_odds_latest;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS team_alias;
DROP TABLE IF EXISTS api_football_raw;
DROP TABLE IF EXISTS odds_api_raw;

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  api_football_id TEXT,
  odds_api_id TEXT,
  sport TEXT,
  league_name TEXT,
  country TEXT,
  season TEXT,
  home_team_name TEXT,
  away_team_name TEXT,
  kickoff_time TEXT,
  status TEXT,
  last_update TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_api_football_id ON matches(api_football_id);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff_time ON matches(kickoff_time);
CREATE INDEX IF NOT EXISTS idx_matches_league_name ON matches(league_name);

CREATE TABLE IF NOT EXISTS match_odds_latest (
  match_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  bookmaker TEXT NOT NULL,
  market TEXT NOT NULL,
  home_odds REAL,
  draw_odds REAL,
  away_odds REAL,
  over_2_5 REAL,
  under_2_5 REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (match_id, provider, bookmaker, market)
);

CREATE INDEX IF NOT EXISTS idx_match_odds_latest_match_id ON match_odds_latest(match_id);

CREATE TABLE IF NOT EXISTS teams (
  team_id TEXT PRIMARY KEY,
  api_football_id TEXT,
  name TEXT NOT NULL,
  country TEXT,
  logo TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_api_football_id ON teams(api_football_id);
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);

CREATE TABLE IF NOT EXISTS team_alias (
  alias TEXT PRIMARY KEY,
  canonical TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_football_raw (
  api_football_id TEXT PRIMARY KEY,
  kickoff_time TEXT,
  league_name TEXT,
  home_team_name TEXT,
  away_team_name TEXT,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_football_raw_kickoff_time ON api_football_raw(kickoff_time);

CREATE TABLE IF NOT EXISTS odds_api_raw (
  odds_api_id TEXT PRIMARY KEY,
  kickoff_time TEXT,
  league_name TEXT,
  home_team_name TEXT,
  away_team_name TEXT,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_odds_api_raw_kickoff_time ON odds_api_raw(kickoff_time);
