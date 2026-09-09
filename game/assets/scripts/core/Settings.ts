/**
 * Settings.ts
 * ---------------------------------------------------------------------------
 * Persisted player preferences (Storage-backed). Every fancy subsystem
 * (screen shake, particle density, audio volume) reads from here, so
 * low-end phones can dial effects down and every toggle survives restarts.
 */
import { loadStr, saveStr } from './Storage';

export type Density = 0 | 1 | 2; // low / medium / high

export interface GameSettings {
    shake: boolean;      // screen shake on/off
    density: Density;    // particle budget multiplier
    sfx: number;         // 0..1 master sound volume
    showFps: boolean;    // little fps counter in the HUD
}

const KEY = 'etmm_settings';

const DEFAULTS: GameSettings = {
    shake: true,
    density: 1,
    sfx: 0.8,
    showFps: false,
};

let cache: GameSettings | null = null;

/** Loads settings once, then serves the cached object. */
export function getSettings(): GameSettings {
    if (cache) return cache;
    try {
        const raw = loadStr(KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        cache = {
            shake: parsed.shake !== false,
            density: (parsed.density === 0 || parsed.density === 2
                ? parsed.density : 1) as Density,
            sfx: typeof parsed.sfx === 'number'
                ? Math.min(1, Math.max(0, parsed.sfx)) : DEFAULTS.sfx,
            showFps: parsed.showFps === true,
        };
    } catch {
        cache = { ...DEFAULTS };
    }
    return cache;
}

/** Persists a partial change immediately. */
export function updateSettings(patch: Partial<GameSettings>) {
    const s = { ...getSettings(), ...patch };
    try { saveStr(KEY, JSON.stringify(s)); } catch { /* non-persistent ok */ }
    cache = s;
}

/** Live particle multiplier for the current density setting. */
export function densityScale(): number {
    return [0.45, 1, 1.6][getSettings().density];
}