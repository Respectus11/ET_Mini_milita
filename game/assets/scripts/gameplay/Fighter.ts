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
import { WeaponDef, WEAPONS, WeaponId } from '../data/Weapons';
import { drawGun, weaponByIndex } from './GunArt';
import { drawFighterRig } from '../core/FighterArt';
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

    // power-up state (buna / injera / mesob pickups)
    speedT = 0;      // seconds of buna move-speed boost remaining
    shieldHp = 0;    // damage the mesob shield can still absorb
    shieldT = 0;     // seconds until the mesob shield expires

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
    private gunNode: Node = null!;
    private gunG: Graphics = null!;
    private muzzleT = 0;              // counts down the flash/kick window
    private static FLASH_T = 0.07;
    private gunBaseX = 0;
    /** Last rendered overlay state (invuln blink phase / shield presence). */
    private lastBlink = -1;
    private lastShieldOn = false;

    init(char: CharacterDef, world: TileWorld) {
        this.char = char;
        this.world = world;

        ensureUT(this.node);
        this.bodyG = this.node.addComponent(Graphics);
        this.drawSelf();

        // dedicated layer so gun redraws never touch body vector ops
        ensureUT(this.node);
        this.gunNode = new Node('gun');
        this.node.addChild(this.gunNode);
        ensureUT(this.gunNode);
        this.gunG = this.gunNode.addComponent(Graphics);
        this.gunBaseX = this.w * 0.06;
        this.gunNode.setPosition(this.gunBaseX, -this.h * 0.02, 0);
        this.drawGunLayer(0);
    }

    private drawSelf() {
        // Rig drawing lives in core/FighterArt so the menu's outfit editor
        // preview renders the exact same look (the held weapon stays on its
        // own GunArt layer drawn by init()).
        drawFighterRig(this.bodyG, this.char, this.w, this.h, this.faceDir);

        const g = this.bodyG;
        if (this.shieldHp > 0) {
            // mesob shield: ring around the whole body
            g.lineWidth = 4;
            g.strokeColor = new Color(64, 196, 255, 170);
            g.circle(0, 0, Math.max(this.w, this.h) * 0.72);
            g.stroke();
        }
        if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) {
            g.lineWidth = 3;
            g.strokeColor = new Color(255, 255, 255, 140);
            g.rect(-this.w * 0.7, -this.h * 0.6, this.w * 1.4, this.h * 1.2);
            g.stroke();
        }
        this.lastBlink = this.blinkPhase();
        this.lastShieldOn = this.shieldHp > 0;
    }

    /** Overlay state fingerprint; body only repaints when this changes. */
    private blinkPhase(): number {
        return this.invuln > 0 ? Math.floor(this.invuln * 12) % 2 : -1;
    }

    /** Redraws the body only when invuln/shield visuals actually changed. */
    private refreshOverlay() {
        const phase = this.blinkPhase();
        const shieldOn = this.shieldHp > 0;
        if (phase !== this.lastBlink || shieldOn !== this.lastShieldOn) {
            this.drawSelf();
        }
    }

    spawnAt(x: number, y: number) {
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.hp = CFG.MAX_HP;
        this.alive = true;
        this.fuel = CFG.JETPACK_MAX_FUEL;
        this.speedT = 0; this.shieldHp = 0; this.shieldT = 0;
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
        if (!this.alive || this.invuln > 0 || dmg <= 0) return false;
        // mesob shield soaks damage first
        if (this.shieldHp > 0) {
            const absorbed = Math.min(this.shieldHp, dmg);
            this.shieldHp -= absorbed;
            dmg -= absorbed;
            if (this.shieldHp <= 0) { this.shieldHp = 0; this.shieldT = 0; }
            this.drawSelf();
        }
        if (dmg <= 0) return true;
        this.hp -= dmg;
        bus.emit(Evt.HP_CHANGED, this.id, Math.max(0, this.hp), this.teamLabel);
        if (this.hp <= 0) {
            this.die(killerId);
        }
        return true;
    }

    /** Restores HP up to the cap (injera pack). */
    heal(amount: number) {
        if (!this.alive || amount <= 0) return;
        this.hp = Math.min(CFG.MAX_HP, this.hp + amount);
        bus.emit(Evt.HP_CHANGED, this.id, this.hp, this.teamLabel);
    }

    giveWeapon(def: WeaponDef) {
        this.weapon = def;
        this.ammo = def.magSize;
        this.reloading = false;
        this.drawGunLayer(this.muzzleT > 0 ? this.muzzleT / Fighter.FLASH_T : 0);
        bus.emit(Evt.WEAPON_CHANGED, this.id, def.id);
        bus.emit(Evt.AMMO_CHANGED, this.id, this.ammo, def.magSize);
    }

    /** Swap only the art/wire weapon — keeps live ammo & reload state. */
    setWeaponVisual(def: WeaponDef) {
        if (this.weapon.id === def.id) return;
        this.weapon = def;
        this.drawGunLayer(0);
    }

    /** Redraws the gun layer; flash01 (0..1] adds the muzzle star + kick. */
    private drawGunLayer(flash01: number) {
        if (!this.gunG || !this.weapon.visual) return;
        drawGun(this.gunG, this.weapon, flash01);
        const kick = flash01 * 6;
        this.gunNode.setPosition(this.gunBaseX - kick, -this.h * 0.02, 0);
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
        this.muzzleT = Fighter.FLASH_T;
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
            const speedMult = this.speedT > 0 ? CFG.BUNA_SPEED_MULT : 1;
            const targetVx = this.moveIn.mx * CFG.MOVE_SPEED * speedMult;
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
        if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
        if (this.speedT > 0) this.speedT = Math.max(0, this.speedT - dt);
        if (this.shieldT > 0) {
            this.shieldT = Math.max(0, this.shieldT - dt);
            if (this.shieldT === 0) this.shieldHp = 0;
        }
        this.refreshOverlay();
        if (this.muzzleT > 0) {
            this.muzzleT = Math.max(0, this.muzzleT - dt);
            this.drawGunLayer(this.muzzleT / Fighter.FLASH_T);
            if (this.muzzleT === 0) this.drawGunLayer(0); // clean idle pose
        }
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
                        al: number; am: number; rl: number; sp: number;
                        sh: number; wp?: number }) {
        const wasAlive = this.alive;
        this.x = s.x; this.y = s.y;
        this.faceDir = s.fc;
        this.hp = s.hp;
        this.fuel = s.fu;
        this.ammo = s.am;
        this.reloading = !!s.rl;
        this.speedT = s.sp;
        if (s.wp !== undefined) this.setWeaponVisual(weaponByIndex(s.wp));
        const shieldChanged = this.shieldHp !== s.sh;
        this.shieldHp = s.sh;
        this.alive = !!s.al;
        if (this.alive && !wasAlive) this.invuln = 0.4;
        this.node.active = this.alive;
        this.syncNode();
        if (shieldChanged || wasAlive !== this.alive) this.drawSelf();
    }
}
