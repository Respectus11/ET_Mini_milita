/**
 * Utils.ts
 * ---------------------------------------------------------------------------
 * Small math & formatting helpers shared across gameplay and UI.
 */

/** Clamps v into the inclusive range [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : (v > hi ? hi : v);
}

/** Uniform random float in [a, b). */
export function rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
}

/** Uniform random integer in [a, b] (inclusive both ends). */
export function randInt(a: number, b: number): number {
    return Math.floor(rand(a, b + 1));
}

/** Picks one element uniformly at random. */
export function pick<T>(arr: T[]): T {
    return arr[randInt(0, arr.length - 1)];
}

/** Formats seconds as M:SS, rounding up (e.g. 125 -> "2:05"). */
export function fmtTime(sec: number): string {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}
