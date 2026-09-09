/**
 * Effects.ts
 * ---------------------------------------------------------------------------
 * The juice layer: a pooled, zero-asset particle engine. Every combat event
 * (shots, impacts, explosions, deaths, pickups) blooms into sparks, rings,
 * smoke, debris and floating text here. Nodes are pooled (no per-blast
 * churn), colors are stored as numbers (no per-frame Color allocations),
 * and the live count is capped by the player's density setting so low-end
 * phones stay smooth.
 *
 * Coordinates are "root-local": pass the match node for world FX, or any
 * UI node for screen FX — the same class powers both.
 */
import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { Pool } from '../core/ObjectPool';
import { rand, pick, clamp } from '../core/Utils';
import { densityScale, getSettings } from '../core/Settings';

type Kind = 'spark' | 'puff' | 'ring' | 'debris' | 'flash';

interface Particle {
    node: Node;
    g: Graphics;
    kind: Kind;
    x: number; y: number;
    vx: number; vy: number;
    grav: number;
    drag: number;
    rot: number;
    vr: number;
    life: number;
    maxLife: number;
    size: number;      // start radius / debris half-size
    size2: number;     // end radius (rings expand toward this)
    w: number;         // ring stroke width
    cr: number; cg: number; cb: number;
    a0: number;        // initial alpha
    tmp: Color;        // reused scratch color — never allocate per frame
}

interface TextFx {
    node: Node;
    lbl: Label;
    x: number; y: number;
    vy: number;
    life: number;
    maxLife: number;
    tmp: Color;
}

export interface BurstOpts {
    x: number; y: number;
    count?: number;
    speed?: number;
    speedVar?: number;
    angle?: number;      // radians; undefined = all directions
    spread?: number;     // radians around angle
    color?: Color;
    colors?: Color[];
    size?: number;
    grav?: number;
    life?: number;
    drag?: number;
    shape?: 'spark' | 'debris';
}

export interface RingOpts {
    x: number; y: number;
    r0?: number; r1?: number;
    life?: number;
    color?: Color;
    width?: number;
}

const DEFAULT_SMOKE = new Color(120, 120, 128, 255);

function densityIndex(): 0 | 1 | 2 {
    return getSettings().density;
}

export class Effects {
    private live: Particle[] = [];
    private pool: Pool<Particle>;
    private texts: TextFx[] = [];
    private textPool: Pool<TextFx>;

    constructor(private root: Node) {
        this.pool = new Pool<Particle>(() => this.make(), p => { p.g.clear(); });
        this.textPool = new Pool<TextFx>(() => this.makeText());
    }

    private get maxLive(): number {
        return Math.round([70, 140, 240][densityIndex()] * densityScale());
    }

    private make(): Particle {
        const node = new Node('fxp');
        node.active = false;
        this.root.addChild(node);
        node.addComponent(UITransform);
        return {
            node, g: node.addComponent(Graphics),
            kind: 'spark',
            x: 0, y: 0, vx: 0, vy: 0,
            grav: 0, drag: 0, rot: 0, vr: 0,
            life: 0, maxLife: 1,
            size: 4, size2: 4, w: 3,
            cr: 255, cg: 255, cb: 255, a0: 255,
            tmp: new Color(),
        };
    }

    private makeText(): TextFx {
        const node = new Node('fxt');
        node.active = false;
        this.root.addChild(node);
        node.addComponent(UITransform);
        const lbl = node.addComponent(Label);
        lbl.isBold = true;
        return { node, lbl, x: 0, y: 0, vy: 90, life: 0, maxLife: 1, tmp: new Color() };
    }

    private grab(kind: Kind): Particle | null {
        if (this.live.length >= this.maxLive) return null;
        const p = this.pool.get();
        p.kind = kind;
        p.node.active = true;
        p.node.setPosition(0, 0, 0);
        p.node.angle = 0;
        this.live.push(p);
        return p;
    }

    private setColor(p: Particle, col: Color, a0: number) {
        p.cr = col.r; p.cg = col.g; p.cb = col.b; p.a0 = a0;
    }

    /** Radial spark / debris burst. */
    burst(o: BurstOpts) {
        const q = densityScale();
        const count = Math.max(1, Math.round((o.count ?? 8) * q));
        const speed = o.speed ?? 260;
        const sv = o.speedVar ?? 0.6;
        const spread = o.spread ?? Math.PI * 2;
        const base = o.angle ?? 0;
        const full = o.angle === undefined;
        for (let i = 0; i < count; i++) {
            const p = this.grab(o.shape ?? 'spark');
            if (!p) return;
            const ang = full ? rand(0, Math.PI * 2) : base + rand(-spread / 2, spread / 2);
            const sp = speed * (1 + rand(-sv, sv));
            p.x = o.x; p.y = o.y;
            p.vx = Math.cos(ang) * sp;
            p.vy = Math.sin(ang) * sp;
            p.grav = o.grav ?? (p.kind === 'debris' ? 900 : 240);
            p.drag = o.drag ?? 1.6;
            p.rot = rand(0, Math.PI);
            p.vr = rand(-9, 9);
            p.maxLife = o.life ?? rand(0.3, 0.55);
            p.life = p.maxLife;
            p.size = (o.size ?? 5) * rand(0.6, 1.3);
            p.size2 = 0;
            p.w = 3;
            const col = o.colors ? pick(o.colors) : (o.color ?? Color.WHITE);
            this.setColor(p, col, 235);
        }
    }

