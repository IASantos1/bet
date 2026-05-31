import { useMemo } from 'react';
import type { Event } from '@/shared/types';

export function useTopLeagues(liveEvents: Event[], upcomingEvents: Event[]) {
    return useMemo(() => {
        const candidates = new Map<string, Event>();
        const allEvents = [...liveEvents, ...upcomingEvents];
        
        const getCanonicalKey = (e: Event): string | null => {
            const n = (e.league || '').toLowerCase();
            const c = (e.country || '').toLowerCase();

            // Premier League
            if (n.includes('premier league') && (c === 'england' || c === 'inglaterra' || n.includes('england'))) return 'premier_league';
            
            // La Liga
            if (n.includes('la liga') && (c === 'spain' || c === 'espanha' || n.includes('spain'))) return 'la_liga';
            
            // Bundesliga
            if (n.includes('bundesliga') && !n.includes('2.') && !n.includes('austria') && (c === 'germany' || c === 'alemanha' || n.includes('germany'))) return 'bundesliga';
            
            // Ligue 1
            if (n.includes('ligue 1') && (c === 'france' || c === 'frança' || n.includes('france'))) return 'ligue_1';
            
            // Serie A (Italy)
            if ((n === 'serie a' || n.includes('serie a')) && !n.includes('serie b') && (c === 'italy' || c === 'itália')) return 'serie_a_it';
            
            // Serie A (Brazil)
            if ((n.includes('brasileir') || n.includes('serie a')) && !n.includes('serie b') && (c === 'brazil' || c === 'brasil')) return 'serie_a_br';

            // Portugal
            if ((c === 'portugal' || n.includes('portugal')) && (n.includes('liga') || n.includes('primeira')) && !n.includes('segunda') && !n.includes('2')) return 'liga_portugal';

            // Champions League
            if (n.includes('champions league') && !n.includes('women') && !n.includes('u19') && !n.includes('youth') && !n.includes('afc') && !n.includes('caf')) return 'ucl';

            // Europa League
            if (n.includes('europa league')) return 'uel';

            // Libertadores
            if (n.includes('libertadores')) return 'libertadores';

            // Sudamericana
            if (n.includes('sudamericana')) return 'sudamericana';

            // NBA
            if (n.includes('nba') && !n.includes('2k') && !n.includes('g-league')) return 'nba';

            // NFL
            if (n.includes('nfl')) return 'nfl';

            // UFC
            if (n.includes('ufc')) return 'ufc';

            // F1
            if (n.includes('formula 1') || n.includes('f1')) return 'f1';

            return null;
        };

        allEvents.forEach(e => {
            if (e.league) {
                const key = getCanonicalKey(e);
                if (key) {
                    if (!candidates.has(key)) {
                        candidates.set(key, e);
                    } else {
                        const existing = candidates.get(key);
                        // Prioritize event with explicit country if available
                        if (!existing?.country && e.country) {
                            candidates.set(key, e);
                        }
                        // Prioritize uppercase league name (e.g. NBA over Nba)
                        else if (existing && e.league && e.league !== existing.league && e.league === e.league.toUpperCase()) {
                             candidates.set(key, e);
                        }
                        // Prioritize shorter names often (Premier League vs England - Premier League) - subjective, but clean
                        else if (existing && e.league && e.league.length < existing.league.length) {
                             candidates.set(key, e);
                        }
                    }
                }
            }
        });

        return Array.from(candidates.values())
            .sort((a, b) => {
             const score = (evt: Event) => {
                const l = (evt.league || '').toLowerCase();
                if (l.includes('champions league')) return 100;
                if (l.includes('premier league')) return 90;
                if (l.includes('la liga')) return 80;
                if (l.includes('brasileir') || (l.includes('brazil') && l.includes('serie a'))) return 35;
                if (l.includes('serie a')) return 70;
                if (l.includes('bundesliga')) return 60;
                if (l.includes('ligue 1')) return 50;
                if (l.includes('portugal')) return 40;
                return 10;
             };
             return score(b) - score(a);
        })
        .slice(0, 5);
    }, [liveEvents, upcomingEvents]);
}
