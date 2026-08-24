/**
 * GameHUD.ts
 * ---------------------------------------------------------------------------
 * In-match overlay built entirely in code: a top bar with one panel per
 * fighter (name, HP bar, jetpack fuel bar), central score/timer readout,
 * ammo line bottom-right, a pause button, and a transient message label.
 * refresh() is called every frame by GameRoot and repaints the bars.
 */
import { _decorator, Color, Component, Graphics, Label, Node, UITransform } from 'cc';
const { ccclass } = _decorator;
import { CFG } from '../core/GameConfig';
import { fmtTime } from '../core/Utils';
import { t } from '../data/Strings';
import { Fighter } from '../gameplay/Fighter';
import { ensureUT } from '../core/UIUtil';

@ccclass('GameHUD')
export class GameHUD extends Component {
    private fighters: Fighter[] = [];
    private hpBars: { g: Graphics; f: Fighter; x: number }[] = [];
    private scoreLbl!: Label;
    private timeLbl!: Label;
    private ammoLbl!: Label;
    private msgLbl!: Label;
    private onPause: (() => void) | null = null;

    build(fighters: Fighter[], onPause: () => void) {
        this.fighters = fighters;
        this.onPause = onPause;
        const W = 1920;

        // top bar
        const bar = new Node('topbar');
        this.node.addChild(bar);
        ensureUT(bar);
        const bg = bar.addComponent(Graphics);
        bg.fillColor = new Color(10, 12, 18, 170);
        bg.rect(-W / 2, 460, W, 100);
        bg.fill();

        // per-player panels
        this.hpBars = [];
        let x = -W / 2 + 30;
        for (const f of fighters) {
            const n = new Node('panel_' + f.teamLabel);
            this.node.addChild(n);
            n.setPosition(x + 150, 510, 0);
            ensureUT(n);
            const g = n.addComponent(Graphics);
            this.hpBars.push({ g, f, x });
            const lblN = new Node('nm');
            n.addChild(lblN);
            ensureUT(lblN);
            const l = lblN.addComponent(Label);
            l.string = '';
            l.fontSize = 22;
            l.lineHeight = 24;
            l.color = new Color(255, 255, 255);
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
        this.timeLbl.fontSize = 34;
        this.timeLbl.lineHeight = 38;
        this.timeLbl.color = new Color(220, 220, 220);
        tN.setPosition(0, 470, 0);

        // bottom-right: ammo
        const aN = new Node('ammo');
        this.node.addChild(aN);
        ensureUT(aN);
        this.ammoLbl = aN.addComponent(Label);
        this.ammoLbl.fontSize = 30;
        this.ammoLbl.lineHeight = 34;
        this.ammoLbl.color = new Color(255, 255, 160);
        aN.setPosition(W / 2 - 140, -470, 0);

        // pause
        const pBtn = new Node('pause');
        this.node.addChild(pBtn);
        pBtn.setPosition(-W / 2 + 50, -480, 0);
        pBtn.addComponent(UITransform);
        const pg = pBtn.addComponent(Graphics);
        pg.lineWidth = 3;
        pg.strokeColor = new Color(255, 255, 255, 130);
        pg.circle(0, 0, 30);
        pg.stroke();
        const plbl = pBtn.addComponent(Label);
        plbl.string = '| |';
        plbl.fontSize = 36;
        plbl.isBold = true;
        pBtn.on(Node.EventType.TOUCH_END, () => this.onPause?.());

        // center message label
        const mN = new Node('msg');
        this.node.addChild(mN);
        ensureUT(mN);
        this.msgLbl = mN.addComponent(Label);
        this.msgLbl.fontSize = 54;
        this.msgLbl.isBold = true;
        this.msgLbl.lineHeight = 60;
        mN.setPosition(0, 260, 0);
    }

    showMessage(s: string, seconds = 1.6) {
        this.msgLbl.string = s;
        this.scheduleOnce(() => { this.msgLbl.string = ''; }, seconds);
    }

    refresh() {
        for (const hb of this.hpBars) {
            const f = hb.f;
            const g = hb.g;
            g.clear();
            // name
            const lblNode = hb.g.node.getChildByName('nm')!;
            const l = lblNode.getComponent(Label)!;
            l.string = `${t(f.char.nameKey)}  ${f.teamLabel === 'P1' || f.teamLabel === 'P2' ? '' : '(BOT)'}`;
            l.color = new Color(f.char.body.r, f.char.body.g, f.char.body.b);

            // HP bar
            const w = 240, h = 18;
            g.fillColor = new Color(0, 0, 0, 150);
            g.roundRect(-w / 2, 8, w, h, 6);
            g.fill();
            const frac = Math.max(0, f.hp / CFG.MAX_HP);
            g.fillColor = frac > 0.5 ? new Color(76, 217, 100)
                : frac > 0.25 ? new Color(255, 200, 60) : new Color(240, 80, 80);
            if (frac > 0) {
                g.roundRect(-w / 2 + 2, 10, (w - 4) * frac, h - 4, 4);
                g.fill();
            }
            // fuel bar under it
            const ffrac = f.fuel / CFG.JETPACK_MAX_FUEL;
            g.fillColor = new Color(0, 0, 0, 120);
            g.roundRect(-w / 2, -16, w, 9, 3);
            g.fill();
            g.fillColor = new Color(90, 190, 255);
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
