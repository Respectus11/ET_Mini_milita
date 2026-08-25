/**
 * Storage.ts
 * ---------------------------------------------------------------------------
 * Persistent key/value storage that works on EVERY target:
 *  - browser preview / web build  -> window.localStorage via cc.sys
 *  - Android/iOS native build     -> cc.sys localStorage bridge (jsb)
 *
 * The raw global `localStorage` only exists in browsers, so code that used
 * it directly silently lost language/outfit/relay persistence on device.
 * All reads/writes are guarded — a missing backend degrades to no-ops.
 */
import { sys } from 'cc';

/** Returns the stored string for `key`, or null when absent/unavailable. */
export function loadStr(key: string): string | null {
    try {
        const v = sys?.localStorage?.getItem(key);
        return v == null ? null : String(v);
    } catch {
        return null;
    }
}

/** Persists a string; failures (private mode, quota) degrade to no-ops. */
export function saveStr(key: string, value: string) {
    try {
        sys?.localStorage?.setItem(key, value);
    } catch { /* storage unavailable — settings just won't persist */ }
}
