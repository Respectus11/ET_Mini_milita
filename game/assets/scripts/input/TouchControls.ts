/**
 * TouchControls.ts
 * ---------------------------------------------------------------------------
 * Authentic Mini-Militia-style dual virtual joysticks with visual feedback.
 *
 * Left Stick : 360° flight thruster & ground move (push up to fly with jetpack).
 * Right Stick: 360° aim reticle & auto-fire (pull past 30% to fire weapon).
 *
 * Features:
 * - Rendered virtual joysticks (base rings, thumb pucks, fire thresholds).
 * - Rest/idle guide indicators so players immediately know where to place thumbs.
 * - Dynamic floating response: expands and anchors wherever the finger lands.
 */
import { _decorator, Color, Component, EventTouch, Graphics, input, Input, Node, UITransform, view } from 'cc';
const { ccclass } = _decorator;
import { AimInput, Fighter, MoveInput } from '../gameplay/Fighter';
import { StickState, stickVec } from './Stick';
import { ensureUT } from '../core/UIUtil';

interface Slot { side: 0 | 1; slot: 'move' | 'aim'; }

const C_BASE_BG = new Color(20, 25, 32, 100);
const C_BASE_BORDER = new Color(70, 180, 240, 150);
const C_PUCK_MOVE = new Color(60, 200, 255, 180);
const C_PUCK_AIM_IDLE = new Color(240, 200, 60, 180);
const C_PUCK_AIM_FIRE = new Color(255, 80, 40, 230);
const C_FIRE_RING = new Color(255, 90, 50, 120);

@ccclass('TouchControls')
export class TouchControls extends Component {
    enabledP1 = true;
    enabledP2 = false;

