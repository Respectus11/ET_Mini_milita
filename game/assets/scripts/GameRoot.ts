/**
 * GameRoot.ts
 * ---------------------------------------------------------------------------
 * Application entry point and phase machine: MENU -> GAME -> RESULTS.
 * Attach this single component to any node in the scene and it constructs
 * the entire game (menu UI, match, HUD, input systems) from code — no
 * prefabs or editor wiring required.
 *
 * Also sets the 1920x1080 FIXED_HEIGHT design resolution on startup.
 */
import { _decorator, Color, Component, Graphics, Label, Node, sys, UIOpacity, UITransform, view, ResolutionPolicy, director, Director, Canvas, js, cclegacy } from 'cc';
const { ccclass } = _decorator;
import { loadLang } from './data/Strings';
import { MainMenu, MenuState } from './ui/MainMenu';
import { GameHUD } from './ui/GameHUD';
import { LoadingScreen } from './ui/LoadingScreen';
import { MatchManager } from './gameplay/MatchManager';
import { TouchControls } from './input/TouchControls';
import { KeyboardControls } from './input/KeyboardControls';
import { t } from './data/Strings';
import { coverSize, ensureUT, makeButton, TYPE } from './core/UIUtil';
import { DUR, fadeTo, popIn, punchScale } from './core/Motion';
import { Theme } from './core/Theme';
import { Effects } from './world/Effects';
import { Sfx } from './core/Audio';

type Phase = 'MENU' | 'GAME' | 'RESULTS';
@ccclass('GameRoot')
export class GameRoot extends Component {
    private phase: Phase = 'MENU';
    private menuNode: Node = null!;
    private gameNode: Node = null!;
    private hud: GameHUD = null!;
    private touch: TouchControls = null!;
    private keys: KeyboardControls = null!;
    private errorNode: Node = null!;
    private rotatePromptNode: Node | null = null;

    /** Set once the menu built successfully — after this, uncaught errors are only logged. */
    private static booted = false;
    private static trapped = false;
    private static instance: GameRoot | null = null;
    /** First uncaught error captured by the global hooks (null when clean). */
    private static lastFatal: string | null = null;

    onLoad() {
        GameRoot.instance = this;
        ensureUT(this.node).setContentSize(1920, 1080);
    }

    onDestroy() {
        if (GameRoot.instance === this) GameRoot.instance = null;
    }

    start() {
        try {
            ensureUT(this.node).setContentSize(1920, 1080);
            view.setDesignResolutionSize(1920, 1080, ResolutionPolicy.FIXED_HEIGHT);
            this.logDeviceInfo();
            loadLang();
            this.setupOrientationHandler();
            this.showMenu();
            GameRoot.booted = true;
        } catch (err) {
            // A failure here used to mean a silent black screen on device —
            // surface it as readable on-screen text instead.
            const text = GameRoot.describe(err);
            try { console.error('[ETMM] startup failed: ' + text); } catch { /* ignore */ }
            this.showFatalError(text);
        }
    }

    private setupOrientationHandler() {
        try {
            view.setResizeCallback(() => {
                this.checkOrientation();
                if (this.phase === 'MENU' && this.menuNode && this.menuNode.isValid) {
                    this.showMenu();
                }
            });
            this.checkOrientation();
        } catch { /* ignore */ }
    }

    private checkOrientation() {
        try {
            const vs = view.getVisibleSize();
            const isPortrait = vs.width > 0 && vs.height > 0 && vs.width < vs.height;
            if (isPortrait) {
                this.showRotatePrompt();
            } else {
                this.hideRotatePrompt();
            }
        } catch { /* ignore */ }
    }