    /** Expanding shockwave circle. */
    ring(o: RingOpts) {
        const p = this.grab('ring');
        if (!p) return;
        p.x = o.x; p.y = o.y;
        p.vx = 0; p.vy = 0; p.grav = 0; p.drag = 0; p.vr = 0;
        p.maxLife = o.life ?? 0.32;
        p.life = p.maxLife;
        p.size = o.r0 ?? 8;
        p.size2 = o.r1 ?? 60;
        p.w = o.width ?? 5;
        const col = o.color ?? Color.WHITE;
        this.setColor(p, col, 220);
    }

    /** One-frame bright flash — the "pop" of an explosion. */
    flash(x: number, y: number, r = 40, life = 0.1, color?: Color) {
        const p = this.grab('flash');
        if (!p) return;
        p.x = x; p.y = y;
        p.vx = 0; p.vy = 0; p.grav = 0; p.drag = 0; p.vr = 0;
        p.maxLife = life;
        p.life = life;
        p.size = r;
        p.size2 = r;
        p.w = 3;
        this.setColor(p, color ?? Color.WHITE, 235);
    }

    /** Soft smoke puff. */
    puff(x: number, y: number, count = 1, color?: Color, rise = 60) {
        const q = densityScale();
        const n = Math.max(1, Math.round(count * q));
        for (let i = 0; i < n; i++) {
            const p = this.grab('puff');
            if (!p) return;
            p.x = x + rand(-6, 6); p.y = y + rand(-4, 4);
            p.vx = rand(-40, 40); p.vy = rise * rand(0.5, 1.1);
            p.grav = 0; p.drag = 1.2; p.rot = 0; p.vr = 0;
            p.maxLife = rand(0.4, 0.7);
            p.life = p.maxLife;
            p.size = rand(7, 13);
            p.size2 = 0;
            p.w = 3;
            this.setColor(p, color ?? DEFAULT_SMOKE, 90);
        }
    }

    // ---- continued below: composite effects + tick ----

    /** Little ground dust kicked up by landings and footsteps. */
    dust(x: number, y: number, dirX = 0) {
        const p = this.grab('puff');
        if (!p) return;
        p.x = x + rand(-8, 8); p.y = y + rand(0, 5);
        p.vx = dirX * rand(30, 80) + rand(-20, 20);
        p.vy = rand(20, 55);
        p.grav = 0; p.drag = 2; p.rot = 0; p.vr = 0;
        p.maxLife = rand(0.25, 0.45);
        p.life = p.maxLife;
        p.size = rand(5, 9);
        p.size2 = 0;
        p.w = 3;
        this.setColor(p, new Color(168, 150, 122, 255), 80);
    }

    /** Full explosion composition: flash, rings, sparks, debris, smoke. */
    explosion(x: number, y: number, radius: number, color?: Color) {
        const accent = color ?? new Color(255, 160, 40, 255);
        this.flash(x, y, radius * 0.9, 0.1);
        this.ring({ x, y, r0: radius * 0.25, r1: radius * 1.2, life: 0.34, color: accent, width: 6 });
        this.ring({ x, y, r0: radius * 0.1, r1: radius * 0.75, life: 0.26, color: Color.WHITE, width: 4 });
        this.burst({
            x, y, count: 11, speed: radius * 2.6, speedVar: 0.7,
            color: new Color(255, 220, 120, 255), size: 4.5, life: 0.38,
        });
        this.burst({
            x, y, count: 5, speed: radius * 1.7, speedVar: 0.8,
            color: new Color(90, 84, 70, 255), size: 6, life: 0.6, shape: 'debris',
        });
        this.puff(x, y + radius * 0.2, 4, undefined, 90);
    }

    /** Celebration confetti in outfit/flag colors (results, frags). */
    confetti(x: number, y: number, colors: Color[], count = 26) {
        this.burst({
            x, y, count, speed: 420, speedVar: 0.8, colors,
            size: 7, life: 1.1, grav: 700, shape: 'debris', drag: 0.8,
        });
    }

