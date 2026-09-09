/**
 * Projectile.ts
 * ---------------------------------------------------------------------------
 * Pooled bullet/grenade simulation. Each projectile steps in sub-steps sized
 * to a third of a tile so fast rounds cannot tunnel through walls, collides
 * against SOLID tiles and fighter hitboxes, applies splash damage with
 * distance falloff (launcher), and draws itself plus a short motion trail
 * into world-space Graphics under the match root node.
 */
import { Color, Graphics, Node } from 'cc';
import { CFG } from '../core/GameConfig';
import { TileWorld } from '../world/TileWorld';
import { ensureUT } from '../core/UIUtil';
import { Effects } from '../world/Effects';

export interface BarrelRef {
    x: number; y: number; w: number; h: number;
    alive: boolean;
    applyDamage(dmg: number, killerId: number): boolean;
}

export interface ProjectileHost {
    world: TileWorld;
    fighters: FighterRef[];
    barrels?: BarrelRef[];
    onSplash(x: number, y: number): void;
}

export interface FighterRef {
    x: number; y: number; w: number; h: number;
    alive: boolean;
    ownerId: number;
    ref: any;
    applyDamage(dmg: number, killerId: number, hitY?: number, isExplosion?: boolean): boolean;
}

interface PState {
    node: Node;
    g: Graphics;
    x: number; y: number;
    vx: number; vy: number;
    grav: number;
    dmg: number;
    splash: number;
    life: number;
    ownerId: number;
    color: Color;
    trail: { x: number; y: number }[];
    tmp: Color;   // reused scratch color — no per-frame allocation
}

export class ProjectileSystem {
    private live: PState[] = [];
    private free: PState[] = [];
    /** World VFX (set by MatchManager); null keeps the legacy fallbacks. */
    fx: Effects | null = null;

    constructor(public host: ProjectileHost, private root: Node) {}

    spawn(ownerId: number, x: number, y: number, angle: number, speed: number,
          def: { dmg: number; gravityScale: number; splashRadius: number }, color: Color) {
        const s = this.free.pop() ?? this.make();
        s.x = x; s.y = y;
        s.vx = Math.cos(angle) * speed;
        s.vy = Math.sin(angle) * speed;
        s.grav = def.gravityScale * CFG.GRAVITY * 0.75;
        s.dmg = def.dmg;
        s.splash = def.splashRadius;
        s.life = 2.2;
        s.ownerId = ownerId;
        s.color = color;
        s.trail.length = 0;
        s.node.active = true;
        this.live.push(s);
    }

    private make(): PState {
        const node = new Node('proj');
        this.root.addChild(node);
        ensureUT(node);
        return {
            node, g: node.addComponent(Graphics),
            x: 0, y: 0, vx: 0, vy: 0, grav: 0,
            dmg: 10, splash: 0, life: 2, ownerId: 0,
            color: new Color(255, 255, 0), trail: [], tmp: new Color(),
        };
    }

