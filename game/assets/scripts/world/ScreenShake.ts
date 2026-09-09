/**
 * ScreenShake.ts
 * ---------------------------------------------------------------------------
 * Trauma-based screen shake (the classic "add trauma, offset by trauma²,
 * decay" model). Feedback events call add(); the owner applies offset(dt)
 * to its node position each frame. Smooth sine jitter — cheap and never
 * nauseating. Respect the player's settings toggle.
 */
import { rand } from '../core/Utils';
import { getSettings } from '../core/Settings';

export class ScreenShake {
    trauma = 0;
    private clock = 0;
    private seedX = rand(0, 1000);
    private seedY = rand(0, 1000);

    /** Adds impact; clamps at 1 (full violence). */
    add(amount: number) {
        if (!getSettings().shake) return;
        this.trauma = Math.min(1, this.trauma + amount);
    }

    /** Advances decay and returns this frame's [ox, oy] offset. */
    offset(dt: number, maxPx = 26): [number, number] {
        const t = this.trauma;
        if (t <= 0.0001) return [0, 0];
        this.trauma = Math.max(0, this.trauma - dt * 1.7);
        this.clock += dt;
        const s = t * t;
        const ox = maxPx * s * Math.sin(this.clock * 97 + this.seedX);
        const oy = maxPx * s * Math.cos(this.clock * 83 + this.seedY);
        return [ox, oy];
    }

    reset() { this.trauma = 0; this.clock = 0; }
}