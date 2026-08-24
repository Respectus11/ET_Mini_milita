/**
 * FighterArt.ts
 * ---------------------------------------------------------------------------
 * Single source of truth for the blocky fighter rig drawing. Both the
 * in-game Fighter component and the menu's outfit-editor preview call
 * this, so what you customize is exactly what plays.
 */
import { Color, Graphics } from 'cc';
import { CharacterDef } from '../data/Characters';
import { CFG } from './GameConfig';

/**
 * Draws a fighter centered on the origin of `g` at body size w x h.
 * `faceDir` (-1|1) mirrors the eye/gun like the live component does.
 */
export function drawFighterRig(g: Graphics, char: CharacterDef,
                               w: number = CFG.PLAYER_W, h: number = CFG.PLAYER_H,
                               faceDir: number = 1) {
    g.clear();
    // legs
    g.fillColor = new Color(40, 40, 48);
    g.rect(-w * 0.38, -h / 2, w * 0.28, h * 0.34);
    g.fill();
    g.rect(w * 0.10, -h / 2, w * 0.28, h * 0.34);
    g.fill();
    // torso — the customizable clothes color
    g.fillColor = char.body;
    g.roundRect(-w / 2, -h * 0.18, w, h * 0.52, 8);
    g.fill();
    // scarf accent
    g.fillColor = char.accent;
    g.roundRect(-w / 2, h * 0.16, w, h * 0.14, 5);
    g.fill();
    // head — the customizable skin tone
    g.fillColor = char.skin;
    g.circle(0, h * 0.30, w * 0.34);
    g.fill();
    // helmet
    g.fillColor = new Color(50, 50, 60);
    g.arc(0, h * 0.30, w * 0.36, Math.PI * 0.05, Math.PI * 0.95, false);
    g.fill();
    g.fillRect(-w * 0.36, h * 0.27, w * 0.72, h * 0.07);
    // eye
    g.fillColor = new Color(255, 255, 255);
    g.circle(faceDir * w * 0.16, h * 0.29, w * 0.08);
    g.fill();
    g.fillColor = new Color(20, 20, 20);
    g.circle(faceDir * w * 0.19, h * 0.29, w * 0.04);
    g.fill();
    // NOTE: the held weapon is NOT drawn here — it lives on a dedicated
    // child layer rendered by gameplay/GunArt.drawGun (see Fighter.init).
}