    tick(dt: number) {
        for (let i = this.live.length - 1; i >= 0; i--) {
            const p = this.live[i];
            p.life -= dt;
            if (p.life <= 0) { this.retire(i); continue; }

            const prevX = p.x, prevY = p.y;
            p.vy -= p.grav * dt;
            const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) * dt / (CFG.TILE / 3)));
            let dead = false;
            for (let s = 0; s < steps && !dead; s++) {
                p.x += p.vx * dt / steps;
                p.y += p.vy * dt / steps;

                if (this.host.world.solidAtWorld(p.x, p.y)) {
                    this.impact(p, prevX, prevY);
                    dead = true;
                    break;
                }
                // hit barrels
                if (this.host.barrels) {
                    for (const b of this.host.barrels) {
                        if (!b.alive) continue;
                        if (p.x > b.x - b.w / 2 && p.x < b.x + b.w / 2 &&
                            p.y > b.y - b.h / 2 && p.y < b.y + b.h / 2) {
                            b.applyDamage(p.dmg, p.ownerId);
                            this.impact(p, prevX, prevY);
                            dead = true;
                            break;
                        }
                    }
                    if (dead) break;
                }
                // hit fighters
                for (const f of this.host.fighters) {
                    if (!f.alive || f.ref.id === p.ownerId) continue;
                    if (p.x > f.x - f.w / 2 - 4 && p.x < f.x + f.w / 2 + 4 &&
                        p.y > f.y - f.h / 2 - 4 && p.y < f.y + f.h / 2 + 4) {
                        this.impact(p, prevX, prevY);
                        dead = true;
                        break;
                    }
                }
            }

            if (!dead) {
                p.trail.push({ x: p.x, y: p.y });
                if (p.trail.length > 7) p.trail.shift();
                const g = p.g;
                g.clear();
                p.tmp.r = p.color.r; p.tmp.g = p.color.g; p.tmp.b = p.color.b;
                // soft glow halo
                p.tmp.a = 60;
                g.fillColor = p.tmp;
                g.circle(p.x, p.y, p.splash > 0 ? 15 : 10);
                g.fill();
                // fading trail — alpha and width grow toward the head
                if (p.trail.length > 1) {
                    for (let t = 1; t < p.trail.length; t++) {
                        const f = t / (p.trail.length - 1);
                        p.tmp.a = Math.round(120 * f);
                        g.strokeColor = p.tmp;
                        g.lineWidth = 1 + 2.5 * f;
                        g.moveTo(p.trail[t - 1].x, p.trail[t - 1].y);
                        g.lineTo(p.trail[t].x, p.trail[t].y);
                        g.stroke();
                    }
                }
                // bright core
                p.tmp.a = 240;
                g.fillColor = p.tmp;
                g.circle(p.x, p.y, p.splash > 0 ? 9 : 4.5);
                g.fill();
                p.node.setPosition(0, 0, 0); // graphics drawn in world coords under root
            }
        }
    }

    private impact(p: PState, px: number, py: number) {
        if (p.splash > 0) {
            for (const f of this.host.fighters) {
                if (!f.alive) continue;
                const cx = f.x, cy = f.y;
                const d = Math.hypot(cx - p.x, cy - p.y);
                if (d < p.splash) {
                    const falloff = 1 - d / p.splash * 0.6;
                    f.applyDamage(Math.round(p.dmg * falloff), p.ownerId, p.y, true);
                }
            }
            if (this.host.barrels) {
                for (const b of this.host.barrels) {
                    if (!b.alive) continue;
                    const d = Math.hypot(b.x - p.x, b.y - p.y);
                    if (d < p.splash) {
                        b.applyDamage(Math.round(p.dmg * (1 - d / p.splash * 0.5)), p.ownerId);
                    }
                }
            }
            this.host.onSplash(p.x, p.y);
        } else {
            // nearest fighter within small radius of impact point takes direct hit (checks headshot)
            for (const f of this.host.fighters) {
                if (!f.alive || f.ref.id === p.ownerId) continue;
                if (Math.abs(f.x - p.x) < f.w / 2 + 8 && Math.abs(f.y - p.y) < f.h / 2 + 8) {
                    f.applyDamage(p.dmg, p.ownerId, p.y, false);
                    break;
                }
            }
        }
        void px; void py;
        // sparks at the exact impact point
        this.fx?.burst({
            x: p.x, y: p.y, count: 6, speed: 250, size: 3,
            life: 0.28, color: p.color,
        });
        this.explodeFx(p);
    }

    private explodeFx(p: PState) {
        if (this.fx) {
            this.fx.explosion(p.x, p.y, Math.max(70, p.splash > 0 ? p.splash : 44));
            return;
        }
        // legacy fallback (no Effects attached)
        const fx = new Node('fx');
        this.root.addChild(fx);
        ensureUT(fx);
        const g = fx.addComponent(Graphics);
        const r = p.splash > 0 ? p.splash : 26;
        g.fillColor = new Color(255, 160, 40, 200);
        g.circle(p.x, p.y, r);
        g.fill();
        this.fxs.push({ node: fx, t: 0.25 });
    }

    private fxs: { node: Node; t: number }[] = [];

    tickFx(dt: number) {
        for (let i = this.fxs.length - 1; i >= 0; i--) {
            const f = this.fxs[i];
            f.t -= dt;
            if (f.t <= 0) {
                f.node.destroy();
                this.fxs.splice(i, 1);
            }
        }
    }

    private retire(i: number) {
        const p = this.live[i];
        p.node.active = false;
        this.live.splice(i, 1);
        this.free.push(p);
    }

    clear() {
        for (let i = this.live.length - 1; i >= 0; i--) this.retire(i);
        for (const f of this.fxs) f.node.destroy();
        this.fxs.length = 0;
    }

    /** Flat [x,y,x,y,...] of live projectiles — used for LAN snapshots. */
    liveCoords(): number[] {
        const out: number[] = [];
        for (const p of this.live) {
            out.push(Math.round(p.x), Math.round(p.y));
        }
        return out;
    }
}
