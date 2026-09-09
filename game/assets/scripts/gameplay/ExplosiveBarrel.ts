/**
 * ExplosiveBarrel.ts
 * ---------------------------------------------------------------------------
 * Classic red explosive drum placed across battlefields.
 * Detonates when shot, struck by grenades, or caught in adjacent blasts.
 * Deals high area damage and creates exciting chain reactions.
 * Respawns after a timer to keep arenas dynamic.
 */
import { Color, Component, Graphics, Node, _decorator } from 'cc';
const { ccclass } = _decorator;
import { ensureUT } from '../core/UIUtil';
import { Effects } from '../world/Effects';
import { Sfx } from '../core/Audio';

@ccclass('ExplosiveBarrel')
export class ExplosiveBarrel extends Component {
    x = 0; y = 0;
    w = 28; h = 38;
    maxHp = 25;
    hp = 25;
    alive = true;
    respawnTimer = 0;
    private static RESPAWN_DELAY = 14;

    private g!: Graphics;
    private fx: Effects | null = null;
    private smokeAcc = 0;
    private lastKillerId = 0;

    onDetonate: ((b: ExplosiveBarrel, killerId: number) => void) | null = null;

    init(x: number, y: number, fx: Effects | null) {
        this.x = x;
        this.y = y;
        this.fx = fx;
        this.node.setPosition(x, y, 0);
        ensureUT(this.node);
        this.g = this.node.addComponent(Graphics);
        this.reset();
    }

    reset() {
        this.hp = this.maxHp;
        this.alive = true;
        this.respawnTimer = 0;
        this.node.active = true;
        this.draw();
    }

    applyDamage(dmg: number, attackerId = 0): boolean {
        if (!this.alive || dmg <= 0) return false;
        this.hp -= dmg;
        this.lastKillerId = attackerId;

        // Sparks on hit
        this.fx?.burst({
            x: this.x, y: this.y,
            count: 5, speed: 200, size: 2.5, life: 0.25,
            color: new Color(255, 200, 50, 255),
        });

        if (this.hp <= 0) {
            this.detonate(attackerId);
        } else {
            this.draw();
        }
        return true;
    }

    detonate(killerId = this.lastKillerId) {
        if (!this.alive) return;
        this.alive = false;
        this.node.active = false;
        this.respawnTimer = ExplosiveBarrel.RESPAWN_DELAY;

        // Audio & Visual blast
        Sfx.playBarrelExplode();
        if (this.fx) {
            this.fx.explosion(this.x, this.y, 160);
            this.fx.burst({
                x: this.x, y: this.y,
                count: 22,
                speed: 460,
                size: 4,
                life: 0.6,
                color: new Color(255, 120, 20, 255),
            });
            this.fx.puff(this.x, this.y, 4, new Color(50, 50, 50, 220), 65);
        }

        if (this.onDetonate) {
            this.onDetonate(this, killerId);
        }
    }

    tick(dt: number) {
        if (!this.alive) {
            this.respawnTimer -= dt;
            if (this.respawnTimer <= 0) {
                this.reset();
                if (this.fx) {
                    this.fx.puff(this.x, this.y, 2, new Color(200, 200, 200, 180), 30);
                }
            }
            return;
        }

        // Heavy smoke when critically damaged
        if (this.hp < 12) {
            this.smokeAcc += dt;
            if (this.smokeAcc > 0.12) {
                this.smokeAcc = 0;
                this.fx?.puff(this.x + (Math.random() - 0.5) * 10, this.y + this.h / 2, 1, new Color(60, 60, 60, 210), 20);
            }
        }
    }

    private draw() {
        const g = this.g;
        g.clear();
        const hw = this.w / 2;
        const hh = this.h / 2;

        // Barrel main body: crimson red cylinder
        g.fillColor = new Color(211, 47, 47, 255);
        g.roundRect(-hw, -hh, this.w, this.h, 4);
        g.fill();

        // Dark industrial metal rims
        g.fillColor = new Color(55, 71, 79, 255);
        g.rect(-hw, hh - 4, this.w, 4);
        g.rect(-hw, -hh, this.w, 4);
        g.rect(-hw, -2, this.w, 4);
        g.fill();

        // Yellow hazard warning stripe across center
        g.fillColor = new Color(255, 214, 0, 255);
        g.rect(-hw, -hh + 10, this.w, 8);
        g.fill();

        // Diagonal black warning slashes
        g.fillColor = new Color(33, 33, 33, 255);
        for (let x = -hw + 2; x < hw; x += 8) {
            g.moveTo(x, -hh + 10);
            g.lineTo(x + 4, -hh + 10);
            g.lineTo(x + 2, -hh + 18);
            g.lineTo(x - 2, -hh + 18);
            g.close();
            g.fill();
        }

        // Crack decals if damaged
        if (this.hp < this.maxHp) {
            g.strokeColor = new Color(255, 235, 59, 220);
            g.lineWidth = 1.5;
            g.moveTo(-4, 2);
            g.lineTo(2, 8);
            g.lineTo(-1, 14);
            g.stroke();
        }
    }
}
