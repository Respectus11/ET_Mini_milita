/**
 * FighterArt.ts
 * ---------------------------------------------------------------------------
 * Authentic Mini Militia (Doodle Army) style cartoon soldier renderer.
 * 
 * Features:
 * - Iconic cartoon doodle soldier matching the official app icon.
 * - Bold black cartoon outlines and expressive hand-drawn aesthetic.
 * - Combat helmet with Ethiopian tricolor ribbon (Green, Gold, Red).
 * - Fierce angled eyebrows, focused eyes tracking target, gritted teeth, and beard.
 * - Tactical military fatigues, harness straps, and combat boots.
 * - Supports walking cadence bobbing and tucked-back jetpack flying posture.
 */
import { Color, Graphics } from 'cc';
import { CharacterDef } from '../data/Characters';
import { CFG } from './GameConfig';

const C_OUTLINE = new Color(20, 24, 28, 255);
const C_HELMET = new Color(86, 122, 64, 255);
const C_HELMET_DARK = new Color(64, 94, 48, 255);
const C_HELMET_LGT = new Color(118, 158, 92, 180);
const C_FLAG_GREEN = new Color(22, 162, 68, 255);
const C_FLAG_YELLOW = new Color(252, 214, 26, 255);
const C_FLAG_RED = new Color(228, 42, 42, 255);
const C_BEARD = new Color(44, 28, 20, 255);
const C_WHITE = new Color(255, 255, 255, 255);
const C_PUPIL = new Color(15, 15, 20, 255);
const C_BOOT = new Color(30, 32, 36, 255);
const C_SOLE = new Color(90, 95, 105, 255);
const C_GLOVE = new Color(42, 45, 50, 255);
const C_BELT = new Color(38, 40, 34, 255);
const C_BUCKLE = new Color(180, 185, 192, 255);
const C_STRAP = new Color(46, 56, 40, 255);

/**
 * Draws the complete Mini Militia cartoon soldier rig.
 * @param g The Graphics component to draw into.
 * @param char Character outfit and skin definitions.
 * @param w Body width (CFG.PLAYER_W).
 * @param h Body height (CFG.PLAYER_H).
 * @param faceDir Facing direction (-1 or 1).
 * @param isFlying True when jetpack is active (tucks boots backward).
 * @param walkPhase Running animation timer for foot bobbing.
 */
