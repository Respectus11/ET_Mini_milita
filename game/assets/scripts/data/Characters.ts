/**
 * Characters.ts
 * ---------------------------------------------------------------------------
 * Playable fighter roster. Each entry only changes cosmetics today (colors)
 * but the structure leaves room for future stat differences per character.
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
