export type Outcome = { id: string; name: string; price: number | null; value?: number | null };
export type OddsMarket = { id: string; name: string; category: string; sub_category: string; outcomes: Outcome[] };
export type Team = { name: string };
export type Event = {
  fixture: { id: string; status?: { short?: string; elapsed?: number } };
  teams: { home: Team; away: Team };
  league?: { name?: string };
  odds?: Record<string, OddsMarket>;
  score?: { fulltime?: { home: number; away: number } };
  start_time?: string;
  event_date?: string;
  status?: string;
  is_live?: boolean;
  sport?: string;
};
