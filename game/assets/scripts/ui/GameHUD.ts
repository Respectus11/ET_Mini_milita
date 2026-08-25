/**
 * GameHUD.ts
 * ---------------------------------------------------------------------------
 * In-match overlay built entirely in code: a top bar with one panel per
 * fighter (name, HP bar, jetpack fuel bar), central score/timer readout,
 * ammo line bottom-right, a pause button, and a transient message label.
 * refresh() is called every frame by GameRoot and repaints the bars.
 */
import { _decorator, Color, Component, Graphics, Label, Node } from 'cc';
const { ccclass } = _decorator;
import { CFG } from '../core/GameConfig';
import { fmtTime } from '../core/Utils';
import { t } from '../data/Strings';
import { Fighter } from '../gameplay/Fighter';
import { ensureUT, coverSize } from '../core/UIUtil';

@ccclass('GameHUD')
export class GameHUD extends Component {
    private fighters: Fighter[] = [];
    /** Cached per-fighter panel: graphics + name label (no per-frame lookups). */
    private panels: { g: Graphics; f: Fighter; label: Label }[] = [];
    private scoreLbl!: Label;
    private timeLbl!: Label;
    private ammoLbl!: Label;
    private msgLbl!: Label;
    private onPause: (() => void) | null = null;

    // reusable colors — refreshed() repaints every frame, so allocate once
    private readonly cPanelBg = new Color(0, 0, 0, 150);
    private readonly cHpHigh = new Color(76, 217, 100);
    private readonly cHpMid = new Color(255, 200, 60);
    private readonly cHpLow = new Color(240, 80, 80);
    private readonly cFuelBg = new Color(0, 0, 0, 120);
    private readonly cFuel = new Color(90, 190, 255);

    build(fighters: Fighter[], onPause: () => void) {
        this.fighters = fighters;
        this.onPause = onPause;
        const W = coverSize().w;

        // top bar
        const bar = new Node('topbar');
        this.node.addChild(bar);
        ensureUT(bar);
        const bg = bar.addComponent(Graphics);
        bg.fillColor = new Color(10, 12, 18, 170);
        bg.rect(-W / 2, 460, W, 100);
        bg.fill();

        // per-player panels
        this.panels = [];
        let x = -W / 2 + 30;
        for (const f of fighters) {
            const n = new Node('panel_' + f.teamLabel);
            this.node.addChild(n);
            n.setPosition(x + 150, 510, 0);
            ensureUT(n);
            const g = n.addComponent(Graphics);
            const lblN = new Node('nm');
            n.addChild(lblN);
            ensureUT(lblN);
            const l = lblN.addComponent(Label);
            l.string = '';
            l.fontSize = 24;
            l.lineHeight = 26;
            // fighter names are tinted once — the look is fixed per match
            l.color = new Color(f.char.body.r, f.char.body.g, f.char.body.b);
            this.panels.push({ g, f, label: l });
            x += 330;
        }

        // center: timer + scores
        const cN = new Node('center');
        this.node.addChild(cN);
        ensureUT(cN);
        const cl = cN.addComponent(Label);
        cl.string = '0 : 0';
        cl.fontSize = 40;
        cl.lineHeight = 46;
        cl.isBold = true;
        cl.color = new Color(255, 255, 255);
        this.scoreLbl = cN.getComponent(Label)!;
        cN.setPosition(0, 512, 0);

        const tN = new Node('timer');
        this.node.addChild(tN);
        ensureUT(tN);
        this.timeLbl = tN.addComponent(Label);
        this.timeLbl.fontSize = 26;
        this.timeLbl.lineHeight = 30;
        this.timeLbl.color = new Color(225, 228, 235);
        tN.setPosition(0, 470, 0);

        // bottom-right: ammo
        const aN = new Node('ammo');
        this.node.addChild(aN);
        ensureUT(aN);
        this.ammoLbl = aN.addComponent(Label);
        this.ammoLbl.fontSize = 28;
        this.ammoLbl.lineHeight = 32;
        this.ammoLbl.color = new Color(255, 255, 160);
        aN.setPosition(W / 2 - 140, -470, 0);

        // pause: drawn icon (two bars in a ring), generous touch target
        const pBtn = new Node('pause');
        this.node.addChild(pBtn);
        pBtn.setPosition(-W / 2 + 60, -480, 0);
        ensureUT(pBtn).setContentSize(110, 110);
        const pg = pBtn.addComponent(Graphics);
        pg.lineWidth = 3;
        pg.strokeColor = new Color(255, 255, 255, 120);
        pg.circle(0, 0, 34);
        pg.stroke();
        pg.fillColor = new Color(255, 255, 255, 170);
        pg.roundRect(-11, -14, 7, 28, 3);
        pg.fill();
        pg.roundRect(4, -14, 7, 28, 3);
        pg.fill();
        pBtn.on(Node.EventType.TOUCH_END, () => this.onPause?.());

        // center message label
        const mN = new Node('msg');
        this.node.addChild(mN);
        ensureUT(mN);
        this.msgLbl = mN.addComponent(Label);
        this.msgLbl.fontSize = 52;
        this.msgLbl.isBold = true;
        this.msgLbl.lineHeight = 58;
        mN.setPosition(0, 260, 0);
    }

    showMessage(s: string, seconds = 1.6) {
        this.msgLbl.string = s;
        this.scheduleOnce(() => { this.msgLbl.string = ''; }, seconds);
    }

    refresh() {
        for (const p of this.panels) {
            const f = p.f;
            const g = p.g;
            g.clear();
            // name (cached label — only rewritten when the text changes)
            const txt = `${t(f.char.nameKey)}  ${f.teamLabel === 'P1' || f.teamLabel === 'P2' ? '' : '(BOT)'}`;
            if (p.label.string !== txt) p.label.string = txt;

            // HP bar
            const w = 240, h = 18;
            g.fillColor = this.cPanelBg;
            g.roundRect(-w / 2, 8, w, h, 6);
            g.fill();
            const frac = Math.max(0, f.hp / CFG.MAX_HP);
            g.fillColor = frac > 0.5 ? this.cHpHigh
                : frac > 0.25 ? this.cHpMid : this.cHpLow;
            if (frac > 0) {
                g.roundRect(-w / 2 + 2, 10, (w - 4) * frac, h - 4, 4);
                g.fill();
            }
            // fuel bar under it
            const ffrac = f.fuel / CFG.JETPACK_MAX_FUEL;
            g.fillColor = this.cFuelBg;
            g.roundRect(-w / 2, -16, w, 9, 3);
            g.fill();
            g.fillColor = this.cFuel;
            if (ffrac > 0.01) {
                g.roundRect(-w / 2 + 1, -15, (w - 2) * ffrac, 7, 2.5);
                g.fill();
            }
        }
    }

    setScores(p1Score: number, otherScores: string, timeStr: string) {
        this.scoreLbl.string = `${p1Score}  ${otherScores}`;
        this.timeLbl.string = timeStr;
    }

    setAmmo(txt: string) {
        this.ammoLbl.string = txt;
    }

    hideMsg() { this.msgLbl.string = ''; }
}
