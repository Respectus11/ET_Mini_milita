/**
 * Grenade.ts
 * ---------------------------------------------------------------------------
 * Classic Mini Militia throwable hand grenade.
 * Bounces against terrain and platforms, features an escalating LED blink
 * fuse timer with procedural warning audio, and detonates in a high-damage
 * shrapnel blast that can trigger explosive chain reactions.
 */
import { Color, Graphics, Node } from 'cc';
import { CFG } from '../core/GameConfig';
import { ensureUT } from '../core/UIUtil';
import { TileWorld } from '../world/TileWorld';
import { Effects } from '../world/Effects';
import { Sfx } from '../core/Audio';

export class Grenade {
    node: Node;
    g: Graphics;
    x = 0; y = 0;
    vx = 0; vy = 0;
    w = 14; h = 14;
    rot = 0;
    fuse = 2.2;
    active = false;
    ownerId = 0;
    fx: Effects | null = null;

    private blinkTimer = 0;
    private blinkInterval = 0.45;
    private isLedOn = false;

    constructor(parent: Node) {
        this.node = new Node('grenade');
        parent.addChild(this.node);
        ensureUT(this.node);
        this.g = this.node.addComponent(Graphics);
        this.node.active = false;
    }

    spawn(ownerId: number, x: number, y: number, vx: number, vy: number, fx: Effects | null) {
        this.ownerId = ownerId;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.rot = Math.random() * Math.PI * 2;
        this.fuse = 2.2;
        this.blinkTimer = 0.35;
        this.blinkInterval = 0.45;
        this.isLedOn = false;
        this.fx = fx;
        this.active = true;
        this.node.active = true;
        this.node.setPosition(x, y, 0);
        Sfx.playGrenadePin();
        this.draw();
    }

    tick(dt: number, world: TileWorld, onDetonate: (g: Grenade) => void) {
        if (!this.active) return;
        this.fuse -= dt;
        if (this.fuse <= 0) {
            this.explode(onDetonate);
            return;
        }

        // Fuse blinking: interval compresses exponentially as timer elapses
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
            this.isLedOn = !this.isLedOn;
            const progress = 1 - (this.fuse / 2.2);
            this.blinkInterval = Math.max(0.06, 0.45 * Math.pow(1 - progress, 1.4));
            this.blinkTimer = this.blinkInterval;
            if (this.isLedOn) {
                Sfx.playGrenadeFuse(this.fuse < 0.6);
            }
        }

        // Gravity and drag
        this.vy -= CFG.GRAVITY * 0.85 * dt;
        this.vx *= Math.pow(0.98, dt * 60);

        // Swept axis-by-axis physics with bounce restitution
        const prevVx = this.vx;
        const prevVy = this.vy;
        const [hitX, hitY, landed] = world.moveBody(this as any, this.vx * dt, this.vy * dt, false);

        if (hitX) {
            this.vx = -prevVx * 0.55;
            this.rot += (Math.random() - 0.5) * 2;
            if (Math.abs(prevVx) > 50) Sfx.playGrenadeBounce();
        }

        if (hitY || landed) {
            this.vy = -prevVy * 0.45;
            this.vx *= 0.82; // floor friction
            if (Math.abs(prevVy) > 60) Sfx.playGrenadeBounce();
            if (Math.abs(this.vy) < 30) this.vy = 0;
        }

        this.rot += this.vx * dt * 0.05;
        this.node.setPosition(this.x, this.y, 0);
        this.draw();
    }

    explode(onDetonate: (g: Grenade) => void) {
        if (!this.active) return;
        this.active = false;
        this.node.active = false;

        // Visual effects
        if (this.fx) {
            this.fx.explosion(this.x, this.y, 140);
            this.fx.burst({
                x: this.x, y: this.y,
                count: 16,
                speed: 400,
                size: 3.5,
                life: 0.5,
                color: new Color(255, 180, 50, 255),
            });
            this.fx.puff(this.x, this.y, 3, new Color(80, 80, 80, 200), 50);
        }
        Sfx.playExplosion();

        onDetonate(this);
    }

    private draw() {
        const g = this.g;
        g.clear();

        // Save transform angle rotation
        const cos = Math.cos(this.rot);
        const sin = Math.sin(this.rot);

        const tx = (lx: number, ly: number): [number, number] => [
            lx * cos - ly * sin,
            lx * sin + ly * cos,
        ];

        // Grenade body: olive drab pineapple segmented shape
        g.fillColor = new Color(74, 94, 52, 255);
        const [c0x, c0y] = tx(0, 0);
        g.circle(c0x, c0y, 7);
        g.fill();

        // Dark segmented ridges
        g.strokeColor = new Color(42, 56, 30, 255);
        g.lineWidth = 1.8;
        const [l1x, l1y] = tx(-6, 0);
        const [r1x, r1y] = tx(6, 0);
        g.moveTo(l1x, l1y);
        g.lineTo(r1x, r1y);
        g.stroke();

        const [t1x, t1y] = tx(0, -6);
        const [b1x, b1y] = tx(0, 6);
        g.moveTo(t1x, t1y);
        g.lineTo(b1x, b1y);
        g.stroke();

        // Safety pin bracket on top
        g.fillColor = new Color(130, 130, 130, 255);
        const [p1x, p1y] = tx(-2, 7);
        const [p2x, p2y] = tx(3, 9);
        g.rect(p1x, p1y, 4, 3);
        g.fill();

        // Glowing red fuse LED
        if (this.isLedOn) {
            // Bright red glow halo
            g.fillColor = new Color(255, 20, 20, 120);
            g.circle(c0x, c0y, 6);
            g.fill();
            // Blinding core
            g.fillColor = new Color(255, 240, 240, 255);
            g.circle(c0x, c0y, 2.5);
            g.fill();
        } else {
            g.fillColor = new Color(120, 20, 20, 200);
            g.circle(c0x, c0y, 2);
            g.fill();
        }
    }
}
