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
import { drawGun, drawDualGuns, weaponByIndex } from './GunArt';
import { drawFighterRig } from '../core/FighterArt';
import { TileWorld } from '../world/TileWorld';
import { Effects } from '../world/Effects';
import { Theme } from '../core/Theme';
import { bus, Evt } from '../core/EventBus';
import { Sfx } from '../core/Audio';

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

    // dual weapon system
    weapon2: WeaponDef | null = null;
    ammo2 = 0;
    reloading2 = false;
    reloadT2 = 0;
    private muzzleT2 = 0;
    private fireSlot = 0;

    // grenade system
    grenades = 3;
    grenadeCd = 0;
    onThrowGrenade: ((f: Fighter, vx: number, vy: number) => void) | null = null;

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

    // ---- juice state -------------------------------------------------------
    /** World VFX (set by MatchManager); null-safe for previews/tests. */
    fx: Effects | null = null;
    /** Guest-only hook: fires when a snapshot reports this fighter died. */
    onNetDeath: (() => void) | null = null;
    private static FLASH_HIT = 0.09;
    private flashT = 0;         // white hit-flash window
    private squash = 1;         // 1 = neutral; <1 squash on land, >1 stretch
    private dustT = 0;          // footstep dust accumulator
    private jetNode: Node = null!;
    private jetG: Graphics = null!;
    private jetWasOn = false;

    init(char: CharacterDef, world: TileWorld) {
        this.char = char;
        this.world = world;

        ensureUT(this.node);
        this.bodyG = this.node.addComponent(Graphics);
        this.drawSelf();

        // jetpack exhaust layer (redrawn only while thrusting)
        this.jetNode = new Node('jet');
        this.node.addChild(this.jetNode);
        ensureUT(this.jetNode);
        this.jetG = this.jetNode.addComponent(Graphics);
        this.jetNode.setPosition(-this.w * 0.12, -this.h * 0.02, 0);

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
        if (this.flashT > 0) {
            g.fillColor = new Color(255, 255, 255,
                Math.round(190 * this.flashT / Fighter.FLASH_HIT));
            g.circle(0, 0, Math.max(this.w, this.h) * 0.62);
            g.fill();
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

    die(killerId: number, isExplosion = false) {
        if (!this.alive) return;
        this.alive = false;
        this.node.active = false;
        // Gibs / equipment scattering on death
        if (this.fx) {
            this.fx.burst({
                x: this.x, y: this.y,
                count: isExplosion ? 24 : 14,
                speed: isExplosion ? 480 : 300,
                size: 4,
                life: 0.55,
                color: this.char.body,
            });
            this.fx.burst({
                x: this.x, y: this.y + this.h * 0.3,
                count: 8,
                speed: 350,
                size: 5,
                life: 0.65,
                color: this.char.accent,
            });
        }
        bus.emit(Evt.FRAG, killerId, this.id);
    }

    applyDamage(dmg: number, killerId: number, hitY?: number, isExplosive = false): boolean {
        if (!this.alive || this.invuln > 0 || dmg <= 0) return false;
        let isCrit = false;
        // Headshot detection: upper 35% of fighter height
        if (hitY !== undefined && hitY > this.y + this.h * 0.15) {
            dmg = Math.round(dmg * 1.75);
            isCrit = true;
        }

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
        this.flashT = Fighter.FLASH_HIT;
        this.drawSelf();
        if (isCrit) {
            Sfx.playHeadshot();
            this.fx?.burst({
                x: this.x, y: this.y + this.h * 0.4,
                count: 14, speed: 280, size: 3.5, life: 0.4,
                color: new Color(255, 215, 0, 255),
            });
            this.fx?.floatText(this.x, this.y + this.h * 0.6, 'HEADSHOT!', Theme.goldHi, 36);
        } else {
            Sfx.playHit();
        }
        bus.emit(Evt.HP_CHANGED, this.id, Math.max(0, this.hp), this.teamLabel);
        if (this.hp <= 0) {
            this.die(killerId, isExplosive);
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
        // Dual wield condition: picking up matching or compatible one-handed gun
        if (this.weapon.oneHanded && def.oneHanded && !this.weapon2 && this.weapon.id === def.id) {
            this.weapon2 = def;
            this.ammo2 = def.magSize;
            this.reloading2 = false;
            this.drawGunLayer(0, 0);
            bus.emit(Evt.WEAPON_CHANGED, this.id, def.id);
            bus.emit(Evt.AMMO_CHANGED, this.id, this.ammo, def.magSize);
            return;
        }
        this.weapon = def;
        this.ammo = def.magSize;
        this.reloading = false;
        this.weapon2 = null;
        this.ammo2 = 0;
        this.reloading2 = false;
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

    /** Redraws the gun layer; flash01/flash02 (0..1] add muzzle stars + kick. */
    private drawGunLayer(flash01: number, flash02 = 0) {
        if (!this.gunG || !this.weapon.visual) return;
        if (this.weapon2) {
            drawDualGuns(this.gunG, this.weapon, this.weapon2, flash01, flash02);
        } else {
            drawGun(this.gunG, this.weapon, flash01);
        }
        const kick = Math.max(flash01, flash02) * 6;
        this.gunNode.setPosition(this.gunBaseX - kick, -this.h * 0.02, 0);
    }

    startReload() {
        let started = false;
        if (!this.reloading && this.ammo < this.weapon.magSize) {
            this.reloading = true;
            this.reloadT = this.weapon.reloadTime;
            started = true;
        }
        if (this.weapon2 && !this.reloading2 && this.ammo2 < this.weapon2.magSize) {
            this.reloading2 = true;
            this.reloadT2 = this.weapon2.reloadTime;
            started = true;
        }
        if (started) Sfx.playReload();
    }

    canFire(): boolean {
        if (!this.alive) return false;
        if (this.weapon2) {
            return (!this.reloading && this.ammo > 0) || (!this.reloading2 && this.ammo2 > 0);
        }
        return !this.reloading && this.fireCd <= 0 && this.ammo > 0;
    }

    tryFire() {
        if (this.netGhost) return;
        if (this.weapon2) {
            const can1 = !this.reloading && this.ammo > 0;
            const can2 = !this.reloading2 && this.ammo2 > 0;
            if (!can1 && !can2) {
                if (this.alive && this.fireCd <= 0) {
                    Sfx.playEmpty();
                    this.fireCd = 0.25;
                }
                return;
            }
            if (this.fireCd > 0) return;
            const useSlot = (this.fireSlot === 0 && can1) ? 0 : can2 ? 1 : 0;
            this.fireSlot = 1 - useSlot;
            if (useSlot === 0 && can1) {
                this.ammo--;
                this.muzzleT = Fighter.FLASH_T;
                Sfx.playShoot(this.weapon.id);
                if (this.ammo <= 0) this.startReload();
            } else if (can2) {
                this.ammo2--;
                this.muzzleT2 = Fighter.FLASH_T;
                Sfx.playShoot(this.weapon2.id);
                if (this.ammo2 <= 0) this.startReload();
            }
            this.fireCd = (1 / Math.max(this.weapon.rof, this.weapon2.rof)) * 0.65;
            this.vx -= this.faceDir * this.weapon.recoil * 0.12;
            this.drawGunLayer(this.muzzleT / Fighter.FLASH_T, this.muzzleT2 / Fighter.FLASH_T);
            bus.emit(Evt.AMMO_CHANGED, this.id, this.ammo, this.weapon.magSize);
            if (this.onShoot) this.onShoot(this);
            return;
        }

        if (!this.canFire()) {
            if (this.alive && !this.reloading && this.ammo <= 0 && this.fireCd <= 0) {
                Sfx.playEmpty();
                this.fireCd = 0.25;
            }
            return;
        }
        this.ammo--;
        this.fireCd = 1 / this.weapon.rof;
        this.vx -= this.faceDir * this.weapon.recoil * 0.15;
        this.muzzleT = Fighter.FLASH_T;
        bus.emit(Evt.AMMO_CHANGED, this.id, this.ammo, this.weapon.magSize);
        Sfx.playShoot(this.weapon.id);
        if (this.onShoot) this.onShoot(this);
        if (this.ammo <= 0) this.startReload();
    }

    tryThrowGrenade(): boolean {
        if (!this.alive || this.grenades <= 0 || this.grenadeCd > 0) return false;
        this.grenades--;
        this.grenadeCd = 0.75;
        const throwSpeed = 700;
        let ax = this.aimIn.aiming ? this.aimIn.ax : this.faceDir * 0.8;
        let ay = this.aimIn.aiming ? this.aimIn.ay : 0.4;
        const len = Math.hypot(ax, ay) || 1;
        ax /= len; ay /= len;
        const gvx = ax * throwSpeed + this.vx * 0.35;
        const gvy = ay * throwSpeed + this.vy * 0.25 + 60;
        if (this.onThrowGrenade) this.onThrowGrenade(this, gvx, gvy);
        return true;
    }

    tryMelee(target: Fighter) {
        if (!this.alive || this.meleeCd > 0) return;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        if (Math.sign(dx) === this.faceDir || Math.abs(dx) < 20) {
            if (Math.hypot(dx, dy) < CFG.MELEE_RANGE + target.w) {
                this.meleeCd = CFG.MELEE_CD;
                Sfx.playMelee();
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

            const wasGrounded = this.grounded;
            const fallVy = this.vy;
            const [, , landed] = this.world.moveBody(
                this as any, this.vx * dt, this.vy * dt, this.moveIn.dropDown);
            if (landed) {
                this.vy = 0;
                this.grounded = true;
                if (!wasGrounded) {
                    // landing squash + dust puff (bigger for hard falls)
                    this.squash = fallVy < -700 ? 0.72 : 0.84;
                    const dir = this.vx > 40 ? 1 : this.vx < -40 ? -1 : 0;
                    this.fx?.dust(this.x, this.y - this.h / 2, dir);
                    if (fallVy < -700) {
                        this.fx?.puff(this.x, this.y - this.h / 2, 2, undefined, 40);
                    }
                }
            } else this.grounded = false;
            if (this.moveIn.mx !== 0) this.faceDir = this.moveIn.mx > 0 ? 1 : -1;

            // Dual rocket boots exhaust flame + occasional soot
            if (this.moveIn.jet && this.fuel > 0) {
                this.drawJetFlame();
                this.squash = Math.max(this.squash, 1.05);
                Sfx.playJetpack();
                if (this.fx && Math.random() < 0.12) {
                    this.fx.puff(this.x - this.faceDir * this.w * 0.15,
                        this.y - this.h * 0.45, 1,
                        new Color(95, 95, 100, 255), 25);
                }
            } else if (this.jetWasOn) {
                this.jetG.clear();
                this.jetWasOn = false;
            }
            // running dust while grounded
            if (this.grounded && Math.abs(this.vx) > 140) {
                this.dustT -= dt;
                if (this.dustT <= 0) {
                    this.dustT = 0.16;
                    this.fx?.dust(this.x, this.y - this.h / 2,
                        -Math.sign(this.vx));
                }
            }
        }

        this.syncNode();
    }

    /** Dual rocket boot exhaust flames. */
    private drawJetFlame() {
        if (!this.jetG) return;
        this.jetWasOn = true;
        const g = this.jetG;
        g.clear();

        const len = this.h * (0.34 + Math.random() * 0.18);
        const bootOffsets = [-this.w * 0.22, this.w * 0.08];
        for (const bx of bootOffsets) {
            // Outer bright orange flame
            g.fillColor = new Color(255, 140, 20, 210);
            g.moveTo(bx - 3.5, -this.h * 0.42);
            g.lineTo(bx + 3.5, -this.h * 0.42);
            g.lineTo(bx, -this.h * 0.42 - len);
            g.close();
            g.fill();

            // Inner white-yellow plasma core
            g.fillColor = new Color(255, 240, 180, 245);
            g.moveTo(bx - 1.8, -this.h * 0.42);
            g.lineTo(bx + 1.8, -this.h * 0.42);
            g.lineTo(bx, -this.h * 0.42 - len * 0.6);
            g.close();
            g.fill();
        }
    }

    private tickTimers(dt: number) {
        if (this.fireCd > 0) this.fireCd -= dt;
        if (this.meleeCd > 0) this.meleeCd -= dt;
        if (this.grenadeCd > 0) this.grenadeCd -= dt;
        if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
        if (this.speedT > 0) this.speedT = Math.max(0, this.speedT - dt);
        if (this.flashT > 0) {
            this.flashT = Math.max(0, this.flashT - dt);
            if (this.flashT === 0) this.drawSelf(); // clean repaint after flash
        }
        // squash & stretch springs back to neutral
        this.squash += (1 - this.squash) * Math.min(1, 12 * dt);
        if (this.shieldT > 0) {
            this.shieldT = Math.max(0, this.shieldT - dt);
            if (this.shieldT === 0) this.shieldHp = 0;
        }
        this.refreshOverlay();
        if (this.muzzleT > 0 || this.muzzleT2 > 0) {
            this.muzzleT = Math.max(0, this.muzzleT - dt);
            this.muzzleT2 = Math.max(0, this.muzzleT2 - dt);
            this.drawGunLayer(this.muzzleT / Fighter.FLASH_T, this.muzzleT2 / Fighter.FLASH_T);
            if (this.muzzleT === 0 && this.muzzleT2 === 0) this.drawGunLayer(0, 0);
        }
        if (this.reloading) {
            this.reloadT -= dt;
            if (this.reloadT <= 0) {
                this.reloading = false;
                this.ammo = this.weapon.magSize;
                bus.emit(Evt.AMMO_CHANGED, this.id, this.ammo, this.weapon.magSize);
            }
        }
        if (this.reloading2) {
            this.reloadT2 -= dt;
            if (this.reloadT2 <= 0) {
                this.reloading2 = false;
                if (this.weapon2) this.ammo2 = this.weapon2.magSize;
            }
        }
    }

    syncNode() {
        const p = this.node.position;
        if (p.x !== this.x || p.y !== this.y) {
            this.node.setPosition(this.x, this.y, 0);
        }
        // face mirror + squash & stretch (wider when squashed)
        const sx = this.faceDir * (1 + (1 - this.squash) * 0.6);
        const sy = this.squash;
        const s = this.node.scale;
        if (Math.abs(s.x - sx) > 0.004 || Math.abs(s.y - sy) > 0.004) {
            this.node.setScale(sx, sy, 1);
        }
    }

    /**
     * LAN guest mode: adopt authoritative state from a host snapshot.
     * Visual-only — physics/AI never run on remote-view fighters.
     */
    applyNetState(s: { x: number; y: number; fc: number; hp: number; fu: number;
                        al: number; am: number; rl: number; sp: number;
                        sh: number; wp?: number; wp2?: number }) {
        const wasAlive = this.alive;
        this.x = s.x; this.y = s.y;
        this.faceDir = s.fc;
        this.hp = s.hp;
        this.fuel = s.fu;
        this.ammo = s.am;
        this.reloading = !!s.rl;
        this.speedT = s.sp;
        if (s.wp !== undefined) this.setWeaponVisual(weaponByIndex(s.wp));
        if (s.wp2 !== undefined && s.wp2 >= 0) {
            this.weapon2 = weaponByIndex(s.wp2);
        } else {
            this.weapon2 = null;
        }
        this.drawGunLayer(0, 0);
        const shieldChanged = this.shieldHp !== s.sh;
        this.shieldHp = s.sh;
        this.alive = !!s.al;
        if (this.alive && !wasAlive) this.invuln = 0.4;
        if (wasAlive && !this.alive) {
            // local juice for a snapshot-reported death (guest feels it too)
            this.fx?.confetti(this.x, this.y, [
                this.char.body, this.char.accent,
                Theme.gold, Theme.flagGreen, Theme.flagRed,
            ], 30);
            this.onNetDeath?.();
        }
        this.node.active = this.alive;
        this.syncNode();
        if (shieldChanged || wasAlive !== this.alive) this.drawSelf();
    }
}
