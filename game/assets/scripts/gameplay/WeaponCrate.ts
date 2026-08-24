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
import { CRATE_POOL, WeaponId, WEAPONS } from '../data/Weapons';
import { ensureUT } from '../core/UIUtil';
import { weaponAccent } from './GunArt';

@ccclass('WeaponCrate')
export class WeaponCrate extends Component {
    x = 0; y = 0;
    taken = false;
    respawnT = 0;
    /** Weapon this crate will drop — rolled on spawn so its ring can advertise it. */
    loot: WeaponId = WeaponId.RIFLE;

    private g: Graphics = null!;

    setup(x: number, y: number) {
        this.x = x; this.y = y;
        this.taken = false;
        this.respawnT = 0;
        this.rollLoot();
        ensureUT(this.node);
        if (!this.g) this.g = this.node.addComponent(Graphics);
        this.node.setPosition(x, y, 0);
        this.node.active = true;
        this.draw();
    }

    /** Pick (or re-pick after respawn) the crate's advertised weapon. */
    private rollLoot() {
        this.loot = pick(CRATE_POOL);
    }

    /** Ring + bullet pictogram tinted with the loot weapon's accent. */
    private draw() {
        const g = this.g;
        g.clear();
        const bob = Math.sin(Date.now() / 300 + this.x) * 3;
        const acc = weaponAccent(WEAPONS[this.loot]);

        g.lineWidth = 3.5;
        g.strokeColor = acc;
        g.circle(0, 26 + bob, 22);
        g.stroke();
        const glow = new Color(acc.r, acc.g, acc.b, 55);
        g.fillColor = glow;
        g.circle(0, 26 + bob, 28);
        g.fill();

        // bullet shape
        g.fillColor = Color.WHITE;
        g.roundRect(-3, 20 + bob, 6, 13, 2); g.fill();
        g.circle(0, 33 + bob, 3); g.fill();
        // tiny weapon-silhouette bar under the bullet
        g.fillColor = acc;
        g.rect(-8, 17 + bob, 16, 3.5);
        g.fill();
    }

    /** Grants the crate's rolled weapon with a full magazine. */
    tryTake(f: Fighter): boolean {
        if (this.taken || !f.alive) return false;
        const dx = f.x - this.x, dy = f.y - (this.y + 26);
        if (Math.abs(dx) > 46 || Math.abs(dy) > 60) return false;
        f.giveWeapon(WEAPONS[this.loot]);
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
            this.rollLoot();
            this.node.active = true;
            this.draw();
        }
    }
}
