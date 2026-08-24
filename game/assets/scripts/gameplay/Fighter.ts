/**
 * Fighter.ts
 * ---------------------------------------------------------------------------
 * One combatant — used unchanged for human players and bots. Owns:
 *   - the kinematic body (x/y/vx/vy + AABB) driven by TileWorld.moveBody
 *   - jetpack fuel economy (drain on thrust, delayed regen)
 *   - weapon state: magazine, reload cycle, fire cooldown
 *   - brief spawn invulnerability so nobody dies the instant they appear
 *
 * Movement is intent-based: controllers (touch, keyboard, AI) only fill in
 * moveIn/aimIn each frame; tick() turns that intent into physics. This keeps
 * every input source interchangeable.
 */
import { _decorator, Color, Component, Graphics, Node } from 'cc';
const { ccclass } = _decorator;
import { CFG } from '../core/GameConfig';
import { clamp } from '../core/Utils';
import { ensureUT } from '../core/UIUtil';
import { CharacterDef } from '../data/Characters';
import { WeaponDef, WeaponId, WEAPONS } from '../data/Weapons';
import { TileWorld } from '../world/TileWorld';
import { bus, Evt } from '../core/EventBus';

/** Locomotion intent for one frame (set by a controller or the AI). */
export interface MoveInput {
    mx: number;        // -1..1 horizontal desire
    jet: boolean;      // thrust jetpack this frame
    dropDown: boolean; // fall through one-way platforms
}

/** Aiming intent; ax/ay is a normalized direction vector. */
export interface AimInput {
    aiming: boolean;
    ax: number; ay: number;
}

let NEXT_ID = 1;

@ccclass('Fighter')
export class Fighter extends Component {
    id = NEXT_ID++;
    isBot = false;
    teamLabel = 'P1';

    char!: CharacterDef;

    // physics body
    x = 0; y = 0; w = CFG.PLAYER_W; h = CFG.PLAYER_H;
    vx = 0; vy = 0;
    grounded = false;
    faceDir = 1;

    // combat state
    hp = CFG.MAX_HP;
    alive = true;
    invuln = 0;

    // jetpack
    fuel = CFG.JETPACK_MAX_FUEL;
    fuelDelay = 0;

    // weapon
    weapon: WeaponDef = WEAPONS[WeaponId.RIFLE];
    ammo = 30;
    reloading = false;
    reloadT = 0;
    fireCd = 0;
    meleeCd = 0;

    kills = 0;

    moveIn: MoveInput = { mx: 0, jet: false, dropDown: false };
    aimIn: AimInput = { aiming: false, ax: 1, ay: 0 };

    /** True on remote-view copies (LAN guest): suppresses local firing. */
    netGhost = false;

    world!: TileWorld;
    onShoot: ((f: Fighter) => void) | null = null;
    onMelee: ((f: Fighter) => void) | null = null;

    private g: Graphics | null = null;
    private bodyG: Graphics = null!;

    init(char: CharacterDef, world: TileWorld) {
        this.char = char;
        this.world = world;

        ensureUT(this.node);
        this.bodyG = this.node.addComponent(Graphics);
        this.drawSelf();
    }

