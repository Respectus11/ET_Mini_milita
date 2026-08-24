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

export interface ProjectileHost {
    world: TileWorld;
    fighters: FighterRef[];
    onSplash(x: number, y: number): void;
}

export interface FighterRef {
    x: number; y: number; w: number; h: number;
    alive: boolean;
    ownerId: number;
    ref: any;
    applyDamage(dmg: number, killerId: number): boolean;
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
}

export class ProjectileSystem {
    private live: PState[] = [];
    private free: PState[] = [];

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
            color: new Color(255, 255, 0), trail: [],
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
                if (p.trail.length > 6) p.trail.shift();
                p.g.clear();
                p.g.fillColor = p.color;
                p.g.circle(p.x, p.y, p.splash > 0 ? 9 : 5);
                p.g.fill();
                p.g.strokeColor = new Color(p.color.r, p.color.g, p.color.b, 110);
                p.g.lineWidth = 3;
                if (p.trail.length > 1) {
                    p.g.moveTo(p.trail[0].x, p.trail[0].y);
                    for (let t = 1; t < p.trail.length; t++) p.g.lineTo(p.trail[t].x, p.trail[t].y);
                    p.g.stroke();
                }
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
                    f.applyDamage(Math.round(p.dmg * falloff), p.ownerId);
                }
            }
            this.host.onSplash(p.x, p.y);
        } else {
            // nearest fighter within small radius of impact point takes direct hit
            for (const f of this.host.fighters) {
                if (!f.alive || f.ref.id === p.ownerId) continue;
                if (Math.abs(f.x - p.x) < f.w / 2 + 8 && Math.abs(f.y - p.y) < f.h / 2 + 8) {
                    f.applyDamage(p.dmg, p.ownerId);
                    break;
                }
            }
        }
        void px; void py;
        this.explodeFx(p);
    }

    private explodeFx(p: PState) {
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