    private showRotatePrompt() {
        if (this.rotatePromptNode && this.rotatePromptNode.isValid) return;
        try {
            const W = Math.max(1920, coverSize().w);
            const H = Math.max(1080, coverSize().h);
            const pn = new Node('rotate_prompt');
            this.node.addChild(pn);
            ensureUT(pn).setContentSize(W, H);
            pn.setPosition(0, 0, 0);

            const g = pn.addComponent(Graphics);
            g.fillColor = new Color(14, 18, 26, 250);
            g.rect(-W / 2, -H / 2, W, H);
            g.fill();

            const lblN = new Node('r_lbl');
            pn.addChild(lblN);
            ensureUT(lblN).setContentSize(W * 0.9, 300);
            lblN.setPosition(0, 0, 0);
            const l = lblN.addComponent(Label);
            l.string = '🔄\nPlease rotate your device to Landscape';
            l.fontSize = 42;
            l.lineHeight = 58;
            l.isBold = true;
            l.color = new Color(255, 226, 150);
            l.overflow = Label.Overflow.SHRINK;

            this.rotatePromptNode = pn;
        } catch { /* ignore */ }
    }

    private hideRotatePrompt() {
        if (this.rotatePromptNode && this.rotatePromptNode.isValid) {
            this.rotatePromptNode.destroy();
        }
        this.rotatePromptNode = null;
    }

    // ---------- MENU ----------
    private showMenu() {
        this.phase = 'MENU';
        this.cdToken++;
        this.fxUI?.clear();
        this.fxUI = null;
        this.clearGame();
        this.clearMenu();
        if (this.lan) {
            this.lan.disconnect();
            this.lan = null;
        }

        this.menuNode = new Node('menu');
        this.node.addChild(this.menuNode);
        ensureUT(this.menuNode).setContentSize(1920, 1080);
        const menu = this.menuNode.addComponent(MainMenu);
        menu.onStart = (s: MenuState) => this.startMatch(s);
        menu.build();
    }

    // ---------- GAME ----------
    private startMatch(s: MenuState) {
        this.clearMenu();
        this.clearGame();

        // Display historical warrior artwork and quote on the loading screen
        const loadNode = new Node('loading_screen');
        this.node.addChild(loadNode);
        const loader = loadNode.addComponent(LoadingScreen);
        loader.onLoaded = () => {
            this.launchMatch(s);
        };
        loader.build();
    }