    /** Rising floating text ("+40", "KO!", weapon names). */
    floatText(x: number, y: number, str: string, color?: Color, size = 30) {
        if (this.texts.length >= 14) return;
        const t = this.textPool.get();
        t.lbl.string = str;
        t.lbl.fontSize = size;
        t.lbl.lineHeight = Math.floor(size * 1.15);
        const col = color ?? Color.WHITE;
        this.enableOutline(t.lbl, col);
        t.tmp.r = col.r; t.tmp.g = col.g; t.tmp.b = col.b; t.tmp.a = 255;
        t.x = x; t.y = y;
        t.vy = 110;
        t.maxLife = 0.8;
        t.life = t.maxLife;
        t.node.setPosition(x, y, 0);
        t.node.angle = 0;
        t.node.active = true;
        this.texts.push(t);
    }

    private enableOutline(l: Label, col: Color) {
        l.color = new Color(255, 255, 255, 255);
        l.enableOutline = true;
        l.outlineColor = new Color(
            Math.round(col.r * 0.4), Math.round(col.g * 0.4),
            Math.round(col.b * 0.4), 255);
        l.outlineWidth = 3;
    }

    /** Advances every live particle + floating text. Call once per frame. */
    tick(dt: number) {
        this.tickParticles(dt);
        this.tickTexts(dt);
    }

    private tickParticles(dt: number) {
        for (let i = this.live.length - 1; i >= 0; i--) {
            const p = this.live[i];
            // node may have been destroyed with its parent screen — drop it
            if (!p.node || !p.node.isValid) {
                this.live.splice(i, 1);
                continue;
            }
            p.life -= dt;
            if (p.life <= 0) {
                p.node.active = false;
                p.g.clear();
                this.live.splice(i, 1);
                this.pool.put(p);
                continue;
            }
            const prog = 1 - p.life / p.maxLife;   // 0..1 age
            const fade = 1 - prog;
            // physics
            p.vy -= p.grav * dt;
            if (p.drag > 0) {
                const d = Math.max(0, 1 - p.drag * dt);
                p.vx *= d; p.vy *= d;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            this.drawParticle(p, prog, fade);
        }
    }

    private drawParticle(p: Particle, prog: number, fade: number) {
        const g = p.g;
        g.clear();
        const a = Math.round(p.a0 * fade);
        p.tmp.r = p.cr; p.tmp.g = p.cg; p.tmp.b = p.cb; p.tmp.a = a;
        switch (p.kind) {
            case 'spark': {
                g.lineWidth = 3 * fade + 1;
                g.strokeColor = p.tmp;
                g.moveTo(p.x, p.y);
                g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
                g.stroke();
                g.fillColor = p.tmp;
                g.circle(p.x, p.y, Math.max(0.5, p.size * 0.5 * fade));
                g.fill();
                p.node.setPosition(0, 0, 0);
                break;
            }
            case 'debris': {
                g.fillColor = p.tmp;
                const s = p.size * (0.5 + 0.5 * fade);
                g.rect(-s / 2, -s / 2, s, s);
                g.fill();
                p.node.setPosition(p.x, p.y, 0);
                p.node.angle = p.rot;
                break;
            }
            case 'ring': {
                g.lineWidth = Math.max(1, p.w * fade);
                g.strokeColor = p.tmp;
                g.circle(p.x, p.y, p.size + (p.size2 - p.size) * prog);
                g.stroke();
                p.node.setPosition(0, 0, 0);
                break;
            }
            case 'flash': {
                g.fillColor = p.tmp;
                g.circle(p.x, p.y, p.size * (0.7 + 0.5 * prog));
                g.fill();
                p.node.setPosition(0, 0, 0);
                break;
            }
            case 'puff': {
                g.fillColor = p.tmp;
                g.circle(p.x, p.y, p.size * (0.6 + 1.5 * prog));
                g.fill();
                p.node.setPosition(0, 0, 0);
                break;
            }
        }
    }

    private tickTexts(dt: number) {
        for (let i = this.texts.length - 1; i >= 0; i--) {
            const t = this.texts[i];
            if (!t.node || !t.node.isValid) {
                this.texts.splice(i, 1);
                continue;
            }
            t.life -= dt;
            if (t.life <= 0) {
                t.node.active = false;
                this.texts.splice(i, 1);
                this.textPool.put(t);
                continue;
            }
            t.vy *= Math.max(0, 1 - 1.6 * dt);
            t.y += t.vy * dt;
            t.node.setPosition(t.x, t.y, 0);
            const fade = clamp(t.life / t.maxLife * 2.2, 0, 1);
            t.tmp.a = Math.round(255 * fade);
            t.lbl.color = t.tmp;
        }
    }

    /** Kills everything instantly (match teardown / screen switch). */
    clear() {
        for (const p of this.live) {
            p.node.active = false;
            p.g.clear();
            this.pool.put(p);
        }
        this.live.length = 0;
        for (const t of this.texts) {
            t.node.active = false;
            this.textPool.put(t);
        }
        this.texts.length = 0;
    }
}