export function drawFighterRig(
    g: Graphics,
    char: CharacterDef,
    w: number = CFG.PLAYER_W,
    h: number = CFG.PLAYER_H,
    faceDir: number = 1,
    isFlying: boolean = false,
    walkPhase: number = 0
) {
    g.clear();
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;

    const headY = h * 0.22;
    const torsoY = -h * 0.08;
    const bodyW = w * 0.95;

    // =========================================================================
    // 1. LEGS & COMBAT BOOTS
    // =========================================================================
    const legW = w * 0.30;
    const legH = h * 0.32;
    const groundY = -h * 0.48;

    if (isFlying) {
        // Tucked-back flying posture
        const tuckOffset = -faceDir * (w * 0.18);
        const bootY = groundY + 4;

        // Back boot
        drawBoot(g, tuckOffset - w * 0.12, bootY + 2, legW, legH * 0.85, faceDir, true);
        // Front boot
        drawBoot(g, tuckOffset + w * 0.08, bootY, legW, legH * 0.85, faceDir, false);
    } else {
        // Walking or standing
        const bobL = Math.sin(walkPhase) * 3;
        const bobR = -bobL;

        // Left leg / boot
        drawBoot(g, -w * 0.24, groundY + bobL, legW, legH, faceDir, false);
        // Right leg / boot
        drawBoot(g, w * 0.10, groundY + bobR, legW, legH, faceDir, false);
    }

    // =========================================================================
    // 2. TORSO & MILITARY FATIGUES
    // =========================================================================
    const torsoH = h * 0.40;
    const torsoCol = char.body || new Color(74, 108, 56);

    // Torso shadow / outline
    g.lineWidth = 3.5;
    g.strokeColor = C_OUTLINE;
    g.fillColor = torsoCol;
    g.roundRect(-bodyW / 2, torsoY - torsoH / 2, bodyW, torsoH, 7);
    g.fill();
    g.stroke();

    // Military tactical harness / chest straps
    g.lineWidth = 2.5;
    g.strokeColor = C_STRAP;
    // Diagonal harness strap
    g.moveTo(-bodyW * 0.38, torsoY + torsoH * 0.4);
    g.lineTo(bodyW * 0.35, torsoY - torsoH * 0.35);
    g.stroke();

    // Collar / Scarf accent
    const scarfCol = char.accent || C_FLAG_YELLOW;
    g.lineWidth = 2;
    g.strokeColor = C_OUTLINE;
    g.fillColor = scarfCol;
    g.roundRect(-bodyW * 0.42, torsoY + torsoH * 0.32, bodyW * 0.84, torsoH * 0.22, 4);
    g.fill();
    g.stroke();

    // Tactical utility belt
    const beltY = torsoY - torsoH * 0.42;
    g.lineWidth = 2;
    g.strokeColor = C_OUTLINE;
    g.fillColor = C_BELT;
    g.fillRect(-bodyW * 0.48, beltY, bodyW * 0.96, 6);
    g.stroke();

    // Belt buckle
    g.fillColor = C_BUCKLE;
    g.fillRect(-3, beltY + 0.5, 6, 5);

    // =========================================================================
    // 3. HEAD & ICONIC CARTOON FACE
    // =========================================================================
    const headRadius = w * 0.44;

    // Head base (Skin tone)
    const skinCol = char.skin || new Color(192, 134, 90);
    g.lineWidth = 3.5;
    g.strokeColor = C_OUTLINE;
    g.fillColor = skinCol;
    g.circle(0, headY, headRadius);
    g.fill();
    g.stroke();

    // Dark full beard wrapping around jaw & chin (Mini Militia trademark)
    g.fillColor = C_BEARD;
    // Arc across the bottom half of the face
    g.arc(0, headY, headRadius + 0.5, -Math.PI * 0.15, Math.PI * 1.15, true);
    // Upper cheek / mustache curve
    g.lineTo(-faceDir * headRadius * 0.3, headY - 2);
    g.lineTo(faceDir * headRadius * 0.45, headY - 1);
    g.close();
    g.fill();

    // The Gritted Teeth Grimace ("++" Combat Mouth)
    const mouthW = headRadius * 0.85;
    const mouthH = headRadius * 0.38;
    const mouthX = (faceDir * headRadius * 0.16) - mouthW / 2;
    const mouthY = headY - headRadius * 0.46;

    // White teeth box with bold outline
    g.lineWidth = 2.5;
    g.strokeColor = C_OUTLINE;
    g.fillColor = C_WHITE;
    g.roundRect(mouthX, mouthY, mouthW, mouthH, 2.5);
    g.fill();
    g.stroke();

    // Black horizontal line & vertical stitch dividers
    g.lineWidth = 2;
    g.strokeColor = C_OUTLINE;
    // Horizontal center line
    g.moveTo(mouthX + 1, mouthY + mouthH / 2);
    g.lineTo(mouthX + mouthW - 1, mouthY + mouthH / 2);
    g.stroke();
    // Vertical tooth dividers
    const toothStep = mouthW / 3;
    for (let i = 1; i <= 2; i++) {
        const tx = mouthX + i * toothStep;
        g.moveTo(tx, mouthY + 1);
        g.lineTo(tx, mouthY + mouthH - 1);
        g.stroke();
    }

    // =========================================================================
    // 4. LARGE CARTOON EYES & ANGRY EYEBROWS
    // =========================================================================
    const eyeCenterY = headY + headRadius * 0.10;
    const eyeOffsetX = faceDir * (headRadius * 0.26);
    const eyeRadius = headRadius * 0.25;

    // Eye whites with black contour
    g.lineWidth = 2.5;
    g.strokeColor = C_OUTLINE;
    g.fillColor = C_WHITE;
    g.circle(eyeOffsetX, eyeCenterY, eyeRadius);
    g.fill();
    g.stroke();

    // Black pupil looking forward
    g.fillColor = C_PUPIL;
    const pupilX = eyeOffsetX + faceDir * (eyeRadius * 0.32);
    const pupilY = eyeCenterY;
    g.circle(pupilX, pupilY, eyeRadius * 0.52);
    g.fill();

    // Eye catch-light (white reflection shine)
    g.fillColor = C_WHITE;
    g.circle(pupilX - faceDir * 1.5, pupilY + 1.5, eyeRadius * 0.20);
    g.fill();

    // Angry furrowed combat eyebrow
    g.lineWidth = 3.5;
    g.strokeColor = C_OUTLINE;
    const browStartX = eyeOffsetX - faceDir * (eyeRadius * 1.15);
    const browStartY = eyeCenterY + eyeRadius * 0.75;
    const browEndX = eyeOffsetX + faceDir * (eyeRadius * 1.10);
    const browEndY = eyeCenterY + eyeRadius * 1.25;
    g.moveTo(browStartX, browStartY);
    g.lineTo(browEndX, browEndY);
    g.stroke();

    // =========================================================================
    // 5. COMBAT HELMET WITH ETHIOPIAN FLAG TRICOLOR BAND
    // =========================================================================
    const helmCenterY = headY + 3;
    const helmR = headRadius * 1.08;

    // Helmet dome (Dark military olive green)
    g.lineWidth = 3.5;
    g.strokeColor = C_OUTLINE;
    g.fillColor = C_HELMET;
    // Curved dome covering top of head and flaring out at ears
    g.arc(0, helmCenterY, helmR, Math.PI * 0.02, Math.PI * 0.98, false);
    // Ear flap flare
    g.lineTo(-faceDir * helmR * 0.88, helmCenterY - 4);
    g.lineTo(faceDir * helmR * 0.88, helmCenterY - 4);
    g.close();
    g.fill();
    g.stroke();

    // Helmet top highlight
    g.fillColor = C_HELMET_LGT;
    g.arc(0, helmCenterY + 2, helmR * 0.88, Math.PI * 0.25, Math.PI * 0.75, false);
    g.close();
    g.fill();

    // -------------------------------------------------------------------------
    // Ethiopian Flag Ribbon (Green, Yellow, Red) wrapping across the helmet
    // -------------------------------------------------------------------------
    const bandY = helmCenterY + 2;
    const bandW = helmR * 1.82;
    const bandH = 3.2;

    // Green Stripe (Top)
    g.fillColor = C_FLAG_GREEN;
    g.fillRect(-bandW / 2, bandY + bandH * 2, bandW, bandH);

    // Yellow Stripe (Middle)
    g.fillColor = C_FLAG_YELLOW;
    g.fillRect(-bandW / 2, bandY + bandH, bandW, bandH);

    // Red Stripe (Bottom)
    g.fillColor = C_FLAG_RED;
    g.fillRect(-bandW / 2, bandY, bandW, bandH);

    // Dark trim line below flag ribbon
    g.lineWidth = 2.5;
    g.strokeColor = C_OUTLINE;
    g.moveTo(-bandW / 2 - 1, bandY - 0.5);
    g.lineTo(bandW / 2 + 1, bandY - 0.5);
    g.stroke();

    // Helmet rim bulge / brow edge
    g.fillColor = C_HELMET_DARK;
    g.roundRect(-bandW / 2 - 1, bandY - 4, bandW + 2, 4, 1.5);
    g.fill();
    g.stroke();

    // =========================================================================
    // 6. GLOVED HANDS
    // =========================================================================
    // Back support hand gripping near chest
    const handX = faceDir * (bodyW * 0.28);
    const handY = torsoY + 2;
    g.lineWidth = 2.5;
    g.strokeColor = C_OUTLINE;
    g.fillColor = C_GLOVE;
    g.circle(handX, handY, w * 0.16);
    g.fill();
    g.stroke();
}

/**
 * Draws an authentic Mini Militia combat boot with tread sole and rocket nozzle collar.
 */
function drawBoot(
    g: Graphics,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    faceDir: number,
    isBack: boolean
) {
    const bootCol = isBack ? new Color(22, 24, 28) : C_BOOT;

    // Leg trouser cuff
    g.lineWidth = 2.5;
    g.strokeColor = C_OUTLINE;
    g.fillColor = new Color(55, 78, 45);
    g.fillRect(bx, by + bh * 0.45, bw, bh * 0.55);
    g.stroke();

    // Combat boot body
    g.fillColor = bootCol;
    g.moveTo(bx, by + bh * 0.5);
    g.lineTo(bx + bw, by + bh * 0.5);
    g.lineTo(bx + bw + (faceDir * 4), by + 3);
    g.lineTo(bx - 2, by + 3);
    g.close();
    g.fill();
    g.stroke();

    // Silver/grey tread sole (rocket boot exhaust plate)
    g.fillColor = C_SOLE;
    g.fillRect(bx - 2, by, bw + 6, 3.5);
    g.stroke();
}
