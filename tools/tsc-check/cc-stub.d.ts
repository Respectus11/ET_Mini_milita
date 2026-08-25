/**
 * Minimal-but-TYPED declarations for the subset of 'cc' the game uses.
 *
 * Unlike the previous all-`any` stub, these shapes let tsc catch REAL bugs
 * in gameplay classes (typos, missing fields/methods on Fighter & friends).
 * Engine internals that don't affect game-code type safety stay loose.
 */
declare module 'cc' {
    // ---- decorators ----------------------------------------------------------
    export const _decorator: {
        ccclass(name?: string): <T extends new (...a: any[]) => any>(target: T) => T;
        property(options?: any): PropertyDecorator;
    };
    export function ccclass(name?: string): <T extends new (...a: any[]) => any>(target: T) => T;

    // ---- math types ----------------------------------------------------------
    export class Vec3 {
        x: number; y: number; z: number;
        constructor(x?: number, y?: number, z?: number);
        clone(): Vec3;
    }

    export class Color {
        r: number; g: number; b: number; a: number;
        constructor(r?: number | string, g?: number, b?: number, a?: number);
        clone(): Color;
        static WHITE: Color;
        static BLACK: Color;
    }

    // ---- component / node tree ----------------------------------------------
    export class Component {
        node: Node;
        enabled: boolean;
        schedule(callback: (dt: number) => void, interval?: number): void;
        scheduleOnce(callback: (...args: any[]) => void, delay?: number): void;
        unschedule(callback: (...args: any[]) => void): void;
        unscheduleAllCallbacks(): void;
    }

    export class Node {
        name: string;
        active: boolean;
        readonly isValid: boolean;
        readonly position: Readonly<Vec3>;
        readonly scale: Readonly<Vec3>;
        readonly children: Node[];
        constructor(name?: string);
        addChild(child: Node): void;
        removeFromParent(): void;
        removeAllChildren(): void;
        destroy(): void;
        setPosition(x: number, y: number, z?: number): void;
        setScale(x: number, y: number, z?: number): void;
        getComponent<T>(type: { new (): T }): T | null;
        getComponentsInChildren<T>(type: { new (): T }): T[];
        getComponentInChildren<T>(type: { new (): T }): T | null;
        addComponent<T>(type: { new (): T }): T;
        getChildByName(name: string): Node | null;
        on(type: string, callback: (event?: any) => void, target?: any): void;
        off(type: string, callback?: (event?: any) => void, target?: any): void;
        static EventType: Record<string, string>;
    }

    export class UITransform extends Component {
        readonly width: number;
        readonly height: number;
        setContentSize(width: number, height: number): void;
    }

    // ---- renderables ---------------------------------------------------------
    export class Graphics extends Component {
        fillColor: Color;
        strokeColor: Color;
        lineWidth: number;
        clear(): void;
        rect(x: number, y: number, w: number, h: number): void;
        roundRect(x: number, y: number, w: number, h: number, r: number): void;
        circle(cx: number, cy: number, r: number): void;
        ellipse(cx: number, cy: number, rx: number, ry: number): void;
        fillRect(x: number, y: number, w: number, h: number): void;
        moveTo(x: number, y: number): void;
        lineTo(x: number, y: number): void;
        arc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
        quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
        close(): void;
        fill(): void;
        stroke(): void;
    }

    export class Label extends Component {
        string: string;
        fontSize: number;
        lineHeight: number;
        isBold: boolean;
        color: Color;
        overflow: any;
        static Overflow: Record<string, any>;
    }

    export class EditBox extends Component {
        string: string;
        placeholder: string;
        maxLength: number;
    }

    // ---- view ----------------------------------------------------------------
    export const view: {
        getVisibleSize(): { width: number; height: number };
        setDesignResolutionSize(width: number, height: number, policy: any): void;
    };
    export const ResolutionPolicy: Record<string, any>;

    // ---- input ---------------------------------------------------------------
    /** Global input bus: register/unregister handlers by event type. */
    export const input: {
        on(type: string, callback: (event?: any) => void, target?: any): void;
        off(type: string, callback?: (event?: any) => void, target?: any): void;
    };

    export const Input: { EventType: Record<string, string> };

    export class EventTouch {
        readonly touch: Touch | null;
    }
    export class Touch {
        getID(): number;
        getUILocation(): { x: number; y: number };
    }
    export class EventKeyboard {
        keyCode: number;
    }
    export const KeyCode: Record<string, number>;

    // ---- platform ------------------------------------------------------------
    export const sys: {
        platform: number;
        isNative: boolean;
        isBrowser: boolean;
        language: string;
        os: number;
        localStorage: {
            getItem(key: string): string | null;
            setItem(key: string, value: string): void;
            removeItem(key: string): void;
            clear(): void;
        };
    };
}

declare const console: any;
