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
import { _decorator, Color, Component, Graphics, Label, Node, UITransform, view, ResolutionPolicy } from 'cc';
const { ccclass } = _decorator;
import { loadLang } from './data/Strings';
import { MainMenu, MenuState } from './ui/MainMenu';
import { GameHUD } from './ui/GameHUD';
import { MatchManager } from './gameplay/MatchManager';
import { TouchControls } from './input/TouchControls';
import { KeyboardControls } from './input/KeyboardControls';
import { t } from './data/Strings';

type Phase = 'MENU' | 'GAME' | 'RESULTS';

@ccclass('GameRoot')
export class GameRoot extends Component {
    private phase: Phase = 'MENU';
    private menuNode: Node = null!;
    private gameNode: Node = null!;
    private hud: GameHUD = null!;
    private touch: TouchControls = null!;
    private keys: KeyboardControls = null!;

    start() {
        view.setDesignResolutionSize(1920, 1080, ResolutionPolicy.FIXED_HEIGHT);
        loadLang();
        this.showMenu();
    }

    // ---------- MENU ----------
    private showMenu() {
        this.phase = 'MENU';
        this.clearGame();
        this.clearMenu();

        this.menuNode = new Node('menu');
        this.node.addChild(this.menuNode);
        const menu = this.menuNode.addComponent(MainMenu);
        menu.onStart = (s: MenuState) => this.startMatch(s);
        menu.build();
    }

    // ---------- GAME ----------
    private startMatch(s: MenuState) {
        this.phase = 'GAME';
        this.clearMenu();

        this.gameNode = new Node('game');
        this.node.addChild(this.gameNode);

        const match = this.gameNode.addComponent(MatchManager);
        match.opts = {
            mapIndex: s.mapIndex,
            twoPlayers: s.twoPlayers,
            charP1: s.charP1,
            charP2: s.charP2,
        };

        match.onEnd = (winnerId) => this.scheduleOnce(() => this.showResults(match, winnerId), 0.9);

        // HUD
        const hudNode = new Node('hud');
        this.node.addChild(hudNode);
        this.hud = hudNode.addComponent(GameHUD);
        void this.hud; // built after match.start creates fighters

        // input systems
        const inputNode = new Node('input');
        this.node.addChild(inputNode);
        this.touch = inputNode.addComponent(TouchControls);
        this.touch.enabledP1 = true;
        this.touch.enabledP2 = s.twoPlayers;
        this.keys = inputNode.addComponent(KeyboardControls);

        // after match roster exists, wire everything
        match.start();
        this.hud.build(match.fighters, () => this.showResults(match, null));
        this.hud.refresh();

        this.touchApply = (f1, f2) => this.touch.applyTo(f1, f2);
        this.keyboardApply = (f) => {
            const world = match.world;
            const ox = -world.worldW / 2;
            const oy = -world.worldH / 2;
            this.keys.applyTo(f, (x, y): [number, number] => [x + ox, y + oy]);
        };
        match.touchApply = (f1, f2) => this.touchApply!(f1, f2);
        match.keyboardApply = (f) => this.keyboardApply!(f);

        this.matchRef = match;
        this.schedule(this.gameTick, 0);
    }

    private matchRef: MatchManager = null!;
    private touchApply: ((f1: any, f2: any) => void) | null = null;
    private keyboardApply: ((f: any) => void) | null = null;

    private gameTick() {
        if (!this.matchRef || this.phase !== 'GAME') return;
        this.hud.refresh();
        const p1 = this.matchRef.humans[0];
        if (p1) {
            const w = p1.weapon;
            const ammoTxt = p1.reloading ? '...' : `${p1.ammo}/${w.magSize}`;
            this.hud.setAmmo(`${t(w.nameKey)}  ${ammoTxt}`);
        }
        let scoreStr = '';
        for (let i = 1; i < this.matchRef.fighters.length; i++) {
            const f = this.matchRef.fighters[i];
            scoreStr += `: ${this.matchRef.scoreOf(f.id)} `;
        }
        this.hud.setScores(this.matchRef.scoreOf(this.matchRef.fighters[0].id),
            scoreStr.trim(), this.matchRef.timeStr());
    }

    // ---------- RESULTS ----------
    private showResults(match: MatchManager, winnerId: number | null) {
        if (this.phase !== 'GAME') return;
        this.unschedule(this.gameTick);
        this.phase = 'RESULTS';
        match.matchOver = true; // freeze simulation behind overlay

        const W = 1920, H = 1080;
        const rn = new Node('results');
        this.node.addChild(rn);
        rn.addComponent(UITransform);
        const g = rn.addComponent(Graphics);
        g.fillColor = new Color(8, 10, 16, 220);
        g.rect(-W / 2, -H / 2, W, H);
        g.fill();

        const winner = match.fighters.find(f => f.id === winnerId);
        let titleKey = 'you_lose';
        if (!winner) titleKey = 'paused';
        else if (match.opts.twoPlayers) titleKey = winner.teamLabel === 'P1' ? 'p1_wins' : 'p2_wins';
        else if (winner.teamLabel === 'P1') titleKey = 'you_win';

        const tn = new Node('title');
        rn.addChild(tn);
        tn.addComponent(UITransform);
        const tl = tn.addComponent(Label);
        tl.string = t(titleKey);
        tl.fontSize = 96;
        tl.lineHeight = 110;
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
        sl.fontSize = 40;
        sl.lineHeight = 54;
        sn.setPosition(0, 60, 0);

        this.resultButton(rn, -260, -180, t('rematch'), () => {
            const opts = match.opts;
            rn.destroy();
            this.startMatch({
                mapIndex: opts.mapIndex,
                twoPlayers: opts.twoPlayers,
                charP1: opts.charP1,
                charP2: opts.charP2,
            });
        }, new Color(46, 125, 50), 380, 96);

        this.resultButton(rn, 260, -180, t('menu'), () => {
            rn.destroy();
            this.showMenu();
        }, new Color(62, 74, 96), 380, 96);
    }

    private resultButton(parent: Node, x: number, y: number, text: string,
                         onClick: () => void, color: Color, w: number, h: number) {
        const n = new Node('rbtn_' + text.slice(0, 5));
        parent.addChild(n);
        n.setPosition(x, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill();
        const ln = new Node('l');
        n.addChild(ln);
        ln.addComponent(UITransform);
        const l = ln.addComponent(Label);
        l.string = text;
        l.fontSize = Math.floor(h * 0.42);
        l.isBold = true;
        l.color = new Color(255, 255, 255);
        n.on(Node.EventType.TOUCH_END, onClick);
    }

    // ---------- cleanup ----------
    private clearMenu() {
        if (this.menuNode && this.menuNode.isValid) this.menuNode.destroy();
        this.menuNode = null!;
    }

    private clearGame() {
        this.unschedule(this.gameTick);
        if (this.gameNode && this.gameNode.isValid) this.gameNode.destroy();
        this.gameNode = null!;
    }
}
