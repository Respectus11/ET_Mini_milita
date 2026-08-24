/**
 * KeyboardControls.ts
 * ---------------------------------------------------------------------------
 * Desktop testing input: WASD/Arrows to move (Space/W flies the jetpack,
 * S drops through platforms), mouse aims, left button fires, R reloads.
 * Phones use TouchControls instead; MatchManager wires only one of them.
 */
import { _decorator, Component, EventKeyboard, input, Input, KeyCode } from 'cc';
const { ccclass } = _decorator;
import { Fighter } from '../gameplay/Fighter';

/** WASD move/jet + mouse aim/fire. Desktop testing only; phones use TouchControls. */
@ccclass('KeyboardControls')
export class KeyboardControls extends Component {
    keys: Set<number> = new Set();
    mouseDown = false;
    mouseX = 0; mouseY = 0;
    /** Distance of last aim vector (LAN guest fire intent uses >4 && mouseDown). */
    lastAimLen = 0;

    start() {
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouse, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouse, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    private onKey(e: EventKeyboard) {
        this.keys.add(e.keyCode);
        if (e.keyCode === KeyCode.KEY_R) this.reloadRequest = true;
    }
    private onKeyUp(e: EventKeyboard) { this.keys.delete(e.keyCode); }

    reloadRequest = false;

    private onMouse(e: any) {
        this.mouseDown = e.getType() === Input.EventType.MOUSE_DOWN;
    }
    private onMouseMove(e: any) {
        const p = e.getUILocation();
        this.mouseX = p.x; this.mouseY = p.y;
    }
    private onMouseUp(e: any) { this.mouseDown = false; }

    applyTo(f: Fighter, worldToUi: (x: number, y: number) => [number, number]) {
        if (!f.alive) { this.lastAimLen = 0; return; }
        const k = this.keys;
        let mx = 0;
        if (k.has(KeyCode.KEY_A) || k.has(KeyCode.ARROW_LEFT)) mx -= 1;
        if (k.has(KeyCode.KEY_D) || k.has(KeyCode.ARROW_RIGHT)) mx += 1;
        f.moveIn.mx = mx;
        f.moveIn.jet = k.has(KeyCode.SPACE) || k.has(KeyCode.KEY_W) || k.has(KeyCode.ARROW_UP);
        f.moveIn.dropDown = k.has(KeyCode.KEY_S) || k.has(KeyCode.ARROW_DOWN);

        // aim from fighter position toward mouse
        const [ux, uy] = worldToUi(f.x, f.y);
        const dx = this.mouseX - ux;
        const dy = this.mouseY - uy;
        const len = Math.hypot(dx, dy);
        this.lastAimLen = len;
        if (len > 4) {
            f.aimIn.ax = dx / len;
            f.aimIn.ay = dy / len;
            f.aimIn.aiming = true;
            if (this.mouseDown) f.tryFire();
        } else {
            f.aimIn.aiming = false;
        }
        if (this.reloadRequest) { f.startReload(); this.reloadRequest = false; }
    }
}
