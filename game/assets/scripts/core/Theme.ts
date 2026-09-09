/**
 * Theme.ts
 * ---------------------------------------------------------------------------
 * One palette source of truth. Every UI surface pulls colors from here so
 * the whole game shares a single shape/color language (Ethiopian identity:
 * deep midnight surfaces + gold/flag accents). Map palettes still come from
 * data/Maps.ts; the menu/HUD accents adapt via accentOf().
 */
import { Color } from 'cc';

const c = (r: number, g: number, b: number, a = 255) => new Color(r, g, b, a);

export const Theme = {
    // surfaces
    bg: c(24, 28, 38),
    bgDeep: c(8, 10, 16, 245),
    surface: c(28, 34, 46),
    surfaceHi: c(38, 46, 62),
    panel: c(10, 12, 18, 170),
    line: c(255, 255, 255, 40),

    // text
    text: c(235, 238, 245),
    textDim: c(200, 205, 215),
    textFaint: c(255, 255, 255, 150),

    // brand accents (Ethiopian identity)
    gold: c(196, 148, 58),
    goldHi: c(255, 226, 150),
    flagGreen: c(46, 125, 50),
    flagRed: c(198, 40, 40),
    teal: c(0, 105, 92),

    // gameplay readouts
    hpHigh: c(76, 217, 100),
    hpMid: c(255, 200, 60),
    hpLow: c(240, 80, 80),
    fuel: c(90, 190, 255),
    shield: c(64, 196, 255),
    danger: c(255, 120, 120),
    reload: c(255, 214, 120),

    // fx
    spark: c(255, 240, 160),
    flame: c(255, 160, 40),
    smoke: c(120, 120, 128),
};

/** Same color with a new alpha (never mutates the token). */
export function withAlpha(c0: Color, a: number): Color {
    return new Color(c0.r, c0.g, c0.b, a);
}

/** Mix toward white by f (0..1). */
export function lighten(c0: Color, f: number): Color {
    return new Color(
        Math.round(c0.r + (255 - c0.r) * f),
        Math.round(c0.g + (255 - c0.g) * f),
        Math.round(c0.b + (255 - c0.b) * f),
        c0.a,
    );
}

/** Mix toward black by f (0..1). */
export function darken(c0: Color, f: number): Color {
    return new Color(
        Math.round(c0.r * (1 - f)),
        Math.round(c0.g * (1 - f)),
        Math.round(c0.b * (1 - f)),
        c0.a,
    );
}

/** Menu/HUD accent that follows the selected battlefield's palette. */
export function accentOf(skyTop: Color, deco: Color): Color {
    return new Color(
        Math.round((skyTop.r + deco.r) / 2),
        Math.round((skyTop.g + deco.g) / 2),
        Math.round((skyTop.b + deco.b) / 2),
        255,
    );
}