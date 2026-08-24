/**
 * Characters.ts
 * ---------------------------------------------------------------------------
 * Playable fighter roster plus the outfit-customization system.
 *
 * Roster entries are BASE looks only; players may override the clothes,
 * scarf and skin colors per save slot (like the original game's avatar
 * customization). Overrides are plain hex strings so they serialize
 * directly to localStorage and over the LAN relay.
 *
 * Names are common Ethiopian personal names; add matching strings to both
 * language tables in data/Strings.ts when adding a character here.
 */
import { Color } from 'cc';

export interface CharacterDef {
    id: string;
    nameKey: string;   // i18n key for the display name
    body: Color;       // main outfit color
    accent: Color;     // scarf/trim color
    skin: Color;       // head/skin tone
}

export const CHARACTERS: CharacterDef[] = [
    { id: 'abebe', nameKey: 'char_abebe', body: new Color(46, 125, 50),  accent: new Color(255, 193, 7),  skin: new Color(120, 72, 44) },
    { id: 'almaz', nameKey: 'char_almaz', body: new Color(198, 40, 40),  accent: new Color(255, 224, 178), skin: new Color(139, 90, 43) },
    { id: 'desta', nameKey: 'char_desta', body: new Color(21, 101, 192), accent: new Color(255, 213, 79), skin: new Color(110, 66, 40) },
    { id: 'hanna', nameKey: 'char_hanna', body: new Color(142, 36, 170), accent: new Color(255, 205, 210), skin: new Color(129, 82, 51) },
];

/**
 * Per-player look overrides. Every field is optional hex ('#rrggbb');
 * missing/invalid fields fall back to the roster base colors. Short keys
 * keep LAN messages tiny (sent on every hello/start handshake).
 */
export interface OutfitOverride {
    b?: string;        // body / clothes
    a?: string;        // scarf / accent
    s?: string;        // skin tone
}

// ---- persistence ---------------------------------------------------------

const OUTFIT_KEY: Record<'p1' | 'p2', string> = {
    p1: 'etmm_outfit_p1',
    p2: 'etmm_outfit_p2',
};

/** Restores this slot's saved customization (empty override if none). */
export function loadOutfit(slot: 'p1' | 'p2'): OutfitOverride {
    try {
        const raw = localStorage.getItem(OUTFIT_KEY[slot]);
        const o = raw ? JSON.parse(raw) : {};
        return (o && typeof o === 'object') ? o as OutfitOverride : {};
    } catch { return {}; }
}

/** Persists this slot's customization immediately after every change. */
export function saveOutfit(slot: 'p1' | 'p2', o: OutfitOverride) {
    try { localStorage.setItem(OUTFIT_KEY[slot], JSON.stringify(o)); }
    catch { /* storage unavailable — customization just won't persist */ }
}

// ---- color helpers -------------------------------------------------------

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** '#rrggbb' -> Color; anything invalid falls back to `fallback`. */
export function colorFromHex(hex: string | undefined, fallback: Color): Color {
    if (!hex || !HEX_RE.test(hex)) return fallback.clone();
    const n = parseInt(hex.slice(1), 16);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** Color -> '#rrggbb' for saving / network payloads. */
export function toHex(c: Color): string {
    const h = (v: number) => v.toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * Roster entry merged with a player's custom outfit. Returns a NEW def so
 * fighters never share mutable state with the base roster.
 */
export function resolveChar(index: number, ov?: OutfitOverride): CharacterDef {
    const len = CHARACTERS.length;
    const base = CHARACTERS[((index % len) + len) % len];
    if (!ov) return base;
    return {
        id: base.id,
        nameKey: base.nameKey,
        body: colorFromHex(ov.b, base.body),
        accent: colorFromHex(ov.a, base.accent),
        skin: colorFromHex(ov.s, base.skin),
    };
}
