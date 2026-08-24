/**
 * Weapons.ts
 * ---------------------------------------------------------------------------
 * Data-driven weapon catalogue. Adding a weapon = adding an entry here and
 * (optionally) dropping it into a crate's loot table — no gameplay edits.
 *
 * Balance notes:
 *  - rof is shots per second; fireCd = 1/rof in Fighter.tryFire()
 *  - gravityScale 0 = hitscan-like straight bullet, 1 = full lob arc
 *  - splashRadius > 0 turns impact into area damage with distance falloff
 */
export enum WeaponId {
    RIFLE = 'rifle',
    SHOTGUN = 'shotgun',
    SNIPER = 'sniper',
    LAUNCHER = 'launcher',
    SMG = 'smg',
}

export interface WeaponDef {
    id: WeaponId;
    nameKey: string;      // i18n key for the display name
    dmg: number;          // damage per pellet / projectile
    pellets: number;      // projectiles fired per trigger pull (shotgun = 6)
    rof: number;          // rate of fire, shots per second
    spreadDeg: number;    // random cone half-width applied per pellet
    speed: number;        // muzzle velocity (px/s)
    magSize: number;      // rounds before a forced reload
    reloadTime: number;   // seconds to refill the magazine
    gravityScale: number; // 0 = straight flight, 1 = affected like a body
    splashRadius: number; // explosion radius; 0 = single-target hit
    recoil: number;       // self-knockback impulse on firing
    auto: boolean;        // true = hold to keep firing
    visual: GunVisual;    // how the held gun + crate tint are drawn
}

/**
 * Vector-art recipe for one weapon, consumed by GunArt.drawGun.
 * Colors are 0xRRGGBB; geometry is in fighter-local px pointing +X
 * (the fighter node mirrors itself, so art never worries about facing).
 */
export interface GunVisual {
    body: number;       // receiver/barrel color
    accent: number;     // trim color (also tints the weapon crate ring)
    barrelLen: number;  // barrel length from receiver front (px)
    barrelH: number;    // barrel thickness (px)
    stock: boolean;     // shoulder stock behind the grip
    mag: boolean;       // box magazine under the receiver
    scope: boolean;     // scope tube on top
    pump: boolean;      // wood pump handle under the barrel
    tube: boolean;      // fat launcher tube instead of a thin barrel
    flashSize: number;  // muzzle-flash star radius (px)
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
    // Workhorse automatic — forgiving spread, steady DPS.
    [WeaponId.RIFLE]: {
        id: WeaponId.RIFLE, nameKey: 'w_rifle',
        dmg: 12, pellets: 1, rof: 8, spreadDeg: 2.5, speed: 1500,
        magSize: 30, reloadTime: 1.4, gravityScale: 0,
        splashRadius: 0, recoil: 40, auto: true,
        visual: {
            body: 0x4a3b2a, accent: 0xffb300,
            barrelLen: 34, barrelH: 7,
            stock: true, mag: true, scope: false, pump: false, tube: false,
            flashSize: 12,
        },
    },
    // Close-range burst — six pellets, brutal inside melee range.
    [WeaponId.SHOTGUN]: {
        id: WeaponId.SHOTGUN, nameKey: 'w_shotgun',
        dmg: 8, pellets: 6, rof: 1.3, spreadDeg: 13, speed: 1150,
        magSize: 6, reloadTime: 1.9, gravityScale: 0.15,
        splashRadius: 0, recoil: 260, auto: false,
        visual: {
            body: 0x6d4a2f, accent: 0xff7043,
            barrelLen: 30, barrelH: 9,
            stock: true, mag: false, scope: false, pump: true, tube: false,
            flashSize: 15,
        },
    },
    // Long-range punisher — huge damage, slow cycle, zero spread.
    [WeaponId.SNIPER]: {
        id: WeaponId.SNIPER, nameKey: 'w_sniper',
        dmg: 55, pellets: 1, rof: 0.85, spreadDeg: 0, speed: 2800,
        magSize: 5, reloadTime: 2.1, gravityScale: 0,
        splashRadius: 0, recoil: 180, auto: false,
        visual: {
            body: 0x23262e, accent: 0x39d6ff,
            barrelLen: 42, barrelH: 5,
            stock: true, mag: false, scope: true, pump: false, tube: false,
            flashSize: 10,
        },
    },
    // Arcing explosive — rewards roof-spamming and door denial.
    [WeaponId.LAUNCHER]: {
        id: WeaponId.LAUNCHER, nameKey: 'w_launcher',
        dmg: 42, pellets: 1, rof: 1.0, spreadDeg: 2, speed: 880,
        magSize: 4, reloadTime: 2.3, gravityScale: 1,
        splashRadius: 130, recoil: 150, auto: false,
        visual: {
            body: 0x55603a, accent: 0xd23b2f,
            barrelLen: 26, barrelH: 14,
            stock: false, mag: false, scope: false, pump: false, tube: true,
            flashSize: 18,
        },
    },
    // Room-sprayer — huge mag, tiny punch, shreds at close range.
    [WeaponId.SMG]: {
        id: WeaponId.SMG, nameKey: 'w_smg',
        dmg: 8, pellets: 1, rof: 13, spreadDeg: 5, speed: 1250,
        magSize: 36, reloadTime: 1.1, gravityScale: 0,
        splashRadius: 0, recoil: 22, auto: true,
        visual: {
            body: 0x37474f, accent: 0x26c6da,
            barrelLen: 20, barrelH: 8,
            stock: false, mag: true, scope: false, pump: false, tube: false,
            flashSize: 9,
        },
    },
};

/** Stable index order for LAN snapshots (weapon id -> wire index). */
export const WEAPON_LIST: WeaponId[] = [
    WeaponId.RIFLE, WeaponId.SHOTGUN, WeaponId.SNIPER,
    WeaponId.LAUNCHER, WeaponId.SMG,
];

/** Crates roll from this pool (weights emerge from repetition). */
export const CRATE_POOL: WeaponId[] = [
    WeaponId.RIFLE, WeaponId.RIFLE, WeaponId.SHOTGUN,
    WeaponId.SMG, WeaponId.SMG, WeaponId.SNIPER, WeaponId.LAUNCHER,
];
