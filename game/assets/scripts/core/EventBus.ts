/**
 * EventBus.ts
 * ---------------------------------------------------------------------------
 * Tiny typed publish/subscribe bus used to decouple gameplay systems.
 * Fighters emit combat events; HUD, audio, or networking layers may listen
 * without holding direct references to each other.
 */
type Handler = (...args: any[]) => void;

export class EventBus {
    private map: Map<string, Handler[]> = new Map();

    /** Subscribes a handler; returns an unsubscribe function. */
    on(evt: string, fn: Handler) {
        let arr = this.map.get(evt);
        if (!arr) { arr = []; this.map.set(evt, arr); }
        arr.push(fn);
        return () => this.off(evt, fn);
    }

    /** Removes a previously subscribed handler (no-op if absent). */
    off(evt: string, fn: Handler) {
        const arr = this.map.get(evt);
        if (!arr) return;
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
    }

    /** Fires all handlers for the event. Snapshot list = safe re-entrant off(). */
    emit(evt: string, ...args: any[]) {
        const arr = this.map.get(evt);
        if (!arr) return;
        for (const fn of arr.slice()) fn(...args);
    }

    clear() { this.map.clear(); }
}

/** Application-wide singleton bus. */
export const bus = new EventBus();

/**
 * Canonical event names.
 * - FRAG        (killerId, victimId)      a fighter died
 * - MATCH_END   (winnerId|null)           match finished
 * - HP_CHANGED  (fighterId, hp, label)    health updated
 * - AMMO_CHANGED(fighterId, mag, magSize) ammo updated
 * - WEAPON_CHANGED(fighterId, weaponId)   new weapon equipped
 * - RESPAWNED   (fighterId)               back in play
 * - PICKUP      (fighterId, kind)         item consumed
 */
export const Evt = {
    FRAG: 'frag',
    MATCH_END: 'matchEnd',
    HP_CHANGED: 'hpChanged',
    AMMO_CHANGED: 'ammoChanged',
    WEAPON_CHANGED: 'weaponChanged',
    RESPAWNED: 'respawned',
    PICKUP: 'pickup',
};
