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
import { Effects } from '../world/Effects';
import { t } from '../data/Strings';

@ccclass('WeaponCrate')
export class WeaponCrate extends Component {
    x = 0; y = 0;
    taken = false;
    respawnT = 0;
    /** Weapon this crate will drop — rolled on spawn so its ring can advertise it. */
    loot: WeaponId = WeaponId.RIFLE;

    private g: Graphics = null!;
    /** World VFX (set by MatchManager); null-safe. */
    fx: Effects | null = null;
    private age = 0;

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

    /** Ring + beam + bullet pictogram tinted with the loot weapon's accent. */
    private draw() {
        const g = this.g;
        g.clear();
        // NOTE: bobbing happens via node position in tick(); this is drawn
        // once per state change (loot roll / respawn), never per frame.
        const bob = 0;
        const acc = weaponAccent(WEAPONS[this.loot]);

        // loot beam — a soft light column advertising the weapon
        g.fillColor = new Color(acc.r, acc.g, acc.b, 36);
        g.rect(-7, 30 + bob, 14, 96);
        g.fill();

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
        // juice: weapon-colored ring + spark pop
        const acc = weaponAccent(WEAPONS[this.loot]);
        this.fx?.ring({ x: this.x, y: this.y + 26, r0: 22, r1: 52, life: 0.3, color: acc, width: 5 });
        this.fx?.burst({ x: this.x, y: this.y + 26, count: 9, speed: 280, size: 4, color: acc, life: 0.4 });
        this.fx?.floatText(this.x, this.y + 66, t(this.lootNameKey()), acc, 26);
        return true;
    }

    tick(dt: number) {
        if (!this.taken) {
            this.age += dt;
            // bob + a slow pulse on the loot beam scale via node y only
            this.node.setPosition(this.x,
                this.y + Math.sin(this.age * 4 + this.x * 0.05) * 3, 0);
            return;
        }
        this.respawnT -= dt;
        if (this.respawnT <= 0) {
            this.taken = false;
            this.rollLoot();
            this.node.active = true;
            this.draw();
            this.fx?.ring({
                x: this.x, y: this.y + 26, r0: 6, r1: 36,
                life: 0.32, color: weaponAccent(WEAPONS[this.loot]), width: 4,
            });
        }
    }

    private lootNameKey(): string { return WEAPONS[this.loot].nameKey; }
}
