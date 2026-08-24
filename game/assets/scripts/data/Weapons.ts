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
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
    // Workhorse automatic — forgiving spread, steady DPS.
    [WeaponId.RIFLE]: {
        id: WeaponId.RIFLE, nameKey: 'w_rifle',
        dmg: 12, pellets: 1, rof: 8, spreadDeg: 2.5, speed: 1500,
        magSize: 30, reloadTime: 1.4, gravityScale: 0,
        splashRadius: 0, recoil: 40, auto: true,
    },
    // Close-range burst — six pellets, brutal inside melee range.
    [WeaponId.SHOTGUN]: {
        id: WeaponId.SHOTGUN, nameKey: 'w_shotgun',
        dmg: 8, pellets: 6, rof: 1.3, spreadDeg: 13, speed: 1150,
        magSize: 6, reloadTime: 1.9, gravityScale: 0.15,
        splashRadius: 0, recoil: 260, auto: false,
    },
    // Long-range punisher — huge damage, slow cycle, zero spread.
    [WeaponId.SNIPER]: {
        id: WeaponId.SNIPER, nameKey: 'w_sniper',
        dmg: 55, pellets: 1, rof: 0.85, spreadDeg: 0, speed: 2800,
        magSize: 5, reloadTime: 2.1, gravityScale: 0,
        splashRadius: 0, recoil: 180, auto: false,
    },
    // Arcing explosive — rewards roof-spamming and door denial.
    [WeaponId.LAUNCHER]: {
        id: WeaponId.LAUNCHER, nameKey: 'w_launcher',
        dmg: 42, pellets: 1, rof: 1.0, spreadDeg: 2, speed: 880,
        magSize: 4, reloadTime: 2.3, gravityScale: 1,
        splashRadius: 130, recoil: 150, auto: false,
    },
};
