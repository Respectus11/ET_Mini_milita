/**
 * TouchControls.ts
 * ---------------------------------------------------------------------------
 * Mini-Militia-style dual-stick touch handling.
 *
 * 1P mode : left half of the screen is the move/jetpack stick (push up to
 *           fly, pull down to drop through platforms), right half is the
 *           aim stick — pushing it past 30% fires.
 * 2P mode : P1 owns the left 45% of the screen, P2 the right 45%; the middle
 *           10% is dead space so thumbs don't cross contaminate sticks.
 *
 * Sticks are "floating": the origin is wherever the finger first lands.
 */
import { _decorator, Component, EventTouch, input, Input, view } from 'cc';
const { ccclass } = _decorator;
import { AimInput, Fighter, MoveInput } from '../gameplay/Fighter';
import { StickState, stickVec } from './Stick';

interface Slot { side: 0 | 1; slot: 'move' | 'aim'; }

/**
 * Mini-Militia-style dual-stick touch controls.
 * 1P mode: left half of screen = move/jetpack stick, right half = aim/fire stick.
 * 2P same-device mode: P1 owns left 45%, P2 owns right 45% of the screen.
 */
@ccclass('TouchControls')
export class TouchControls extends Component {
    enabledP1 = true;
    enabledP2 = false;

    private sticks: Map<number, Slot> = new Map();
    /** Magnitude of the P1 aim stick last frame (LAN guest fire intent). */
    lastMagP1 = 0;
    private p1move: StickState = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };
    private p1aim: StickState = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };
    private p2move: StickState = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };
    private p2aim: StickState = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };

    start() {
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

    clearAll(f1: Fighter, f2: Fighter | null) {
        const reset = (f: Fighter) => {
            const m: MoveInput = f.moveIn, a: AimInput = f.aimIn;
            m.mx = 0; m.jet = false; m.dropDown = false;
            a.aiming = false;
        };
        reset(f1);
        if (f2) reset(f2);
    }
}
