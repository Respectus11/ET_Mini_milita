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
import { _decorator, Color, Component, Graphics, Label, Node } from 'cc';
const { ccclass } = _decorator;
import { CFG } from '../core/GameConfig';
import { clamp } from '../core/Utils';
import { ensureUT } from '../core/UIUtil';
import { CharacterDef } from '../data/Characters';
import { WeaponDef, WEAPONS, WeaponId } from '../data/Weapons';
import { drawGun, drawDualGuns, weaponByIndex, gunMuzzleX } from './GunArt';
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

    // wall mechanics (Mini Militia style)
    wallDir = 0;          // -1=left wall, 0=none, 1=right wall
    wallSliding = false;
    private wallJumpLock = 0; // brief cooldown after wall-jump

    // combat state
    hp = CFG.MAX_HP;
    alive = true;
    invuln = 0;

    // HP regen (Mini Militia: slow regen after 4s out of combat)
    private regenDelay = 0;

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
    onDropWeapon: ((f: Fighter, w: WeaponDef, x: number, y: number) => void) | null = null;
    respawnTimer = 0;

    get isRegenerating(): boolean {
        return this.alive && this.hp < CFG.MAX_HP && this.regenDelay <= 0;
    }

    private g: Graphics | null = null;
    private bodyG: Graphics = null!;
    private gunNode: Node = null!;
    private gunG: Graphics = null!;
    private laserNode: Node = null!;
    private laserG: Graphics = null!;
    private muzzleT = 0;              // counts down the flash/kick window
    private static FLASH_T = 0.07;
    private gunBaseX = 0;
    private walkPhase = 0;
    private wasFlying = false;
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
    private smokeT = 0;           // jetpack smoke trail throttle
    private nameLbl: Label | null = null;

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
        this.jetNode.setPosition(0, 0, 0);

        // dedicated layer so gun redraws never touch body vector ops
        ensureUT(this.node);
        this.gunNode = new Node('gun');
        this.node.addChild(this.gunNode);
        ensureUT(this.gunNode);
        this.gunG = this.gunNode.addComponent(Graphics);
        this.gunBaseX = this.w * 0.12;
        this.gunNode.setPosition(this.gunBaseX, -this.h * 0.04, 0);

        // dedicated laser sight layer attached to gun (rotates along with aim)
        this.laserNode = new Node('laser');
        this.gunNode.addChild(this.laserNode);
        ensureUT(this.laserNode);
        this.laserG = this.laserNode.addComponent(Graphics);

        this.drawGunLayer(0);

        // floating name label above fighter
        const nameNode = new Node('name');
        this.node.addChild(nameNode);
        ensureUT(nameNode);
        this.nameLbl = nameNode.addComponent(Label);
        this.nameLbl.string = this.teamLabel;
        this.nameLbl.fontSize = 20;
        this.nameLbl.lineHeight = 22;
        this.nameLbl.isBold = true;
        this.nameLbl.enableOutline = true;
        this.nameLbl.outlineColor = new Color(0, 0, 0, 200);
        this.nameLbl.outlineWidth = 3;
        this.nameLbl.color = this.char.body;
        nameNode.setPosition(0, this.h * 0.58 + 8, 0);
    }

    private drawSelf() {
        const isFlying = !this.grounded && (this.moveIn.jet || Math.abs(this.vy) > 80);
        drawFighterRig(this.bodyG, this.char, this.w, this.h, this.faceDir, isFlying, this.walkPhase);

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
        this.regenDelay = 0;
        this.wallDir = 0; this.wallSliding = false;
        this.respawnTimer = 0;
        this.node.active = true;
        if (this.nameLbl) { this.nameLbl.string = this.teamLabel; this.nameLbl.node.active = true; }
        this.syncNode();
        this.drawSelf();
        bus.emit(Evt.HP_CHANGED, this.id, this.hp, this.teamLabel);
    }

    die(killerId: number, isExplosion = false) {
        if (!this.alive) return;
        this.alive = false;
        this.node.active = false;
        if (this.nameLbl) this.nameLbl.node.active = false;
        if (this.laserG) this.laserG.clear();
        if (this.jetG) this.jetG.clear();
        if (this.onDropWeapon && this.weapon) {
            this.onDropWeapon(this, this.weapon, this.x, this.y);
            if (this.weapon2) {
                this.onDropWeapon(this, this.weapon2, this.x + 12, this.y + 8);
            }
        }
        if (this.fx) {
            // body uniform + scarf equipment scatter
            this.fx.burst({
                x: this.x, y: this.y,
                count: isExplosion ? 28 : 16,
                speed: isExplosion ? 520 : 320,
                size: 4.5, life: 0.65,
                color: this.char.body,
            });
            this.fx.burst({
                x: this.x, y: this.y + this.h * 0.3,
                count: 10, speed: 360, size: 5.5, life: 0.7,
                color: this.char.accent,
            });
            // blood splatter — red sparks in downward cone
            this.fx.burst({
                x: this.x, y: this.y + this.h * 0.25,
                count: 14, speed: 280, size: 3,
                angle: -Math.PI / 2, spread: Math.PI * 0.8,
                color: new Color(200, 30, 30, 255),
                life: 0.5, grav: 900,
            });
            // helmet debris — dark olive chunks
            this.fx.burst({
                x: this.x, y: this.y + this.h * 0.38,
                count: 5, speed: 420, size: 6.5, life: 0.55,
                color: new Color(86, 122, 64, 255),
                shape: 'debris', grav: 800,
            });
            // ammo pouch / equipment scatter (dark rectangles)
            this.fx.burst({
                x: this.x, y: this.y, count: 6, speed: 200,
                size: 4, life: 0.6, shape: 'debris',
                color: new Color(38, 40, 34, 255), grav: 700,
            });
            // smoke puff at death site
            this.fx.puff(this.x, this.y + this.h * 0.15, 3,
                new Color(80, 80, 80, 180), 50);
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
        // Reset HP regen timer on every hit
        this.regenDelay = CFG.HP_REGEN_DELAY;
        this.drawSelf();
        if (isCrit) {
            Sfx.playHeadshot();
            this.fx?.burst({
                x: this.x, y: this.y + this.h * 0.4,
                count: 14, speed: 280, size: 3.5, life: 0.4,
                color: new Color(255, 215, 0, 255),
            });
            this.fx?.floatText(this.x, this.y + this.h * 0.6,
                `💀 ${dmg}`, new Color(255, 60, 60, 255), 38);
        } else {
            Sfx.playHit();
            // floating damage number
            const dmgCol = isExplosive
                ? new Color(255, 140, 30, 255)
                : new Color(255, 230, 60, 255);
            this.fx?.floatText(this.x + (Math.random() - 0.5) * 20,
                this.y + this.h * 0.5, `-${dmg}`, dmgCol, 30);
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
        const kick = Math.max(flash01, flash02) * 7;
        this.gunNode.setPosition(this.gunBaseX - kick, -this.h * 0.04, 0);
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

    tryMelee(target?: Fighter | null) {
        if (!this.alive || this.meleeCd > 0) return;
        if (target) {
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            if (Math.sign(dx) === this.faceDir || Math.abs(dx) < 20) {
                if (Math.hypot(dx, dy) < CFG.MELEE_RANGE + target.w) {
                    this.meleeCd = CFG.MELEE_CD;
                    Sfx.playMelee();
                    if (this.onMelee) this.onMelee(this);
                }
            }
        } else {
            this.meleeCd = CFG.MELEE_CD;
            Sfx.playMelee();
            if (this.onMelee) this.onMelee(this);
        }
    }

    tick(dt: number) {
        if (dt <= 0) return;
        this.tickTimers(dt);

        if (this.alive) {
            this.updateAim();
            const speedMult = this.speedT > 0 ? CFG.BUNA_SPEED_MULT : 1;
            const targetVx = this.moveIn.mx * CFG.MOVE_SPEED * speedMult;
            const accel = this.grounded ? 12 : 7;
            this.vx += (targetVx - this.vx) * Math.min(1, accel * dt);

            // --- wall-slide detection (before jetpack so wall-jump can override) ---
            this.wallDir = 0;
            this.wallSliding = false;
            if (!this.grounded && this.wallJumpLock <= 0) {
                const leftX  = this.x - this.w / 2 - 4;
                const rightX = this.x + this.w / 2 + 4;
                if (this.world.solidAtWorld(rightX, this.y) && this.moveIn.mx > 0.1) {
                    this.wallDir = 1;
                } else if (this.world.solidAtWorld(leftX, this.y) && this.moveIn.mx < -0.1) {
                    this.wallDir = -1;
                }
                if (this.wallDir !== 0 && this.vy < 0 && !this.moveIn.jet) {
                    this.wallSliding = true;
                    // clamp downward speed to wall-slide maximum
                    if (this.vy < CFG.WALL_SLIDE_VY) this.vy = CFG.WALL_SLIDE_VY;
                    // kick-off dust on the wall side
                    if (this.fx && Math.random() < 0.15) {
                        this.fx.dust(this.x + this.wallDir * (this.w / 2 + 2),
                            this.y, -this.wallDir);
                    }
                    Sfx.playWallSlide();
                }
            }

            if (this.moveIn.jet && this.fuel > 0) {
                // wall-jump: press jet while wall-sliding = push off
                if (this.wallSliding && this.wallDir !== 0) {
                    this.vx = -this.wallDir * CFG.WALL_JUMP_VX;
                    this.vy  = CFG.WALL_JUMP_VY;
                    this.fuel = Math.max(0, this.fuel - CFG.WALL_JUMP_FUEL_COST);
                    this.fuelDelay = CFG.JETPACK_REGEN_DELAY;
                    this.wallJumpLock = 0.22; // brief grace so we don't re-stick
                    this.wallDir = 0; this.wallSliding = false;
                    this.squash = 1.15; // stretch on wall-jump
                    this.fx?.burst({ x: this.x, y: this.y, count: 6, speed: 200,
                        size: 3, life: 0.25, color: new Color(100, 200, 255, 255) });
                } else {
                    this.vy += CFG.JETPACK_THRUST * dt;
                    this.fuel -= CFG.JETPACK_DRAIN * dt;
                    this.fuelDelay = CFG.JETPACK_REGEN_DELAY;
                    if (this.fuel < 0) this.fuel = 0;
                }
            } else {
                if (this.fuelDelay > 0) this.fuelDelay -= dt;
                else {
                    this.fuel = Math.min(CFG.JETPACK_MAX_FUEL,
                        this.fuel + CFG.JETPACK_REGEN * dt * (this.grounded ? 1.6 : 1));
                }
                this.vy -= CFG.GRAVITY * dt;
            }
            if (this.wallJumpLock > 0) this.wallJumpLock -= dt;
            this.vy = clamp(this.vy, -1900, 900);

            const wasGrounded = this.grounded;
            const fallVy = this.vy;
            const [hitX, , landed] = this.world.moveBody(
                this as any, this.vx * dt, this.vy * dt, this.moveIn.dropDown);
            // stop horizontal velocity when pushing into a solid wall
            if (hitX && !this.wallSliding) this.vx = 0;
            if (landed) {
                this.vy = 0;
                this.grounded = true;
                this.wallSliding = false;
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

            // Orientation: aiming takes precedence over locomotion facing
            if (this.aimIn.aiming && Math.abs(this.aimIn.ax) > 0.15) {
                const newDir = this.aimIn.ax > 0 ? 1 : -1;
                if (newDir !== this.faceDir) {
                    this.faceDir = newDir;
                    this.drawSelf();
                }
            } else if (this.moveIn.mx !== 0) {
                const newDir = this.moveIn.mx > 0 ? 1 : -1;
                if (newDir !== this.faceDir) {
                    this.faceDir = newDir;
                    this.drawSelf();
                }
            }

            // Flying posture transition
            const isFlying = !this.grounded && (this.moveIn.jet || Math.abs(this.vy) > 80);
            if (isFlying !== this.wasFlying) {
                this.wasFlying = isFlying;
                this.drawSelf();
            }

            // Dual rocket boots exhaust flame + thick smoke contrail
            if (this.moveIn.jet && this.fuel > 0) {
                this.drawJetFlame();
                this.squash = Math.max(this.squash, 1.05);
                Sfx.playJetpack();
                // smoke puff on interval — gives thick trail feel
                this.smokeT -= dt;
                if (this.smokeT <= 0 && this.fx) {
                    this.smokeT = 0.055;
                    // smoke cloud from each boot nozzle
                    const bx1 = this.x - this.faceDir * this.w * 0.24;
                    const bx2 = this.x + this.faceDir * this.w * 0.10;
                    const by  = this.y - this.h * 0.45;
                    this.fx.puff(bx1, by, 1, new Color(90, 90, 95, 255), 28);
                    this.fx.puff(bx2, by, 1, new Color(90, 90, 95, 255), 28);
                    // ember sparks
                    this.fx.burst({ x: this.x, y: by - 4,
                        count: 2, speed: 160, size: 2,
                        angle: -Math.PI / 2, spread: 0.9,
                        color: new Color(255, 160, 40, 255), life: 0.18 });
                }
            } else if (this.jetWasOn) {
                this.jetG.clear();
                this.jetWasOn = false;
                this.smokeT = 0;
            }

            // Running footstep dust & leg bobbing while grounded
            if (this.grounded && Math.abs(this.vx) > 30) {
                this.walkPhase += dt * (Math.abs(this.vx) / 18);
                if (Math.abs(this.vx) > 140) {
                    this.dustT -= dt;
                    if (this.dustT <= 0) {
                        this.dustT = 0.16;
                        this.fx?.dust(this.x, this.y - this.h / 2, -Math.sign(this.vx));
                    }
                }
                this.drawSelf();
            }
        }

        this.syncNode();
    }

    /** Dual rocket boot exhaust flames with layered plasma core. */
    private drawJetFlame() {
        if (!this.jetG) return;
        this.jetWasOn = true;
        const g = this.jetG;
        g.clear();

        const len = this.h * (0.42 + Math.random() * 0.24);
        const bootOffsets = [-this.w * 0.24, this.w * 0.10];
        const bootY = -this.h * 0.46;

        for (const bx of bootOffsets) {
            // 1. Outer blazing orange rocket thrust plume
            g.fillColor = new Color(255, 120, 20, 230);
            g.moveTo(bx - 4.5, bootY);
            g.lineTo(bx + 4.5, bootY);
            g.lineTo(bx, bootY - len);
            g.close();
            g.fill();

            // 2. Inner electric white-yellow core
            g.fillColor = new Color(255, 250, 190, 255);
            g.moveTo(bx - 2.2, bootY);
            g.lineTo(bx + 2.2, bootY);
            g.lineTo(bx, bootY - len * 0.65);
            g.close();
            g.fill();

            // 3. Electric blue nozzle flash
            g.fillColor = new Color(100, 220, 255, 240);
            g.fillRect(bx - 3.5, bootY, 7, 2);
        }
    }

    /** Updates 360-degree weapon aiming rotation and laser sight guide. */
    updateAim() {
        if (!this.gunNode) return;

        let aimX = this.aimIn.ax;
        let aimY = this.aimIn.ay;
        const isAiming = this.aimIn.aiming && (Math.hypot(aimX, aimY) > 0.15);

        if (!isAiming) {
            aimX = this.faceDir;
            aimY = 0;
        }

        // Local angle relative to facing direction
        const localAx = this.faceDir * aimX;
        const localAy = aimY;
        const localAngRad = Math.atan2(localAy, localAx);
        const localAngDeg = localAngRad * 180 / Math.PI;

        this.gunNode.setRotationFromEuler(0, 0, localAngDeg);

        // Update Laser Sight
        if (!this.laserG) return;
        this.laserG.clear();
        if (isAiming && this.alive && !this.netGhost) {
            const startX = gunMuzzleX(this.weapon) + 2;
            const maxLaserLen = this.weapon.id === WeaponId.SNIPER ? 750 : 380;

            const laserCol = this.weapon.id === WeaponId.SNIPER 
                ? new Color(0, 255, 100, 190)
                : this.weapon.id === WeaponId.PLASMA
                ? new Color(0, 230, 255, 190)
                : new Color(255, 50, 50, 160);

            this.laserG.lineWidth = this.weapon.id === WeaponId.SNIPER ? 2 : 1.5;
            this.laserG.strokeColor = laserCol;
            this.laserG.moveTo(startX, 0);
            this.laserG.lineTo(startX + maxLaserLen, 0);
            this.laserG.stroke();

            this.laserG.fillColor = laserCol;
            this.laserG.circle(startX + maxLaserLen, 0, 3.5);
            this.laserG.fill();
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
        // HP regen — Mini Militia style: slow recovery after 4s out of combat
        if (this.alive && this.hp > 0 && this.hp < CFG.MAX_HP) {
            if (this.regenDelay > 0) {
                this.regenDelay -= dt;
            } else {
                const oldHp = this.hp;
                this.hp = Math.min(CFG.MAX_HP, this.hp + CFG.HP_REGEN_RATE * dt);
                if (Math.floor(this.hp) !== Math.floor(oldHp)) {
                    bus.emit(Evt.HP_CHANGED, this.id, Math.max(0, this.hp), this.teamLabel);
                }
            }
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
