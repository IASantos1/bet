import type { Event } from '../types';
import EventCard from './EventCard';
import LeagueHeader from './LeagueHeader';

type Props = { 
  events: Event[];
  onOpenEvent: (event: any) => void;
};

export default function EventList({ events, onOpenEvent }: Props) {
  const grouped = events.reduce((acc: Record<string, Event[]>, evt) => {
    const key = `${evt.sport}::${evt.league?.name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(evt);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(grouped).map(([key, evts]) => {
        const [, leagueName] = key.split('::');
        return (
          <div key={key}>
            <LeagueHeader name={leagueName} />
            {evts.map(e => <EventCard key={e.fixture.id} event={e} onOpenEvent={onOpenEvent} />)}
          </div>
        );
      })}
    </div>
  );
}
