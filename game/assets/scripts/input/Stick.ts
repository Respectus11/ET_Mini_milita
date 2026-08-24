export interface StickState {
    active: boolean;
    ox: number; oy: number;
    cx: number; cy: number;
}

/** Returns [normalizedX, normalizedY, magnitude 0..1] */
export function stickVec(s: StickState, deadzone: number): [number, number, number] {
    if (!s.active) return [0, 0, 0];
    const dx = s.cx - s.ox;
    const dy = s.cy - s.oy;
    const len = Math.hypot(dx, dy);
    if (len < deadzone) return [0, 0, 0];
    const mag = Math.min(1, len / 110);
    return [dx / len * mag, dy / len * mag, mag];
}