    private launchMatch(s: MenuState) {
        this.phase = 'GAME';

        this.gameNode = new Node('game');
        this.node.addChild(this.gameNode);
        ensureUT(this.gameNode).setContentSize(1920, 1080);

        const netRole = s.mode === 'netHost' ? 'host'
            : s.mode === 'netGuest' ? 'guest' : 'off';

        const match = this.gameNode.addComponent(MatchManager);
        match.opts = {
            mapIndex: s.mapIndex,
            twoPlayers: s.twoPlayers,
            charP1: s.charP1,
            charP2: s.charP2,
            outfitP1: s.outfitP1,
            outfitP2: s.outfitP2,
            netRole,
            botCount: s.botCount,
            difficulty: s.difficulty,
            fragLimit: s.fragLimit,
            matchTime: s.matchTime,
        };

        match.onEnd = (winnerId) => this.scheduleOnce(() => this.showResults(match, winnerId), 0.9);

        // LAN wiring: route peer messages into the match, own lifecycle here
        if (s.lan) {
            this.lan = s.lan;
            match.netSend = d => this.lan!.send(d);
            this.lan.onData = d => {
                if (this.phase === 'GAME') match.handlePeerMsg(d);
            };
            this.lan.onPeerGone = () => {
                if (this.phase === 'GAME') this.showResults(match, null, t('opp_left'));
            };
        }

        // Input systems live UNDER gameNode so clearGame() frees the
        // whole match (fixes node/input leaks on rematch).
        const inputNode = new Node('input');
        this.gameNode.addChild(inputNode);
        this.touch = inputNode.addComponent(TouchControls);
        this.touch.enabledP1 = true;
        this.touch.enabledP2 = netRole === 'off' && s.twoPlayers;
        this.keys = inputNode.addComponent(KeyboardControls);

        // after match roster exists, wire everything
        match.start();

        // HUD is added AFTER match.start() so it renders above fighters
        const hudNode = new Node('hud');
        this.gameNode.addChild(hudNode);
        this.hud = hudNode.addComponent(GameHUD);
        this.hud.build(match.fighters, () => this.showResults(match, null, t('paused')), match.myFighterId);
        this.hud.refresh();

        // ---- 3-2-1-GO countdown (host/offline; guests mirror the host) ----
        if (netRole !== 'guest') {
            match.frozen = true;
            const token = ++this.cdToken;
            const step = (label: string, delay: number) => this.scheduleOnce(() => {
                if (token !== this.cdToken || this.phase !== 'GAME') return;
                this.hud.showMessage(label, 0.62);
                Sfx.playCountdown(label);
            }, delay);
            step('3', 0.05);
            step('2', 0.75);
            step('1', 1.45);
            this.scheduleOnce(() => {
                if (token !== this.cdToken || this.phase !== 'GAME') return;
                match.frozen = false;
                this.hud.showMessage(t('start'), 0.8);
                Sfx.playCountdown('start');
            }, 2.15);
        }

        const world = match.world;
        const toScreenUi = (wx: number, wy: number): [number, number] => {
            const vs = view.getVisibleSize();
            const sx = (vs.width - world.worldW) / 2 + wx;
            const sy = (vs.height - world.worldH) / 2 + wy;
            return [sx, sy];
        };

        if (netRole === 'guest') {
            // The guest controls humans[1] (its own fighter); inputs are
            // relayed to the host instead of driving local physics.
            const me = match.humans[1];
            match.myFighterId = me.id;
            this.touchApply = () => {
                this.touch.applyTo(me, null);
                match.guestFireTouch = this.touch.lastMagP1 > 0.3;
            };
            this.keys.onReload = () => { match.guestReload = true; };
            this.keys.onGrenade = () => { match.guestGrenade = true; };
            this.hud.onGrenade = () => { match.guestGrenade = true; };
            this.keyboardApply = f => {
                void f;
                this.keys.applyTo(me, toScreenUi);
                match.guestFireKeys = this.keys.lastAimLen > 4 && this.keys.mouseDown;
            };
            match.touchApply = f1f2 => this.touchApply!(f1f2, null);
            match.keyboardApply = f => this.keyboardApply!(f);
        } else {
            this.hud.onGrenade = () => {
                const me = match.humans[0];
                if (me) me.tryThrowGrenade();
            };
            this.touchApply = (f1, f2) => {
                this.touch.applyTo(f1, f2);
                if (netRole === 'host') match.guestFireTouch = false;
            };
            this.keyboardApply = (f) => {
                this.keys.applyTo(f, toScreenUi);
            };
            match.touchApply = (f1, f2) => this.touchApply!(f1, f2);
            match.keyboardApply = (f) => this.keyboardApply!(f);
        }

        this.matchRef = match;
        this.schedule(this.gameTick, 0);
    }

    private matchRef: MatchManager = null!;
    private lan: import('./net/LanClient').LanClient | null = null;
    private touchApply: ((f1: any, f2: any) => void) | null = null;
    private keyboardApply: ((f: any) => void) | null = null;
    private cdToken = 0;
    private fxUI: Effects | null = null;

    private gameTick(dt = 0) {
        if (!this.matchRef || this.phase !== 'GAME') return;
        const match = this.matchRef;
        try {
            this.hud.refresh(dt);
            // center readout: LOCAL player's score vs the rest
            let scoreStr = '';
            for (let i = 1; i < match.fighters.length; i++) {
                const f = match.fighters[i];
                scoreStr += `: ${match.scoreOf(f.id)} `;
            }
            const leader = match.fighters.find(f => f.id === match.myFighterId)
                ?? match.fighters[0];
            if (leader) {
                this.hud.setScores(match.scoreOf(leader.id),
                    scoreStr.trim(), match.timeStr(), match.leaderId());
            }
        } catch (err) {
            // A HUD glitch must never freeze or blank a running match.
            try { console.error('[ETMM] gameTick failed: ' + err); } catch { /* ignore */ }
        }
    }

