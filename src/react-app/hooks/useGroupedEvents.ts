import { useMemo } from 'react';
import type { Event } from '@/shared/types';

export function useGroupedEvents(events: Event[], query: string) {
    // 1. Filter
    const filtered = useMemo(() => {
        const q = String(query || '').toLowerCase().trim();
        if (!q) return events;
        return events.filter((e: any) => {
            const match = String(e?.match || '').toLowerCase();
            const league = String(e?.league || '').toLowerCase();
            const home = String(e?.home_team || '').toLowerCase();
            const away = String(e?.away_team || '').toLowerCase();
            return (
                match.includes(q) ||
                league.includes(q) ||
                home.includes(q) ||
                away.includes(q)
            );
        });
    }, [events, query]);

    // 2. Group & Sort
    const grouped = useMemo(() => {
        const g: Record<string, Event[]> = {};
        for (const e of filtered) {
            const k = e.league;
            if (!g[k]) g[k] = [];
            g[k].push(e);
        }

        const normalizeSportKey = (sport: any): string => {
            const s = String(sport || '').toLowerCase().trim();
            if (!s) return '';
            if (s.includes('football') && !s.includes('american')) return 'soccer';
            if (s.includes('futebol')) return 'soccer';
            if (s.includes('soccer')) return 'soccer';
            if (s.includes('tennis') || s.includes('ténis') || s.includes('tenis')) return 'tennis';
            if (s.includes('basketball') || s.includes('basquete') || s.includes('basquet')) return 'basketball';
            if (s.includes('ice') && s.includes('hockey')) return 'ice-hockey';
            if (s.includes('hockey') || s.includes('hóquei')) return 'ice-hockey';
            if (s.includes('baseball') || s.includes('beisebol')) return 'baseball';
            return s.replace(/\s+/g, '-');
        };

        const sportPrio = (sport: any): number => {
            const k = normalizeSportKey(sport);
            if (k === 'soccer') return 0;
            if (k === 'tennis') return 1;
            if (k === 'basketball') return 2;
            if (k === 'ice-hockey') return 3;
            if (k === 'baseball') return 4;
            return 9;
        };

        return Object.entries(g).sort((a, b) => {
            const aSport = sportPrio((a[1] && a[1][0] ? (a[1][0] as any).sport : ''));
            const bSport = sportPrio((b[1] && b[1][0] ? (b[1][0] as any).sport : ''));
            if (aSport !== bSport) return aSport - bSport;

            const prio = (s: string) => {
                const l = s.toLowerCase();
                // User Request: Prioritize UEFA Champions League & Europa League
                if (l.includes('uefa champions') || l.includes('champions league')) return 20;
                if (l.includes('uefa europa') || l.includes('europa league')) return 19;
                
                if (l.includes('serie a') || l.includes('brasileir')) return 10;
                if (l.includes('premier league')) return 9;
                if (l.includes('la liga')) return 7;
                if (l.includes('bundesliga')) return 7;
                if (l.includes('ligue 1')) return 6;
                return 1;
            };
            const diff = prio(b[0]) - prio(a[0]);
            if (diff) return diff;
            return String(a[0]).localeCompare(String(b[0]));
        });
    }, [filtered]);

    return grouped;
}
