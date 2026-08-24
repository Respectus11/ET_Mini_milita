/**
 * UIUtil.ts
 * ---------------------------------------------------------------------------
 * In Cocos Creator 3.x every renderable component (Graphics, Label, Sprite)
 * requires a UITransform on its node. When building UI purely from code,
 * nodes are easy to forget — this guard adds it exactly once.
 */
import { Node, UITransform } from 'cc';

/** Returns the node's UITransform, attaching one first if missing. */
export function ensureUT(n: Node): UITransform {
    return n.getComponent(UITransform) ?? n.addComponent(UITransform);
}