    // ---------- RESULTS ----------
    private showResults(match: MatchManager, winnerId: number | null, titleOverride?: string) {
        if (this.phase !== 'GAME') return;
        this.unschedule(this.gameTick);
        this.phase = 'RESULTS';
        this.cdToken++;
        match.matchOver = true; // freeze simulation behind overlay

        const W = coverSize().w, H = Math.max(1080, coverSize().h);
        const rn = new Node('results');
        this.node.addChild(rn);
        rn.addComponent(UITransform);
        const g = rn.addComponent(Graphics);
        g.fillColor = new Color(8, 10, 16, 220);
        g.rect(-W / 2, -H / 2, W, H);
        g.fill();
        const rop = rn.getComponent(UIOpacity) ?? rn.addComponent(UIOpacity);
        rop.opacity = 0;
        fadeTo(rn, 255, DUR.quick);

        const winner = match.fighters.find(f => f.id === winnerId);
        const isNet = match.opts.netRole !== undefined && match.opts.netRole !== 'off';
        let titleKey: string;
        if (!winner) {
            // explicit pause/quit title, or a natural end nobody won (0:0)
            titleKey = titleOverride ?? 'draw';
        } else if (isNet) {
            titleKey = winner.id === match.myFighterId ? 'you_win' : 'you_lose';
        } else if (match.opts.twoPlayers) {
            titleKey = winner.teamLabel === 'P1' ? 'p1_wins' : 'p2_wins';
        } else {
            titleKey = winner.teamLabel === 'P1' ? 'you_win' : 'you_lose';
        }

        const tn = new Node('title');
        rn.addChild(tn);
        tn.addComponent(UITransform);
        const tl = tn.addComponent(Label);
        tl.string = t(titleKey);
        tl.fontSize = TYPE.display;
        tl.lineHeight = Math.floor(TYPE.display * 1.15);
        tl.isBold = true;
        tl.color = new Color(255, 226, 150);
        tn.setPosition(0, 260, 0);

        const sn = new Node('scores');
        rn.addChild(sn);
        sn.addComponent(UITransform);
        const sl = sn.addComponent(Label);
        sl.string = match.fighters
            .map(f => `${t(f.char.nameKey)} (${f.teamLabel}): ${match.scoreOf(f.id)}`)
            .join('\n');
        sl.fontSize = TYPE.h3;
        sl.lineHeight = Math.floor(TYPE.h3 * 1.4);
        sn.setPosition(0, 60, 0);

        // ---- celebration juice: confetti + title punch + score count-up ----
        const flagColors = [
            Theme.gold, Theme.goldHi, Theme.flagGreen, Theme.flagRed,
            new Color(255, 255, 255),
        ];
        const localWin = !!winner && (winner.id === match.myFighterId
            || (!isNet && match.opts.twoPlayers));
        this.fxUI = new Effects(rn);
        if (localWin) {
            this.fxUI.confetti(0, 340, flagColors, 46);
            this.scheduleOnce(() => {
                if (this.fxUI && this.phase === 'RESULTS') {
                    this.fxUI.confetti(-280, 220, flagColors, 18);
                    this.fxUI.confetti(280, 220, flagColors, 18);
                }
            }, 0.5);
        }
        this.schedule(this.uiFxTick, 0);
        punchScale(tn, 1.1, DUR.dramatic);

        const rows = match.fighters.map(f => ({
            pre: `${t(f.char.nameKey)} (${f.teamLabel}): `,
            s: match.scoreOf(f.id),
        }));
        let elapsed = 0;
        const counter = (cbt: number) => {
            if (this.phase !== 'RESULTS') { this.unschedule(counter); return; }
            elapsed += cbt;
            const k = Math.min(1, elapsed / 0.8);
            sl.string = rows.map(r => r.pre + Math.round(r.s * k)).join('\n');
            if (k >= 1) this.unschedule(counter);
        };
        this.schedule(counter, 0);

        const netMatch = match.opts.netRole !== undefined && match.opts.netRole !== 'off';
        if (netMatch) {
            // No instant rematch over LAN — return to the room via the menu.
            this.resultButton(rn, 0, -180, t('menu'), () => {
                rn.destroy();
                this.leaveNetAndShowMenu();
            }, new Color(62, 74, 96), 380, 96, 0);
        } else {
            this.resultButton(rn, -260, -180, t('rematch'), () => {
                const opts = match.opts;
                rn.destroy();
                this.startMatch({
                    mode: opts.twoPlayers ? 'local' : 'bots',
                    mapIndex: opts.mapIndex,
                    twoPlayers: opts.twoPlayers,
                    charP1: opts.charP1,
                    charP2: opts.charP2,
                    outfitP1: opts.outfitP1,
                    outfitP2: opts.outfitP2,
                    lan: null,
                });
            }, new Color(46, 125, 50), 380, 96, 0.08);

            this.resultButton(rn, 260, -180, t('menu'), () => {
                rn.destroy();
                this.showMenu();
            }, new Color(62, 74, 96), 380, 96, 0.16);
        }
    }