    private sticks: Map<number, Slot> = new Map();
    lastMagP1 = 0;
    private p1move: StickState = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };
    private p1aim: StickState = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };
    private p2move: StickState = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };
    private p2aim: StickState = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };

    private g: Graphics = null!;

    start() {
        ensureUT(this.node);
        this.g = this.node.addComponent(Graphics);

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    private classify(x: number): Slot | null {
        const w = view.getVisibleSize().width;
        if (this.enabledP2) {
            const isLeft = x < w * 0.45;
            const isRight = x > w * 0.55;
            if (!isLeft && !isRight) return null;
            const side: 0 | 1 = isLeft ? 0 : 1;
            const midX = isLeft ? w * 0.225 : w * 0.775;
            return { side, slot: x < midX ? 'move' : 'aim' };
        }
        return { side: 0, slot: x < w / 2 ? 'move' : 'aim' };
    }

    private stateFor(s: Slot): StickState {
        if (s.side === 0) return s.slot === 'move' ? this.p1move : this.p1aim;
        return s.slot === 'move' ? this.p2move : this.p2aim;
    }

    private onTouchStart(e: EventTouch) {
        const t = e.touch!;
        const ui = t.getUILocation();
        const cls = this.classify(ui.x);
        if (!cls) return;
        const st = this.stateFor(cls);
        if (st.active) return;
        this.sticks.set(t.getID(), cls);
        st.active = true;
        st.ox = ui.x; st.oy = ui.y; st.cx = ui.x; st.cy = ui.y;
    }

    private onTouchMove(e: EventTouch) {
        const s = this.sticks.get(e.touch!.getID());
        if (!s) return;
        const ui = e.touch!.getUILocation();
        const st = this.stateFor(s);
        st.cx = ui.x; st.cy = ui.y;
    }

    private onTouchEnd(e: EventTouch) {
        const s = this.sticks.get(e.touch!.getID());
        if (!s) return;
        this.sticks.delete(e.touch!.getID());
        this.stateFor(s).active = false;
    }

    applyTo(f1: Fighter, f2: Fighter | null) {
        if (this.enabledP1) {
            this.driveFighter(f1, this.p1move, this.p1aim);
            const [, , m] = stickVec(this.p1aim, 24);
            this.lastMagP1 = f1.alive ? m : 0;
        }
        if (this.enabledP2 && f2) this.driveFighter(f2, this.p2move, this.p2aim);

        this.renderVisualSticks();
    }

    private driveFighter(f: Fighter, mv: StickState, aim: StickState) {
        if (!f.alive) { this.lastMagP1 = 0; return; }
        const [mx, my] = stickVec(mv, 12);
        f.moveIn.mx = mx;
        f.moveIn.jet = my > 0.25;
        f.moveIn.dropDown = my < -0.55;

        const [ax, ay, mag] = stickVec(aim, 24);
        if (mag > 0) {
            f.aimIn.ax = ax || f.faceDir;
            f.aimIn.ay = ay;
            f.aimIn.aiming = true;
            if (mag > 0.3) f.tryFire();
        } else {
            f.aimIn.aiming = false;
        }
    }

    private renderVisualSticks() {
        if (!this.g) return;
        const g = this.g;
        g.clear();

        const vis = view.getVisibleSize();
        const halfW = vis.width / 2;
        const halfH = vis.height / 2;

        const toNodeX = (uiX: number) => uiX - halfW;
        const toNodeY = (uiY: number) => uiY - halfH;

        const R_BASE = 72;
        const R_PUCK = 28;

        // Default resting positions if not touched
        const defaultMoveX = -halfW + 160;
        const defaultMoveY = -halfH + 160;
        const defaultAimX = halfW - 160;
        const defaultAimY = -halfH + 160;

        // 1. Move Joystick (Left)
        if (this.p1move.active) {
            const ox = toNodeX(this.p1move.ox);
            const oy = toNodeY(this.p1move.oy);
            const dx = this.p1move.cx - this.p1move.ox;
            const dy = this.p1move.cy - this.p1move.oy;
            const dist = Math.min(R_BASE, Math.hypot(dx, dy));
            const angle = Math.atan2(dy, dx);
            const px = ox + Math.cos(angle) * dist;
            const py = oy + Math.sin(angle) * dist;

            // Outer ring
            g.lineWidth = 3;
            g.strokeColor = C_BASE_BORDER;
            g.fillColor = C_BASE_BG;
            g.circle(ox, oy, R_BASE);
            g.fill();
            g.stroke();

            // Inner thumb puck
            g.lineWidth = 2.5;
            g.strokeColor = new Color(255, 255, 255, 220);
            g.fillColor = C_PUCK_MOVE;
            g.circle(px, py, R_PUCK);
            g.fill();
            g.stroke();
        } else {
            // Subtle resting outline
            g.lineWidth = 2;
            g.strokeColor = new Color(70, 180, 240, 60);
            g.circle(defaultMoveX, defaultMoveY, R_BASE * 0.85);
            g.stroke();
            g.fillColor = new Color(70, 180, 240, 40);
            g.circle(defaultMoveX, defaultMoveY, R_PUCK * 0.75);
            g.fill();
        }

        // 2. Aim Joystick (Right)
        if (this.p1aim.active) {
            const ox = toNodeX(this.p1aim.ox);
            const oy = toNodeY(this.p1aim.oy);
            const dx = this.p1aim.cx - this.p1aim.ox;
            const dy = this.p1aim.cy - this.p1aim.oy;
            const dist = Math.min(R_BASE, Math.hypot(dx, dy));
            const angle = Math.atan2(dy, dx);
            const px = ox + Math.cos(angle) * dist;
            const py = oy + Math.sin(angle) * dist;
            const isFiring = dist > R_BASE * 0.30;

            // Outer ring
            g.lineWidth = 3;
            g.strokeColor = isFiring ? C_FIRE_RING : C_BASE_BORDER;
            g.fillColor = C_BASE_BG;
            g.circle(ox, oy, R_BASE);
            g.fill();
            g.stroke();

            // Fire threshold circle
            g.lineWidth = 1.5;
            g.strokeColor = new Color(255, 120, 60, 130);
            g.circle(ox, oy, R_BASE * 0.30);
            g.stroke();

            // Aim direction guide
            if (dist > 10) {
                g.lineWidth = 2;
                g.strokeColor = isFiring ? new Color(255, 80, 40, 190) : new Color(250, 210, 60, 160);
                g.moveTo(ox, oy);
                g.lineTo(ox + Math.cos(angle) * R_BASE * 1.15, oy + Math.sin(angle) * R_BASE * 1.15);
                g.stroke();
            }

            // Inner thumb puck
            g.lineWidth = 2.5;
            g.strokeColor = new Color(255, 255, 255, 220);
            g.fillColor = isFiring ? C_PUCK_AIM_FIRE : C_PUCK_AIM_IDLE;
            g.circle(px, py, R_PUCK);
            g.fill();
            g.stroke();
        } else {
            // Subtle resting outline
            g.lineWidth = 2;
            g.strokeColor = new Color(250, 210, 60, 60);
            g.circle(defaultAimX, defaultAimY, R_BASE * 0.85);
            g.stroke();
            g.fillColor = new Color(250, 210, 60, 40);
            g.circle(defaultAimX, defaultAimY, R_PUCK * 0.75);
            g.fill();
        }
    }

    clearAll(f1: Fighter, f2: Fighter | null) {
        const reset = (f: Fighter) => {
            const m: MoveInput = f.moveIn, a: AimInput = f.aimIn;
            m.mx = 0; m.jet = false; m.dropDown = false;
            a.aiming = false;
        };
        reset(f1);
        if (f2) reset(f2);
        this.g?.clear();
    }
}
