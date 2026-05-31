import { useState, useEffect } from 'react';
import type { Event } from '@/shared/types';

export function useLiveEventsMerge(
    live: Event[], 
    updatedEvents: any[], 
    removedEventIds: string[] = [],
    loading: boolean
) {
    const [liveEvents, setLiveEvents] = useState<Event[]>([]);

    // 1. Initial Load & Sync from API
    useEffect(() => {
        if (live.length === 0) {
            if (loading) return;
            setLiveEvents([]);
            return;
        }

        setLiveEvents(prev => {
            if (prev.length === 0) return live;

            // Correct Merge Logic: Preserve local state if exists
            // Using Map for O(1) lookup of previous items
            const prevMap = new Map(prev.map(p => [String(p.id), p]));

            const merged = live.map(newItem => {
                const oldItem = prevMap.get(String(newItem.id));
                if (oldItem) {
                    return { ...oldItem, ...newItem };
                }
                return newItem;
            });
            return merged;
        });
    }, [live, loading]);

    // 2. SSE Updates (Controlled Deep Merge)
    useEffect(() => {
        if (!updatedEvents || updatedEvents.length === 0) return;

        setLiveEvents(prevEvents => {
            if (prevEvents.length === 0) return prevEvents;

            const updatesMap = new Map(updatedEvents.map(u => [String(u.id), u]));
            let hasChanges = false;

            const nextEvents = prevEvents.map(ev => {
                const update = updatesMap.get(String(ev.id));
                if (update) {
                    hasChanges = true;
                    // Controlled Deep Merge
                    return {
                        ...ev,
                        // Update simple fields
                        score: update.score ?? ev.score,
                        is_live: update.is_live ?? ev.is_live,
                        suspended: update.suspended ?? ev.suspended,
                        suspendReason: update.suspendReason ?? ev.suspendReason,
                        // Deep merge markets if present
                        markets: update.markets ? { ...ev.markets, ...update.markets } : ev.markets,
                        // Update odds if they are top-level properties
                        home_odd: update.home_odd ?? ev.home_odd,
                        draw_odd: update.draw_odd ?? ev.draw_odd,
                        away_odd: update.away_odd ?? ev.away_odd,
                    };
                }
                return ev;
            });

            // Detect and append NEW events
            const prevIds = new Set(prevEvents.map(e => String(e.id)));
            const newEvents = updatedEvents.filter(u => !prevIds.has(String(u.id)));
            
            if (newEvents.length > 0) {
                hasChanges = true;
                nextEvents.push(...newEvents);
            }

            return hasChanges ? nextEvents : prevEvents;
        });
    }, [updatedEvents]);

    // 3. Handle Removals
    useEffect(() => {
        if (!removedEventIds || removedEventIds.length === 0) return;
        
        setLiveEvents(prev => {
            const nextEvents = prev.filter(ev => !removedEventIds.includes(String(ev.id)));
            return nextEvents.length !== prev.length ? nextEvents : prev;
        });
    }, [removedEventIds]);

    return { liveEvents };
}