    /** Tears down any live LAN session and rebuilds the main menu. */
    private leaveNetAndShowMenu() {
        this.showMenu();
    }

    private resultButton(parent: Node, x: number, y: number, text: string,
                         onClick: () => void, color: Color, w: number, h: number,
                         delay = 0) {
        const n = makeButton(parent, {
            text, x, y, w, h, fill: color, fontSize: TYPE.h3, onClick,
        });
        popIn(n, DUR.medium, 0.3 + delay);
        return n;
    }

    /** Drives the results-screen confetti while RESULTS is active. */
    private uiFxTick(dt: number) {
        if (this.phase !== 'RESULTS') { this.unschedule(this.uiFxTick); return; }
        this.fxUI?.tick(dt);
    }

    // ---------- cleanup ----------
    private clearMenu() {
        if (this.menuNode && this.menuNode.isValid) this.menuNode.destroy();
        this.menuNode = null!;
    }

    private clearGame() {
        this.unschedule(this.gameTick);
        this.unschedule(this.uiFxTick);
        this.fxUI?.clear();
        this.fxUI = null;
        if (this.gameNode && this.gameNode.isValid) this.gameNode.destroy();
        this.gameNode = null!;
    }

    // ---------- boot safety: never die into a silent black screen ----------

    /**
     * Replaces the screen with a readable error report instead of a silent
     * black screen. Uses only basic built-ins (Node + Label) so it can render
     * even when the failing subsystem was fancier (Graphics, storage, input,
     * the menu itself). Everything is also logged to console, which reaches
     * `adb logcat` on Android.
     */
    private showFatalError(message: string) {
        if (this.errorNode && this.errorNode.isValid) return;
        try {
            this.clearMenu();
            this.clearGame();
            const W = Math.max(1920, coverSize().w);
            const H = Math.max(1080, coverSize().h);
            const n = new Node('fatal_error');
            this.node.addChild(n);
            n.addComponent(UITransform);
            n.getComponent(UITransform)!.setContentSize(W * 0.92, H * 0.85);
            const lbl = n.addComponent(Label);
            lbl.string = 'Startup error — please report this text:\n\n'
                + String(message).slice(0, 600);
            lbl.fontSize = 30;
            lbl.lineHeight = 40;
            lbl.color = new Color(255, 128, 128);
            lbl.overflow = Label.Overflow.SHRINK;
            n.setPosition(0, 0, 0);
            this.errorNode = n;
        } catch (nested) {
            // Even the error screen failed — keep the log alive at least.
            try { console.error('[ETMM] could not render the error screen: ' + nested); } catch { /* ignore */ }
        }
    }

    /** Installs the global error hooks once; public because it is invoked at module evaluation time (file bottom). */
    static captureGlobalErrors() {
        if (GameRoot.trapped) return;
        GameRoot.trapped = true;
        try {
            const g: any = typeof globalThis !== 'undefined'
                ? globalThis
                : (typeof window !== 'undefined' ? window : null);
            if (!g || typeof g.addEventListener !== 'function') return;
            g.addEventListener('error', (e: any) => {
                GameRoot.report(e && (e.message || (e.error && e.error.message)) || 'Unknown script error');
            });
            g.addEventListener('unhandledrejection', (e: any) => {
                GameRoot.report(e && e.reason ? e.reason : 'Unhandled promise rejection');
            });
        } catch { /* error trapping must never break boot */ }
    }

