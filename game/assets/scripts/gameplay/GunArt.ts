/**
 * GunArt.ts
 * ---------------------------------------------------------------------------
 * Vector renderer for held weapons. One function draws any weapon from its
 * GunVisual recipe, plus an optional muzzle-flash frame — so the fighter's
 * gun layer can be cheaply redrawn per-frame only while firing.
 *
 * Art space: origin = grip/hand point, gun points +X (fighter node mirrors
 * itself for the other facing, so art never worries about direction).
 */
import { Color, Graphics } from 'cc';
import { WeaponDef, WEAPON_LIST, WEAPONS } from '../data/Weapons';

/** Front-of-muzzle X in art space (flash + eject port anchor). */
export function gunMuzzleX(def: WeaponDef): number {
    return 12 + def.visual.barrelLen;
}

const col = (hex: number, a = 255) =>
    new Color((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, a);

/**
 * Draws the weapon into `g` (cleared first). flash01 in (0..1] adds the
 * muzzle star + ejected shell; pass 0 (or omit) for the idle pose.
 */
export function drawGun(g: Graphics, def: WeaponDef, flash01 = 0) {
    const v = def.visual;
    g.clear();
    const bodyC = col(v.body);
    const accC = col(v.accent);
    const darkC = col(0x1c1c22);
    const woodC = col(0x8a5a33);

    // shoulder stock
    if (v.stock && !v.tube) {
        g.fillColor = darkC;
        g.moveTo(-8, 3);
        g.lineTo(-20, 6);
        g.lineTo(-20, -4);
        g.lineTo(-8, -4);
        g.close();
        g.fill();
    }

    // receiver / main body
    g.fillColor = bodyC;
    if (v.tube) {
        // launcher: fat rounded tube spanning receiver+barrel
        const total = v.barrelLen + 12;
        g.roundRect(-10, -v.barrelH / 2, total + 6, v.barrelH, v.barrelH / 2);
        g.fill();
        // muzzle ring + red war-band accent
        g.fillColor = darkC;
        g.roundRect(total - 8, -v.barrelH / 2 - 1.5, 8, v.barrelH + 3, 2);
        g.fill();
        g.fillColor = accC;
        g.rect(total * 0.45, -v.barrelH / 2, 5, v.barrelH);
        g.fill();
    } else {
        g.roundRect(-8, -v.barrelH * 0.75, 20, v.barrelH * 1.5, 3);
        g.fill();
        // barrel
        g.fillRect(10, -v.barrelH / 2, v.barrelLen, v.barrelH);
        // muzzle tip
        g.fillColor = darkC;
        g.fillRect(gunMuzzleX(def) - 3, -v.barrelH / 2 - 1, 3.5, v.barrelH + 2);

        // Special visual accents for Magnum and Plasma
        if (def.id === 'plasma') {
            // Glowing energy coils
            g.fillColor = accC;
            g.fillRect(12, -v.barrelH / 2 - 2, 3, v.barrelH + 4);
            g.fillRect(18, -v.barrelH / 2 - 2, 3, v.barrelH + 4);
            g.fillRect(24, -v.barrelH / 2 - 2, 3, v.barrelH + 4);
            // Core capacitor
            g.fillColor = new Color(255, 255, 255, 220);
            g.circle(0, 0, 3.5);
            g.fill();
        } else if (def.id === 'magnum') {
            // Heavy slide bevel
            g.fillColor = accC;
            g.fillRect(-2, -v.barrelH * 0.75, 4, 3);
            g.fillColor = darkC;
            g.fillRect(4, -v.barrelH * 0.75, 2, 4);
            g.fillRect(8, -v.barrelH * 0.75, 2, 4);
        }
    }

    // box magazine
    if (v.mag) {
        g.fillColor = darkC;
        g.moveTo(1, v.barrelH * 0.75);
        g.lineTo(9, v.barrelH * 0.75);
        g.lineTo(7, v.barrelH * 0.75 + 13);
        g.lineTo(-1, v.barrelH * 0.75 + 13);
        g.close();
        g.fill();
    }

    // pump handle
    if (v.pump) {
        g.fillColor = woodC;
        g.roundRect(14, v.barrelH / 2, 12, 5, 2);
        g.fill();
    }

    // scope
    if (v.scope) {
        g.fillColor = darkC;
        g.roundRect(0, -v.barrelH * 0.75 - 6, 14, 5, 2.5);
        g.fill();
        g.fillColor = accC;
        g.circle(7, -v.barrelH * 0.75 - 3.5, 2);
        g.fill();
    }

    // trigger guard
    g.strokeColor = darkC;
    g.lineWidth = 2.5;
    g.arc(0, v.barrelH * 0.75, 4, Math.PI * 0.1, Math.PI * 0.9, false);
    g.stroke();

    if (flash01 > 0) drawFlash(g, def, flash01);
}

/**
 * Draws dual-wield weapons: off-hand gun slightly lowered & back,
 * main gun in front with distinct flash support.
 */
export function drawDualGuns(g: Graphics, primary: WeaponDef, secondary: WeaponDef, flash1 = 0, flash2 = 0) {
    g.clear();
    // Render secondary weapon behind (darkened tint via lower alpha / shadow offset)
    drawSingleGunOffset(g, secondary, -4, -6, flash2, true);
    // Render primary weapon in foreground
    drawSingleGunOffset(g, primary, 2, 2, flash1, false);
}

function drawSingleGunOffset(g: Graphics, def: WeaponDef, ox: number, oy: number, flash01: number, isOffhand: boolean) {
    const v = def.visual;
    const bodyC = isOffhand ? col(v.body, 200) : col(v.body);
    const accC = col(v.accent);
    const darkC = col(0x1c1c22);

    if (v.stock && !v.tube) {
        g.fillColor = darkC;
        g.moveTo(ox - 8, oy + 3);
        g.lineTo(ox - 20, oy + 6);
        g.lineTo(ox - 20, oy - 4);
        g.lineTo(ox - 8, oy - 4);
        g.close();
        g.fill();
    }

    g.fillColor = bodyC;
    g.roundRect(ox - 8, oy - v.barrelH * 0.75, 20, v.barrelH * 1.5, 3);
    g.fill();
    g.fillRect(ox + 10, oy - v.barrelH / 2, v.barrelLen, v.barrelH);
    g.fillColor = darkC;
    g.fillRect(ox + gunMuzzleX(def) - 3, oy - v.barrelH / 2 - 1, 3.5, v.barrelH + 2);

    if (v.mag) {
        g.fillColor = darkC;
        g.moveTo(ox + 1, oy + v.barrelH * 0.75);
        g.lineTo(ox + 9, oy + v.barrelH * 0.75);
        g.lineTo(ox + 7, oy + v.barrelH * 0.75 + 13);
        g.lineTo(ox - 1, oy + v.barrelH * 0.75 + 13);
        g.close();
        g.fill();
    }

    if (flash01 > 0) {
        drawFlashAt(g, def, ox + gunMuzzleX(def) + 2, oy, flash01);
    }
}

function drawFlashAt(g: Graphics, def: WeaponDef, mx: number, my: number, t: number) {
    if ((def.id as string) === 'flamethrower') {
        const len = 34 * (0.6 + 0.4 * t);
        const spread = 15 * (0.6 + 0.4 * t);
        g.fillColor = new Color(255, 90, 20, Math.floor(180 * t));
        g.moveTo(mx, my);
        g.lineTo(mx + len, my - spread);
        g.lineTo(mx + len * 1.25, my);
        g.lineTo(mx + len, my + spread);
        g.close();
        g.fill();
        g.fillColor = new Color(255, 210, 40, Math.floor(220 * t));
        g.moveTo(mx, my);
        g.lineTo(mx + len * 0.7, my - spread * 0.55);
        g.lineTo(mx + len * 0.85, my);
        g.lineTo(mx + len * 0.7, my + spread * 0.55);
        g.close();
        g.fill();
        g.fillColor = new Color(255, 255, 220, Math.floor(240 * t));
        g.circle(mx + 3, my, 4);
        g.fill();
        return;
    }
    const v = def.visual;
    const r = v.flashSize * (0.55 + 0.45 * t);
    g.fillColor = new Color(255, 210, 80, Math.floor(120 * t));
    g.circle(mx, my, r * 1.35);
    g.fill();
    g.fillColor = new Color(255, 240, 160, Math.floor(230 * t));
    g.moveTo(mx + r, my);
    g.lineTo(mx + r * 0.25, my + r * 0.28);
    g.lineTo(mx, my + r);
    g.lineTo(mx - r * 0.25, my + r * 0.28);
    g.lineTo(mx - r * 0.4, my);
    g.lineTo(mx - r * 0.25, my - r * 0.28);
    g.lineTo(mx, my - r);
    g.lineTo(mx + r * 0.25, my - r * 0.28);
    g.close();
    g.fill();
    g.fillColor = new Color(255, 255, 235, Math.floor(240 * t));
    g.circle(mx, my, r * 0.32);
    g.fill();
}

/** Muzzle star + (for ballistic guns) one brass shell at the eject port. */
function drawFlash(g: Graphics, def: WeaponDef, t: number) {
    if ((def.id as string) === 'flamethrower') {
        const mx = gunMuzzleX(def) + 2;
        const len = 34 * (0.6 + 0.4 * t);
        const spread = 15 * (0.6 + 0.4 * t);
        g.fillColor = new Color(255, 90, 20, Math.floor(180 * t));
        g.moveTo(mx, 0);
        g.lineTo(mx + len, -spread);
        g.lineTo(mx + len * 1.25, 0);
        g.lineTo(mx + len, spread);
        g.close();
        g.fill();
        g.fillColor = new Color(255, 210, 40, Math.floor(220 * t));
        g.moveTo(mx, 0);
        g.lineTo(mx + len * 0.7, -spread * 0.55);
        g.lineTo(mx + len * 0.85, 0);
        g.lineTo(mx + len * 0.7, spread * 0.55);
        g.close();
        g.fill();
        g.fillColor = new Color(255, 255, 220, Math.floor(240 * t));
        g.circle(mx + 3, 0, 4);
        g.fill();
        return;
    }
    const v = def.visual;
    const r = v.flashSize * (0.55 + 0.45 * t);
    const mx = gunMuzzleX(def) + 2;

    // outer glow
    g.fillColor = new Color(255, 210, 80, Math.floor(120 * t));
    g.circle(mx, 0, r * 1.35);
    g.fill();

    // 4-point star
    g.fillColor = new Color(255, 240, 160, Math.floor(230 * t));
    g.moveTo(mx + r, 0);
    g.lineTo(mx + r * 0.25, r * 0.28);
    g.lineTo(mx, r);
    g.lineTo(mx - r * 0.25, r * 0.28);
    g.lineTo(mx - r * 0.4, 0);
    g.lineTo(mx - r * 0.25, -r * 0.28);
    g.lineTo(mx, -r);
    g.lineTo(mx + r * 0.25, -r * 0.28);
    g.close();
    g.fill();

    // white-hot core
    g.fillColor = new Color(255, 255, 235, Math.floor(240 * t));
    g.circle(mx, 0, r * 0.32);
    g.fill();

    // ejecting shell (ballistic weapons only)
    if (def.id !== 'launcher') {
        const sx = 6 - t * 10;          // flies backward as flash decays
        const sy = v.barrelH * 0.9 + (1 - t) * 6;
        g.fillColor = new Color(255, 202, 40, Math.floor(255 * t));
        g.circle(sx, sy, 3);
        g.fill();
    }
}

/** Accent color of a weapon as a cc.Color (crate rings, HUD chips). */
export function weaponAccent(def: WeaponDef): Color {
    return col(def.visual.accent);
}

/** Weapon lookup by LAN wire index (clamped to the list). */
export function weaponByIndex(i: number): WeaponDef {
    return WEAPONS[WEAPON_LIST[Math.max(0, Math.min(WEAPON_LIST.length - 1, i))]];
}
