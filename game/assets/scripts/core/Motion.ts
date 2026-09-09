/**
 * Motion.ts
 * ---------------------------------------------------------------------------
 * The motion language: shared durations, easings and small reusable
 * transitions (punch, fade, pop-in) built on the engine tween system so
 * every screen moves with the same rhythm.
 */
import { Node, Tween, tween, UIOpacity, Vec3 } from 'cc';

/** Standard durations (seconds) — keep UI interactions within 0.25s. */
export const DUR = {
    instant: 0.08,
    quick: 0.14,
    medium: 0.24,
    dramatic: 0.45,
};

/** Named easings so call sites read as intent, not magic strings. */
export const EASE = {
    popIn: 'backOut',
    settle: 'quadOut',
    exit: 'quadIn',
    bounce: 'elasticOut',
    soft: 'sineInOut',
};

function ensureOpacity(n: Node): UIOpacity {
    return n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
}

/**
 * Impact punch: quickly inflate then settle back with overshoot.
 * `amount` > 1 inflates; < 1 squashes. Respects the node's base scale.
 */
export function punchScale(n: Node, amount = 1.18, dur = DUR.quick) {
    const base = n.scale.clone();
    Tween.stopAllByTarget(n);
    tween(n)
        .to(dur * 0.35, { scale: new Vec3(base.x * amount, base.y * amount, base.z) },
            { easing: 'quadOut' })
        .to(dur * 0.65, { scale: new Vec3(base.x, base.y, base.z) },
            { easing: 'quadIn' })
        .start();
}

/** Fade a whole subtree in/out via UIOpacity. */
export function fadeTo(n: Node, opacity: number, dur = DUR.medium,
                       onDone?: () => void) {
    const op = ensureOpacity(n);
    Tween.stopAllByTarget(op);
    const t = tween(op).to(dur, { opacity }, { easing: 'quadOut' });
    if (onDone) t.call(onDone);
    t.start();
}

/** Appear from nothing with overshoot — for panels, banners, results. */
export function popIn(n: Node, dur = DUR.medium, delay = 0) {
    const base = n.scale.clone();
    n.setScale(base.x * 0.2, base.y * 0.2, base.z);
    const op = ensureOpacity(n);
    op.opacity = 0;
    Tween.stopAllByTarget(n);
    tween(n)
        .delay(delay)
        .to(dur, { scale: new Vec3(base.x, base.y, base.z) }, { easing: EASE.popIn })
        .start();
    Tween.stopAllByTarget(op);
    tween(op).delay(delay).to(dur * 0.5, { opacity: 255 }, { easing: 'quadOut' }).start();
}

/** Endless gentle bob — for titles and floating hints. */
export function bobY(n: Node, range = 8, period = 2.2) {
    const baseY = n.position.y;
    Tween.stopAllByTarget(n);
    tween(n)
        .repeatForever(
            tween(n as any)
                .to(period * 0.5, { position: new Vec3(n.position.x, baseY + range, 0) },
                    { easing: EASE.soft })
                .to(period * 0.5, { position: new Vec3(n.position.x, baseY, 0) },
                    { easing: EASE.soft }),
        )
        .start();
}