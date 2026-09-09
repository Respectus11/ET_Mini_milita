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
        set(x?: number, y?: number, z?: number): Vec3;
    }

    export class Vec2 {
        x: number; y: number;
        constructor(x?: number, y?: number);
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
        readonly isValid: boolean;
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
        angle: number;
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
        isItalic: boolean;
        color: Color;
        overflow: any;
        horizontalAlign: any;
        verticalAlign: any;
        enableOutline: boolean;
        outlineColor: Color;
        outlineWidth: number;
        enableShadow: boolean;
        shadowColor: Color;
        shadowOffset: Vec2;
        shadowBlur: number;
        static HorizontalAlign: { LEFT: number; CENTER: number; RIGHT: number };
        static VerticalAlign: { TOP: number; CENTER: number; BOTTOM: number };
        static Overflow: { NONE: number; CLAMP: number; SHRINK: number; RESIZE_HEIGHT: number };
    }

    export class EditBox extends Component {
        string: string;
        placeholder: string;
        maxLength: number;
    }

    export class ImageAsset {}
    export class SpriteFrame {
        static createWithImage(image: ImageAsset): SpriteFrame;
    }
    export class Sprite extends Component {
        spriteFrame: SpriteFrame | null;
        sizeMode: number;
        static SizeMode: { CUSTOM: number; TRIMMED: number; RAW: number };
    }

    export const assetManager: {
        loadRemote<T = any>(url: string, onComplete: (err: Error | null, asset: T) => void): void;
    };

    // ---- view ----------------------------------------------------------------
    export const view: {
        getVisibleSize(): { width: number; height: number };
        setDesignResolutionSize(width: number, height: number, policy: any): void;
        getSafeAreaRect(): { x: number; y: number; width: number; height: number };
        setResizeCallback(callback: () => void): void;
        on(event: string, callback: (...args: any[]) => void, target?: any): void;
    };
    export const ResolutionPolicy: Record<string, any>;

    // ---- tween ---------------------------------------------------------------
    export class Tween<T = any> {
        to(duration: number, props: any, opts?: any): Tween<T>;
        by(duration: number, props: any, opts?: any): Tween<T>;
        delay(duration: number): Tween<T>;
        call(fn: (...args: any[]) => void): Tween<T>;
        union(): Tween<T>;
        repeat(repeatTimes: number, embedTween?: Tween<T>): Tween<T>;
        repeatForever(embedTween?: Tween<T>): Tween<T>;
        start(): Tween<T>;
        stop(): Tween<T>;
        static stopAllByTarget(target: any): void;
    }
    export function tween(target?: any): Tween;

    /** Subtree transparency flag — tween `opacity` (0-255) to fade groups. */
    export class UIOpacity extends Component {
        opacity: number;
    }

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

    // ---- director & engine lifecycle -----------------------------------------
    export class Director {
        static EVENT_AFTER_SCENE_LAUNCH: string;
    }
    export const director: {
        on(event: string, callback: (...args: any[]) => void, target?: any): void;
        once(event: string, callback: (...args: any[]) => void, target?: any): void;
        off(event: string, callback?: (...args: any[]) => void, target?: any): void;
        getScene(): any;
        loadScene(sceneName: string, onLaunched?: () => void): boolean;
    };
    export class Canvas extends Component {
        cameraComponent: any;
        alignCanvasWithScreen: boolean;
    }
    export const js: any;
    export const cclegacy: any;
}

declare const console: any;