    private drawSelf() {
        const g = this.bodyG;
        g.clear();
        const w = this.w, h = this.h;
        // legs
        g.fillColor = new Color(40, 40, 48);
        g.rect(-w * 0.38, -h / 2, w * 0.28, h * 0.34);
        g.fill();
        g.rect(w * 0.10, -h / 2, w * 0.28, h * 0.34);
        g.fill();
        // torso
        g.fillColor = this.char.body;
        g.roundRect(-w / 2, -h * 0.18, w, h * 0.52, 8);
        g.fill();
        // scarf accent
        g.fillColor = this.char.accent;
        g.roundRect(-w / 2, h * 0.16, w, h * 0.14, 5);
        g.fill();
        // head
        g.fillColor = this.char.skin;
        g.circle(0, h * 0.30, w * 0.34);
        g.fill();
        // helmet
        g.fillColor = new Color(50, 50, 60);
        g.arc(0, h * 0.30, w * 0.36, Math.PI * 0.05, Math.PI * 0.95, false);
        g.fill();
        g.fillRect(-w * 0.36, h * 0.27, w * 0.72, h * 0.07);
        // eye
        g.fillColor = new Color(255, 255, 255);
        g.circle(this.faceDir * w * 0.16, h * 0.29, w * 0.08);
        g.fill();
        g.fillColor = new Color(20, 20, 20);
        g.circle(this.faceDir * w * 0.19, h * 0.29, w * 0.04);
        g.fill();
        // gun
        g.fillColor = new Color(55, 55, 65);
        g.rect(w * 0.1, -h * 0.02, w * 0.85, 9);
        g.fill();

        if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) {
            g.lineWidth = 3;
            g.strokeColor = new Color(255, 255, 255, 140);
            g.rect(-w * 0.7, -h * 0.6, w * 1.4, h * 1.2);
            g.stroke();
        }
    }

    spawnAt(x: number, y: number) {
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.hp = CFG.MAX_HP;
        this.alive = true;
        this.fuel = CFG.JETPACK_MAX_FUEL;
        this.invuln = CFG.INVULN_AFTER_SPAWN;
        this.node.active = true;
        this.syncNode();
        this.drawSelf();
        bus.emit(Evt.HP_CHANGED, this.id, this.hp, this.teamLabel);
    }

    die(killerId: number) {
        if (!this.alive) return;
        this.alive = false;
        this.node.active = false;
        bus.emit(Evt.FRAG, killerId, this.id);
    }

    applyDamage(dmg: number, killerId: number): boolean {
        if (!this.alive || this.invuln > 0) return false;
        this.hp -= dmg;
        bus.emit(Evt.HP_CHANGED, this.id, Math.max(0, this.hp), this.teamLabel);
        if (this.hp <= 0) {
            this.die(killerId);
        }
        return true;
    }

    giveWeapon(def: WeaponDef) {
        this.weapon = def;
        this.ammo = def.magSize;
        this.reloading = false;
        bus.emit(Evt.WEAPON_CHANGED, this.id, def.id);
        bus.emit(Evt.AMMO_CHANGED, this.id, this.ammo, def.magSize);
    }

    startReload() {
        if (this.reloading || this.ammo === this.weapon.magSize) return;
        this.reloading = true;
        this.reloadT = this.weapon.reloadTime;
    }

    canFire(): boolean {
        return this.alive && !this.reloading && this.fireCd <= 0 && this.ammo > 0;
    }

    tryFire() {
        if (this.netGhost) return;
        if (!this.canFire()) return;
        this.ammo--;
        this.fireCd = 1 / this.weapon.rof;
        this.vx -= this.faceDir * this.weapon.recoil * 0.15;
        bus.emit(Evt.AMMO_CHANGED, this.id, this.ammo, this.weapon.magSize);
        if (this.onShoot) this.onShoot(this);
        if (this.ammo <= 0) this.startReload();
    }

    tryMelee(target: Fighter) {
        if (!this.alive || this.meleeCd > 0) return;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        if (Math.sign(dx) === this.faceDir || Math.abs(dx) < 20) {
            if (Math.hypot(dx, dy) < CFG.MELEE_RANGE + target.w) {
                this.meleeCd = CFG.MELEE_CD;
                if (this.onMelee) this.onMelee(this);
            }
        }
    }

    tick(dt: number) {
        if (dt <= 0) return;
        this.tickTimers(dt);

        if (this.alive) {
            const targetVx = this.moveIn.mx * CFG.MOVE_SPEED;
            const accel = this.grounded ? 12 : 7;
            this.vx += (targetVx - this.vx) * Math.min(1, accel * dt);

            if (this.moveIn.jet && this.fuel > 0) {
                this.vy += CFG.JETPACK_THRUST * dt;
                this.fuel -= CFG.JETPACK_DRAIN * dt;
                this.fuelDelay = CFG.JETPACK_REGEN_DELAY;
                if (this.fuel < 0) this.fuel = 0;
            } else {
                if (this.fuelDelay > 0) this.fuelDelay -= dt;
                else {
                    this.fuel = Math.min(CFG.JETPACK_MAX_FUEL,
                        this.fuel + CFG.JETPACK_REGEN * dt * (this.grounded ? 1.6 : 1));
                }
                this.vy -= CFG.GRAVITY * dt;
            }
            this.vy = clamp(this.vy, -1900, 900);

            const [, , landed] = this.world.moveBody(
                this as any, this.vx * dt, this.vy * dt, this.moveIn.dropDown);
            if (landed) { this.vy = 0; this.grounded = true; }
            else this.grounded = false;
            if (this.moveIn.mx !== 0) this.faceDir = this.moveIn.mx > 0 ? 1 : -1;
        }

        this.syncNode();
    }

    private tickTimers(dt: number) {
        if (this.fireCd > 0) this.fireCd -= dt;
        if (this.meleeCd > 0) this.meleeCd -= dt;
        if (this.invuln > 0) this.invuln -= dt;
        if (this.reloading) {
            this.reloadT -= dt;
            if (this.reloadT <= 0) {
                this.reloading = false;
                this.ammo = this.weapon.magSize;
                bus.emit(Evt.AMMO_CHANGED, this.id, this.ammo, this.weapon.magSize);
            }
        }
    }

    syncNode() {
        const p = this.node.position;
        if (p.x !== this.x || p.y !== this.y) {
            this.node.setPosition(this.x, this.y, 0);
        }
        const wantScaleX = this.faceDir;
        if (this.node.scale.x !== wantScaleX) {
            this.node.setScale(wantScaleX, 1, 1);
        }
    }

    /**
     * LAN guest mode: adopt authoritative state from a host snapshot.
     * Visual-only — physics/AI never run on remote-view fighters.
     */
    applyNetState(s: { x: number; y: number; fc: number; hp: number; fu: number;
                        al: number; am: number; rl: number; sp: number; sh: number }) {
        const wasAlive = this.alive;
        this.x = s.x; this.y = s.y;
        this.faceDir = s.fc;
        this.hp = s.hp;
        this.fuel = s.fu;
        this.ammo = s.am;
        this.reloading = !!s.rl;
        this.speedT = s.sp;
        const shieldChanged = this.shieldHp !== s.sh;
        this.shieldHp = s.sh;
        this.alive = !!s.al;
        if (this.alive && !wasAlive) this.invuln = 0.4;
        this.node.active = this.alive;
        this.syncNode();
        if (shieldChanged || wasAlive !== this.alive) this.drawSelf();
    }
}
