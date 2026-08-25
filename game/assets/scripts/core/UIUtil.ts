/**
 * UIUtil.ts
 * ---------------------------------------------------------------------------
 * Shared UI design system for the code-built interfaces:
 *   - ensureUT / coverSize : node & layout helpers
 *   - TYPE                 : type scale (every step >= 1.25x apart, so
 *                            headings, buttons and captions never blur
 *                            into one flat size mush)
 *   - RADIUS               : corner-radius tokens (one shape language)
 *   - makeButton           : THE button. Flat fill + solid bottom lip for
 *                            tactile depth, press feedback via a quick
 *                            darken — no gradients, glows or hairlines.
 */
import { Color, Graphics, Label, Node, UITransform, view } from 'cc';

/** Returns the node's UITransform, attaching one first if missing. */
export function ensureUT(n: Node): UITransform {
    return n.getComponent(UITransform) ?? n.addComponent(UITransform);
}

/** Type scale — adjacent steps are at least 1.25x apart. */
export const TYPE = {
    display: 104,   // hero titles
    h1: 64,         // screen titles
    h2: 48,         // emphasized values (selected map name)
    h3: 36,         // primary action labels
    body: 28,       // default reading size
    small: 22,      // captions, hints
};

/** Corner-radius tokens — one shape language across every surface. */
export const RADIUS = { sm: 10, md: 14 };

/**
 * Smallest centered rectangle that fully covers the screen on this device,
 * in UI coordinates (origin at screen center). Never smaller than the
 * 1920x1080 design size.
 */
export function coverSize(): { w: number; h: number } {
    let vw = 1920;
    let vh = 1080;
    try {
        const vs = view.getVisibleSize();
        vw = Math.max(vw, vs.width);
        vh = Math.max(vh, vs.height);
    } catch { /* view not ready — design size fallback */ }
    return { w: vw, h: vh };
}

function shade(c: Color, f: number): Color {
    return new Color(
        Math.round(c.r * f),
        Math.round(c.g * f),
        Math.round(c.b * f),
        c.a,
    );
}

export interface ButtonOptions {
    text: string;
    x: number;
    y: number;
    onClick: () => void;
    w?: number;
    h?: number;
    /** Fill color; a darkened copy forms the bottom lip + press state. */
    fill?: Color;
    textColor?: Color;
    /** Explicit font size; defaults to a size proportional to height. */
    fontSize?: number;
}

/**
 * The one true button: flat fill, darker bottom lip for depth, label,
 * and a brief darken while pressed (ease-out feel — no bounce).
 */
export function makeButton(parent: Node, o: ButtonOptions): Node {
    const w = o.w ?? 300;
    const h = o.h ?? 76;
    const base = o.fill ?? new Color(62, 74, 96);

    const n = new Node('btn_' + o.text.slice(0, 6));
    parent.addChild(n);
    n.setPosition(o.x, o.y, 0);
    ensureUT(n).setContentSize(w, h);

    const g = n.addComponent(Graphics);
    const paint = (fill: Color) => {
        g.clear();
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, RADIUS.md);
        g.fill();
        g.fillColor = shade(fill, 0.72);
        g.roundRect(-w / 2, -h / 2, w, 5, 2.5);
        g.fill();
    };
    paint(base);

    const ln = new Node('lbl');
    n.addChild(ln);
    ensureUT(ln);
    const l = ln.addComponent(Label);
    l.string = o.text;
    l.fontSize = o.fontSize ?? Math.max(TYPE.small, Math.floor(h * 0.38));
    l.lineHeight = Math.floor(l.fontSize * 1.25);
    l.isBold = true;
    l.color = o.textColor ?? new Color(255, 255, 255);

    n.on(Node.EventType.TOUCH_START, () => paint(shade(base, 0.8)));
    n.on(Node.EventType.TOUCH_END, () => { paint(base); o.onClick(); });
    n.on(Node.EventType.TOUCH_CANCEL, () => paint(base));
    return n;
}
