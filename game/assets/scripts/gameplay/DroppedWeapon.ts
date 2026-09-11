/**
 * DroppedWeapon.ts
 * ---------------------------------------------------------------------------
 * An in-world weapon dropped upon a fighter's death.
 *
 * Simulates simple gravity and tile-solid landing, draws the weapon sprite
 * with an accent halo, flashes before expiring, and can be collected by any
 * live fighter passing over it.
 */
import { _decorator, Color, Component, Graphics, Node } from 'cc';
const { ccclass } = _decorator;
import { CFG } from '../core/GameConfig';
import { WeaponDef } from '../data/Weapons';
import { Fighter } from './Fighter';
import { drawGun, weaponAccent } from './GunArt';
import { TileWorld } from '../world/TileWorld';
import { Effects } from '../world/Effects';
import { ensureUT } from '../core/UIUtil';
import { clamp } from '../core/Utils';
import { t } from '../data/Strings';

@ccclass('DroppedWeapon')
export class DroppedWeapon extends Component {
    weapon!: WeaponDef;
    x = 0;
    y = 0;
    vx = 0;
    vy = 0;
    angle = 0;
    vRot = 0;
    life = 18;      // 18 seconds before despawn
    maxLife = 18;
    collected = false;

    private world: TileWorld = null!;
    private g: Graphics = null!;
    fx: Effects | null = null;
    private grounded = false;

    setup(w: WeaponDef, x: number, y: number, vx: number, vy: number, world: TileWorld, fx: Effects | null) {
        this.weapon = w;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.world = world;
        this.fx = fx;
        this.life = 18;
        this.maxLife = 18;
        this.collected = false;
        this.grounded = false;
        this.angle = (Math.random() - 0.5) * 0.4;
        this.vRot = (Math.random() - 0.5) * 6;

        ensureUT(this.node);
        if (!this.g) this.g = this.node.addComponent(Graphics);
        this.node.setPosition(x, y, 0);
        this.node.active = true;
        this.redraw();
    }

    private redraw() {
        if (!this.g || !this.weapon) return;
        const g = this.g;
        g.clear();

        // soft accent halo under the gun
        const acc = weaponAccent(this.weapon);
        const blink = this.life < 4 ? (Math.sin(this.life * 14) > 0 ? 0.3 : 1) : 1;
        const alpha = Math.round(70 * blink);

        g.fillColor = new Color(acc.r, acc.g, acc.b, alpha);
        g.circle(12, 0, 24);
        g.fill();

        // draw weapon vector art
        drawGun(g, this.weapon, 0);
    }

    tick(dt: number): boolean {
        if (this.collected) return false;
        this.life -= dt;
        if (this.life <= 0) {
            this.despawn();
            return false;
        }

        // physics integration
        if (!this.grounded) {
            this.vy -= CFG.GRAVITY * 0.7 * dt;
            this.vx *= Math.pow(0.92, dt * 60);
            this.angle += this.vRot * dt;
            this.vRot *= Math.pow(0.94, dt * 60);

            const nextX = this.x + this.vx * dt;
            const nextY = this.y + this.vy * dt;

            // check world floor collision
            if (this.world && this.world.solidAtWorld(nextX, nextY - 8)) {
                this.grounded = true;
                this.vy = 0;
                this.vx = 0;
                this.vRot = 0;
                this.angle = 0;
            } else {
                this.x = nextX;
                this.y = nextY;
            }
        }

        // update node transform
        this.node.setPosition(this.x, this.y, 0);
        this.node.setRotationFromEuler(0, 0, (this.angle * 180) / Math.PI);

        // flash when nearing despawn
        if (this.life < 4) {
            this.redraw();
        }

        return true;
    }

    tryTake(f: Fighter): boolean {
        if (this.collected || !f.alive) return false;
        const dx = f.x - this.x;
        const dy = f.y - this.y;
        if (Math.abs(dx) > 42 || Math.abs(dy) > 48) return false;

        this.collected = true;
        f.giveWeapon(this.weapon);

        const acc = weaponAccent(this.weapon);
        this.fx?.burst({
            x: this.x, y: this.y,
            count: 8, speed: 220, size: 3.5,
            color: acc, life: 0.35,
        });
        this.fx?.floatText(this.x, this.y + 40, t(this.weapon.nameKey), acc, 24);

        this.node.destroy();
        return true;
    }

    private despawn() {
        this.collected = true;
        this.fx?.puff(this.x, this.y, 2, new Color(150, 150, 150, 120), 25);
        this.node.destroy();
    }
}
