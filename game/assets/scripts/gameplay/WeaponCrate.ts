/**
 * WeaponCrate.ts
 * ---------------------------------------------------------------------------
 * A floating ammo cache placed on 'W' markers of a map. Touching it swaps in
 * a random weapon with a full magazine, then the crate disappears and
 * respawns after CFG.CRATE_RESPAWN seconds so map control stays contested.
 */
import { _decorator, Color, Component, Graphics, Node } from 'cc';
const { ccclass } = _decorator;
import { CFG } from '../core/GameConfig';
import { Fighter } from './Fighter';
import { pick } from '../core/Utils';
import { WeaponId, WEAPONS } from '../data/Weapons';
import { ensureUT } from '../core/UIUtil';

@ccclass('WeaponCrate')
export class WeaponCrate extends Component {
    x = 0; y = 0;
    taken = false;
    respawnT = 0;

    private g: Graphics = null!;

    setup(x: number, y: number) {
        this.x = x; this.y = y;
        this.taken = false;
        this.respawnT = 0;
        ensureUT(this.node);
        if (!this.g) this.g = this.node.addComponent(Graphics);
        this.node.setPosition(x, y, 0);
        this.node.active = true;
        this.draw();
    }

    /** Ring + bullet pictogram with a gentle idle bob. */
    private draw() {
        const g = this.g;
        g.clear();
        const bob = Math.sin(Date.now() / 300 + this.x) * 3;

        g.lineWidth = 3.5;
        g.strokeColor = new Color(255, 202, 40);
        g.circle(0, 26 + bob, 22);
        g.stroke();
        g.fillColor = new Color(255, 202, 40, 55);
        g.circle(0, 26 + bob, 28);
        g.fill();

        // bullet shape
        g.fillColor = new Color(255, 202, 40);
        g.roundRect(-3, 20 + bob, 6, 13, 2); g.fill();
        g.circle(0, 33 + bob, 3); g.fill();
        g.rect(-7, 18 + bob, 14, 3); g.fill();
    }

    /** Grants the toucher a random full-magazine weapon. */
    tryTake(f: Fighter): boolean {
        if (this.taken || !f.alive) return false;
        const dx = f.x - this.x, dy = f.y - (this.y + 26);
        if (Math.abs(dx) > 46 || Math.abs(dy) > 60) return false;
        f.giveWeapon(WEAPONS[pick([
            WeaponId.RIFLE, WeaponId.SHOTGUN, WeaponId.SNIPER, WeaponId.LAUNCHER,
        ])]);
        this.taken = true;
        this.respawnT = CFG.CRATE_RESPAWN;
        this.node.active = false;
        return true;
    }

    tick(dt: number) {
        if (!this.taken) { this.draw(); return; }
        this.respawnT -= dt;
        if (this.respawnT <= 0) {
            this.taken = false;
            this.node.active = true;
            this.draw();
        }
    }
}