    private static report(what: any) {
        const text = GameRoot.describe(what);
        GameRoot.lastFatal = text;
        try { console.error('[ETMM] ' + text); } catch { /* ignore */ }
        // Take over the screen only while still booting — never nuke a
        // running game because of a late uncaught error.
        if (!GameRoot.booted && GameRoot.instance) {
            GameRoot.instance.showFatalError(text);
        }
    }

    private static describe(err: any): string {
        if (!err) return 'Unknown error';
        if (typeof err === 'string') return err;
        return String(err.stack || err.message || err);
    }

    /** One console/logcat line describing the device — makes bug reports actionable. */
    private logDeviceInfo() {
        try {
            const vs = view.getVisibleSize();
            console.log(`[ETMM] boot: os=${sys.os} native=${sys.isNative}`
                + ` language=${sys.language}`
                + ` visible=${Math.round(vs.width)}x${Math.round(vs.height)}`);
        } catch { /* logging must never break boot */ }
    }
}

// Register the global error hooks at module evaluation time — before the
// scene loads — so a startup crash surfaces as on-screen text instead of a
// silent black screen (no-ops on native, where uncaught exceptions already
// reach logcat and the try/catch guards cover the rest).
GameRoot.captureGlobalErrors();

// Register alias UUIDs so Cocos Creator's deserializer can match GameRoot
// whether using compressed 23-char or 22-char UUID or the class name.
try {
    const cls: any = GameRoot;
    if (typeof js !== 'undefined' && js) {
        (js as any)._setClassId?.('1ae23opudVCYbwrYAFtDnAN', cls);
        (js as any)._setClassId?.('1a4jopudVCYbwrYAFtDnAN', cls);
        (js as any).setClassName?.('1ae23opudVCYbwrYAFtDnAN', cls);
        (js as any).setClassName?.('1a4jopudVCYbwrYAFtDnAN', cls);
        (js as any).setClassName?.('GameRoot', cls);
    }
    if (typeof cclegacy !== 'undefined' && cclegacy?._RF) {
        cclegacy._RF.push?.({}, '1ae23opudVCYbwrYAFtDnAN', 'GameRoot', void 0);
        cclegacy._RF.push?.({}, '1a4jopudVCYbwrYAFtDnAN', 'GameRoot', void 0);
    }
} catch { /* ignore */ }

// Auto-bootstrap fallback: If the scene failed to instantiate GameRoot
// (e.g. bad UUID in scene file, prebuilt bundles, or empty test scene),
// detect if GameRoot is absent after scene launch and automatically attach it.
try {
    if (typeof director !== 'undefined' && director && typeof Director !== 'undefined') {
        director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
            try {
                const scene = director.getScene();
                if (!scene) return;
                const existing = scene.getComponentInChildren(GameRoot);
                if (!existing) {
                    try { console.warn('[ETMM] GameRoot was not found in active scene. Auto-bootstrapping GameRoot on Canvas...'); } catch { /* ignore */ }
                    const canvasComp = scene.getComponentInChildren(Canvas);
                    const targetNode = canvasComp ? canvasComp.node : scene;
                    let rootNode = targetNode.getChildByName('GameRoot');
                    if (!rootNode) {
                        rootNode = new Node('GameRoot');
                        targetNode.addChild(rootNode);
                    }
                    ensureUT(rootNode).setContentSize(1920, 1080);
                    if (!rootNode.getComponent(GameRoot)) {
                        rootNode.addComponent(GameRoot);
                    }
                }
            } catch (e) {
                try { console.error('[ETMM] auto-bootstrap error: ' + e); } catch { /* ignore */ }
            }
        });
    }
} catch { /* ignore */ }

