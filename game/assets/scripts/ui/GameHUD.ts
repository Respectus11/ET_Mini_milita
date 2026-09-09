/**
 * GameHUD.ts
 * ---------------------------------------------------------------------------
 * In-match overlay built entirely in code: a top bar with one panel per
 * fighter (name, HP bar, jetpack fuel bar), central score/timer readout,
 * ammo line bottom-right, a pause button, and a transient message label.
 * refresh() is called every frame by GameRoot and repaints the bars.
 */
import { _decorator, Color, Component, Graphics, Label, Node, Tween, UIOpacity, UITransform, tween, view } from 'cc';
const { ccclass } = _decorator;
import { CFG } from '../core/GameConfig';
import { clamp } from '../core/Utils';
import { t } from '../data/Strings';
import { Fighter } from '../gameplay/Fighter';
import { ensureUT, coverSize } from '../core/UIUtil';
import { Theme, withAlpha } from '../core/Theme';
import { DUR, punchScale } from '../core/Motion';
import { getSettings } from '../core/Settings';
import { bus, Evt } from '../core/EventBus';
import { drawGun, drawDualGuns } from '../gameplay/GunArt';

@ccclass('GameHUD')
export class GameHUD extends Component {
    private fighters: Fighter[] = [];
    /** Cached per-fighter panel: graphics + name label (no per-frame lookups). */
    private panels: { g: Graphics; f: Fighter; label: Label; lag: number }[] = [];
    private scoreLbl!: Label;
    private scoreNode!: Node;
    private timeLbl!: Label;
    private ammoLbl!: Label;
    private msgLbl!: Label;
    private msgNode!: Node;
    private grenadeBtn: Node | null = null;
    private grenadeBadgeLbl: Label | null = null;
    public onGrenade: (() => void) | null = null;
    private bannerNode: Node | null = null;
    private bannerLbl: Label | null = null;
    private onPause: (() => void) | null = null;

    // ---- juice/state ----
    private myId = 0;
    private me: Fighter | null = null;
    private lastP1Score = -1;
    private time = 0;                 // hud clock (pulses, fps smoothing)
    private safeSide = 0;             // notch insets (symmetric, UI units)
    private safeTop = 0;
    private feed: { node: Node; lbl: Label; life: number }[] = [];
    private feedUnsubs: (() => void)[] = [];
    private vignette: Node | null = null;
    private vignetteOp: UIOpacity | null = null;
    private chipG: Graphics | null = null;
    private chipIconG: Graphics | null = null;
    private chipPipsG: Graphics | null = null;
    private chipKey = '';             // ammo/weapon/reload change fingerprint
    private fpsLbl: Label | null = null;
    private fpsFrames = 0;
    private fpsAcc = 0;

    // reusable colors — refresh() repaints every frame, so allocate once
    private readonly cPanelBg = withAlpha(Theme.surface, 170);
    private readonly cHpHigh = Theme.hpHigh;
    private readonly cHpMid = Theme.hpMid;
    private readonly cHpLow = Theme.hpLow;
    private readonly cFuelBg = new Color(0, 0, 0, 120);
    private readonly cFuel = Theme.fuel;
    private readonly cGhost = new Color(255, 255, 255, 90);
    private readonly tmpCol = new Color();

    build(fighters: Fighter[], onPause: () => void, myId = 0) {
        this.fighters = fighters;
        this.onPause = onPause;
        this.myId = myId;
        this.me = fighters.find(f => f.id === myId) ?? null;
        const W = coverSize().w;

        // notch/notchless insets (symmetric; landscape phones)
        try {
            const vis = view.getVisibleSize();
            const sa = view.getSafeAreaRect();
            if (sa.width > 0 && vis.width > 0) {
                this.safeSide = Math.max(0, (vis.width - sa.width) / 2);
                this.safeTop = Math.max(0, (vis.height - sa.height) / 2);
            }
        } catch { /* keep zero insets */ }
        const S = this.safeSide;

        // top bar
        const bar = new Node('topbar');
        this.node.addChild(bar);
        ensureUT(bar);
        const bg = bar.addComponent(Graphics);
        bg.fillColor = Theme.panel;
        bg.rect(-W / 2, 460 - this.safeTop, W, 100);
        bg.fill();

        // per-player panels (rounded chips)
        this.panels = [];
        let x = -W / 2 + 30 + S;
        for (const f of fighters) {
            const n = new Node('panel_' + f.teamLabel);
            this.node.addChild(n);
            n.setPosition(x + 150, 510 - this.safeTop, 0);
            ensureUT(n);
            const g = n.addComponent(Graphics);
            const lblN = new Node('nm');
            n.addChild(lblN);
            ensureUT(lblN);
            const l = lblN.addComponent(Label);
            l.string = '';
            l.fontSize = 24;
            l.lineHeight = 26;
            l.isBold = true;
            // fighter names are tinted once — the look is fixed per match
            l.color = new Color(f.char.body.r, f.char.body.g, f.char.body.b);
            l.enableOutline = true;
            l.outlineColor = new Color(0, 0, 0, 200);
            l.outlineWidth = 2;
            this.panels.push({ g, f, label: l, lag: CFG.MAX_HP });
            x += 330;
        }

        // center: timer + scores
        const cN = new Node('center');
        this.node.addChild(cN);
        ensureUT(cN);
        const cl = cN.addComponent(Label);
        cl.string = '0 : 0';
        cl.fontSize = 42;
        cl.lineHeight = 48;
        cl.isBold = true;
        cl.color = Theme.text;
        cl.enableOutline = true;
        cl.outlineColor = new Color(0, 0, 0, 180);
        cl.outlineWidth = 2;
        this.scoreLbl = cN.getComponent(Label)!;
        this.scoreNode = cN;
        cN.setPosition(0, 512 - this.safeTop, 0);

        const tN = new Node('timer');
        this.node.addChild(tN);
        ensureUT(tN);
        this.timeLbl = tN.addComponent(Label);
        this.timeLbl.fontSize = 26;
        this.timeLbl.lineHeight = 30;
        this.timeLbl.color = Theme.textDim;
        tN.setPosition(0, 470 - this.safeTop, 0);

        // bottom-right: ammo chip (weapon icon + pips + reload ring)
        const chipN = new Node('ammoChip');
        this.node.addChild(chipN);
        chipN.setPosition(W / 2 - 175 - S, -462, 0);
        ensureUT(chipN).setContentSize(330, 78);
        this.chipG = chipN.addComponent(Graphics);
        this.chipG.fillColor = withAlpha(Theme.surface, 200);
        this.chipG.roundRect(-165, -39, 330, 78, 14);
        this.chipG.fill();
        this.chipG.strokeColor = Theme.line;
        this.chipG.lineWidth = 2;
        this.chipG.roundRect(-165, -39, 330, 78, 14);
        this.chipG.stroke();

        const iconN = new Node('wicon');
        chipN.addChild(iconN);
        ensureUT(iconN);
        iconN.setPosition(-118, 2, 0);
        iconN.setScale(1.1, 1.1, 1);
        this.chipIconG = iconN.addComponent(Graphics);

        const pipsN = new Node('pips');
        chipN.addChild(pipsN);
        ensureUT(pipsN);
        pipsN.setPosition(28, 10, 0);
        this.chipPipsG = pipsN.addComponent(Graphics);

        const aN = new Node('ammoNum');
        chipN.addChild(aN);
        ensureUT(aN);
        aN.setPosition(28, -18, 0);
        this.ammoLbl = aN.addComponent(Label);
        this.ammoLbl.fontSize = 26;
        this.ammoLbl.lineHeight = 30;
        this.ammoLbl.isBold = true;
        this.ammoLbl.color = withAlpha(Theme.goldHi, 255);
        this.ammoLbl.string = '';

        // Tactical Grenade Button: circular button with grenade icon and badge count
        const gBtn = new Node('grenadeBtn');
        this.node.addChild(gBtn);
        gBtn.setPosition(W / 2 - 80 - S, -345, 0);
        ensureUT(gBtn).setContentSize(85, 85);
        const gg = gBtn.addComponent(Graphics);
        gg.fillColor = withAlpha(Theme.surface, 220);
        gg.circle(0, 0, 36);
        gg.fill();
        gg.lineWidth = 2.5;
        gg.strokeColor = Theme.line;
        gg.circle(0, 0, 36);
        gg.stroke();
        // Mini grenade icon in center
        gg.fillColor = new Color(74, 94, 52, 255);
        gg.circle(0, -2, 13);
        gg.fill();
        gg.strokeColor = new Color(42, 56, 30, 255);
        gg.lineWidth = 1.8;
        gg.moveTo(-11, -2); gg.lineTo(11, -2); gg.stroke();
        gg.moveTo(0, -13); gg.lineTo(0, 9); gg.stroke();
        gg.fillColor = new Color(160, 160, 160, 255);
        gg.rect(-3.5, 9, 7, 4);
        gg.fill();

        // Badge count label
        const bN = new Node('badge');
        gBtn.addChild(bN);
        ensureUT(bN);
        bN.setPosition(24, 24, 0);
        const bgBadge = bN.addComponent(Graphics);
        bgBadge.fillColor = Theme.hpMid;
        bgBadge.circle(0, 0, 14);
        bgBadge.fill();
        const bl = bN.addComponent(Label);
        bl.fontSize = 18;
        bl.lineHeight = 20;
        bl.isBold = true;
        bl.color = Theme.text;
        bl.string = '3';
        this.grenadeBadgeLbl = bl;

        gBtn.on(Node.EventType.TOUCH_END, () => {
            punchScale(gBtn, 0.88, DUR.instant);
            if (this.onGrenade) {
                this.onGrenade();
            } else {
                this.me?.tryThrowGrenade();
            }
        });
        this.grenadeBtn = gBtn;

        // pause: drawn icon (two bars in a ring), generous touch target
        const pBtn = new Node('pause');
        this.node.addChild(pBtn);
        pBtn.setPosition(-W / 2 + 60 + S, -480, 0);
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
        pBtn.on(Node.EventType.TOUCH_END, () => {
            punchScale(pBtn, 0.9, DUR.instant);
            this.onPause?.();
        });

        // center message label
        const mN = new Node('msg');
        this.node.addChild(mN);
        ensureUT(mN);
        this.msgLbl = mN.addComponent(Label);
        this.msgLbl.fontSize = 52;
        this.msgLbl.isBold = true;
        this.msgLbl.lineHeight = 58;
        this.msgLbl.enableOutline = true;
        this.msgLbl.outlineColor = new Color(0, 0, 0, 200);
        this.msgLbl.outlineWidth = 3;
        mN.setPosition(0, 260, 0);
        this.msgNode = mN;

        // center killstreak banner node
        const banN = new Node('banner');
        this.node.addChild(banN);
        ensureUT(banN).setContentSize(560, 80);
        const banG = banN.addComponent(Graphics);
        banG.fillColor = new Color(15, 15, 22, 230);
        banG.roundRect(-280, -36, 560, 72, 16);
        banG.fill();
        banG.strokeColor = Theme.goldHi;
        banG.lineWidth = 3.5;
        banG.roundRect(-280, -36, 560, 72, 16);
        banG.stroke();

        const banLblN = new Node('banLbl');
        banN.addChild(banLblN);
        ensureUT(banLblN);
        this.bannerLbl = banLblN.addComponent(Label);
        this.bannerLbl.fontSize = 38;
        this.bannerLbl.lineHeight = 44;
        this.bannerLbl.isBold = true;
        this.bannerLbl.color = Theme.goldHi;
        this.bannerLbl.enableOutline = true;
        this.bannerLbl.outlineColor = new Color(0, 0, 0, 220);
        this.bannerLbl.outlineWidth = 3;
        this.bannerLbl.string = '';
        banN.setPosition(0, 170, 0);
        banN.active = false;
        this.bannerNode = banN;

        // damage vignette (full-screen red bands, flashed via UIOpacity)
        const vN = new Node('vignette');
        this.node.addChild(vN);
        ensureUT(vN).setContentSize(W, 1080);
        const vg = vN.addComponent(Graphics);
        const bands: [number, number][] = [[0, 60], [46, 42], [104, 26]];
        for (const [inset, alpha] of bands) {
            vg.strokeColor = new Color(220, 30, 30, alpha);
            vg.lineWidth = 34;
            vg.roundRect(-W / 2 + 17 + inset, -540 + 17 + inset,
                W - 34 - inset * 2, 1080 - 34 - inset * 2, 30);
            vg.stroke();
        }
        const vop = vN.addComponent(UIOpacity);
        vop.opacity = 0;
        this.vignette = vN;
        this.vignetteOp = vop;

        // optional FPS counter
        if (getSettings().showFps) {
            const fN = new Node('fps');
            this.node.addChild(fN);
            ensureUT(fN);
            fN.setPosition(W / 2 - 70 - S, 500 - this.safeTop, 0);
            this.fpsLbl = fN.addComponent(Label);
            this.fpsLbl.fontSize = 20;
            this.fpsLbl.color = Theme.textFaint;
            this.fpsLbl.string = '';
        }

        // bus wiring: kill feed + vignette + weapon icon + killstreaks
        this.feedUnsubs.push(bus.on(Evt.FRAG, (killerId: number, victimId: number) => {
            this.addFeed(killerId, victimId);
        }));
        this.feedUnsubs.push(bus.on(Evt.HP_CHANGED, (id: number, hp: number) => {
            if (id === this.myId && hp < CFG.MAX_HP) this.flashVignette();
        }));
        this.feedUnsubs.push(bus.on(Evt.WEAPON_CHANGED, (id: number) => {
            if (id === this.myId && this.me) this.drawChipIcon(this.me);
        }));
        this.feedUnsubs.push(bus.on(Evt.KILLSTREAK, (killerId: number, badgeKey: string, streak: number) => {
            this.showKillstreakBanner(killerId, badgeKey, streak);
        }));
        if (this.me) this.drawChipIcon(this.me);
    }

    onDestroy() {
        for (const un of this.feedUnsubs) un();
        this.feedUnsubs.length = 0;
    }

    private msgToken = 0;

    showMessage(s: string, seconds = 1.6) {
        this.msgLbl.string = s;
        punchScale(this.msgNode, 1.15, DUR.quick);
        const token = ++this.msgToken;
        this.scheduleOnce(() => {
            if (token === this.msgToken) this.msgLbl.string = '';
        }, seconds);
    }

    private leaderId: number | null = null;

    refresh(dt = 0) {
        this.time += dt;
        for (const p of this.panels) {
            const f = p.f;
            const g = p.g;
            g.clear();
            // name (cached label — only rewritten when the text changes)
            const txt = `${t(f.char.nameKey)}  ${f.teamLabel === 'P1' || f.teamLabel === 'P2' ? '' : '(BOT)'}`;
            if (p.label.string !== txt) p.label.string = txt;

            // rounded chip backdrop
            const w = 240, h = 18;
            g.fillColor = this.cPanelBg;
            g.roundRect(-w / 2 - 12, -26, w + 24, 78, 12);
            g.fill();

            // crown over the current leader
            if (f.id === this.leaderId && f.kills > 0) {
                g.fillColor = Theme.gold;
                g.moveTo(-10, 44);
                g.lineTo(-4, 36);
                g.lineTo(0, 44);
                g.lineTo(4, 36);
                g.lineTo(10, 44);
                g.lineTo(10, 50);
                g.lineTo(-10, 50);
                g.close();
                g.fill();
            }

            // damage "ghost" lag bar (eases down after the real bar)
            p.lag += (Math.max(0, f.hp) - p.lag) * Math.min(1, 5 * dt);
            if (Math.abs(p.lag - f.hp) < 0.6) p.lag = Math.max(0, f.hp);
            const lagFrac = clamp(p.lag / CFG.MAX_HP, 0, 1);
            g.fillColor = new Color(0, 0, 0, 140);
            g.roundRect(-w / 2, 8, w, h, 6);
            g.fill();
            if (lagFrac > 0.005 && lagFrac > f.hp / CFG.MAX_HP) {
                g.fillColor = this.cGhost;
                g.roundRect(-w / 2 + 2, 10, (w - 4) * lagFrac, h - 4, 4);
                g.fill();
            }
            const frac = Math.max(0, f.hp / CFG.MAX_HP);
            g.fillColor = frac > 0.5 ? this.cHpHigh
                : frac > 0.25 ? this.cHpMid : this.cHpLow;
            if (frac > 0) {
                g.roundRect(-w / 2 + 2, 10, (w - 4) * frac, h - 4, 4);
                g.fill();
            }
            // fuel bar — pulses when running low
            const ffrac = f.fuel / CFG.JETPACK_MAX_FUEL;
            g.fillColor = this.cFuelBg;
            g.roundRect(-w / 2, -16, w, 9, 3);
            g.fill();
            if (ffrac > 0.01) {
                const low = ffrac < 0.25;
                this.tmpCol.r = this.cFuel.r;
                this.tmpCol.g = this.cFuel.g;
                this.tmpCol.b = this.cFuel.b;
                this.tmpCol.a = low
                    ? Math.round(150 + 105 * Math.sin(this.time * 10))
                    : 255;
                g.fillColor = this.tmpCol;
                g.roundRect(-w / 2 + 1, -15, (w - 2) * ffrac, 7, 2.5);
                g.fill();
            }
        }

        // update grenade badge count
        if (this.me && this.grenadeBadgeLbl) {
            const count = this.me.grenades.toString();
            if (this.grenadeBadgeLbl.string !== count) this.grenadeBadgeLbl.string = count;
        }

        this.updateChip();
        this.updateFeed(dt);
        this.updateFps(dt);
    }

    private updateChip() {
        const me = this.me;
        const pips = this.chipPipsG;
        if (!me || !pips) return;
        if (!me.alive) {
            if (this.chipKey !== 'dead') {
                this.chipKey = 'dead';
                pips.clear();
                this.ammoLbl.string = '';
            }
            return;
        }
        const w2Key = me.weapon2 ? `${me.weapon2.id}|${me.ammo2}|${me.reloading2}` : 'none';
        const key = `${me.weapon.id}|${me.ammo}|${me.reloading}|${Math.round(me.reloadT * 20)}|${w2Key}`;
        if (key === this.chipKey) return;
        this.chipKey = key;
        pips.clear();
        const reloadFrac = me.reloading && me.weapon.reloadTime > 0
            ? clamp(1 - me.reloadT / me.weapon.reloadTime, 0, 1) : 0;
        // reload ring around the weapon icon
        if (me.reloading || me.reloading2) {
            pips.lineWidth = 5;
            pips.strokeColor = Theme.reload;
            pips.arc(-118, 2, 26, Math.PI / 2,
                Math.PI / 2 + reloadFrac * Math.PI * 2, false);
            pips.stroke();
        }
        // magazine pips — dim as rounds are spent
        const shown = Math.min(me.weapon.magSize, 14);
        for (let i = 0; i < shown; i++) {
            const on = me.ammo > (me.weapon.magSize / shown) * i;
            pips.fillColor = on ? Theme.goldHi : withAlpha(Theme.goldHi, 70);
            pips.circle(-134 + (i + 0.5) * (268 / shown), 10, 4);
            pips.fill();
        }

        if (me.weapon2) {
            this.ammoLbl.string = `${me.ammo} | ${me.ammo2}`;
            this.ammoLbl.fontSize = 22;
        } else {
            this.ammoLbl.string = me.reloading
                ? `${Math.round(reloadFrac * 100)}%`
                : `${me.ammo}/${me.weapon.magSize}`;
            this.ammoLbl.fontSize = 26;
        }
        this.ammoLbl.color = (me.reloading || me.reloading2) ? Theme.reload : Theme.goldHi;
    }

    private updateFeed(dt: number) {
        const W = coverSize().w;
        for (let i = this.feed.length - 1; i >= 0; i--) {
            const e = this.feed[i];
            e.life -= dt;
            if (e.life <= 0) {
                e.node.destroy();
                this.feed.splice(i, 1);
            }
        }
        for (let i = 0; i < this.feed.length; i++) {
            const e = this.feed[i];
            e.node.setPosition(W / 2 - 200 - this.safeSide, 340 - i * 48, 0);
            const op = e.node.getComponent(UIOpacity);
            if (op) op.opacity = Math.round(255 * clamp(e.life / 0.5, 0, 1));
        }
    }

    private addFeed(killerId: number, victimId: number) {
        if (this.feed.length >= 4) {
            const old = this.feed.shift()!;
            old.node.destroy();
        }
        const n = new Node('feed');
        this.node.addChild(n);
        ensureUT(n).setContentSize(330, 40);
        const g = n.addComponent(Graphics);
        g.fillColor = withAlpha(Theme.bgDeep, 205);
        g.roundRect(-165, -19, 330, 38, 10);
        g.fill();
        const l = n.addComponent(Label);
        l.fontSize = 22;
        l.lineHeight = 26;
        l.isBold = true;
        l.overflow = Label.Overflow.SHRINK;
        (n.getComponent(UITransform)!).setContentSize(315, 34);
        const kf = this.fighters.find(f => f.id === killerId);
        const vf = this.fighters.find(f => f.id === victimId);
        const kc = kf ? kf.char.body : Theme.text;
        l.color = new Color(kc.r, kc.g, kc.b);
        const kName = kf ? t(kf.char.nameKey) : '?';
        const vName = vf ? t(vf.char.nameKey) : '?';
        l.string = killerId === victimId ? `${vName} †` : `${kName} ▶ ${vName}`;
        n.addComponent(UIOpacity);
        this.feed.push({ node: n, lbl: l, life: 3 });
    }

    private updateFps(dt: number) {
        if (!this.fpsLbl) return;
        this.fpsFrames++;
        this.fpsAcc += dt;
        if (this.fpsAcc >= 0.5) {
            this.fpsLbl.string = `${Math.round(this.fpsFrames / this.fpsAcc)} FPS`;
            this.fpsFrames = 0;
            this.fpsAcc = 0;
        }
    }

    private drawChipIcon(f: Fighter) {
        if (!this.chipIconG) return;
        this.chipIconG.clear();
        if (f.weapon2) {
            drawDualGuns(this.chipIconG, f.weapon, f.weapon2, 0, 0);
        } else {
            drawGun(this.chipIconG, f.weapon, 0);
        }
    }

    private bannerToken = 0;

    showKillstreakBanner(killerId: number, badgeKey: string, streak: number) {
        if (!this.bannerNode || !this.bannerLbl) return;
        const kf = this.fighters.find(f => f.id === killerId);
        const killerName = kf ? t(kf.char.nameKey) : 'P1';
        this.bannerLbl.string = `${t(badgeKey)} (${killerName})`;
        this.bannerNode.active = true;
        punchScale(this.bannerNode, 1.25, DUR.quick);
        const token = ++this.bannerToken;
        this.scheduleOnce(() => {
            if (token === this.bannerToken && this.bannerNode) {
                this.bannerNode.active = false;
            }
        }, 1.8);
    }

    private flashVignette() {
        if (!this.vignetteOp) return;
        Tween.stopAllByTarget(this.vignetteOp);
        this.vignetteOp.opacity = 255;
        tween(this.vignetteOp).delay(0.05)
            .to(0.45, { opacity: 0 }, { easing: 'quadOut' }).start();
    }

    setScores(p1Score: number, otherScores: string, timeStr: string,
              leaderId: number | null = null) {
        if (this.lastP1Score >= 0 && p1Score > this.lastP1Score) {
            punchScale(this.scoreNode, 1.28, DUR.quick);
            this.scoreLbl.color = Theme.goldHi;
            this.scheduleOnce(() => { this.scoreLbl.color = Theme.text; }, 0.2);
        }
        this.lastP1Score = p1Score;
        this.leaderId = leaderId;
        this.scoreLbl.string = `${p1Score}  ${otherScores}`;
        this.timeLbl.string = timeStr;
        // urgency: red pulse under 30 seconds
        const parts = timeStr.split(':');
        const sec = parts.length === 2
            ? parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) : 999;
        if (sec <= 30) {
            this.tmpCol.r = 255; this.tmpCol.g = 80; this.tmpCol.b = 80;
            this.tmpCol.a = Math.round(180 + 75 * Math.sin(this.time * 8));
            this.timeLbl.color = this.tmpCol;
        } else {
            this.timeLbl.color = Theme.textDim;
        }
    }

    setAmmo(txt: string) {
        // legacy hook — the ammo chip manages its own readout now
        if (txt === '') this.ammoLbl.string = '';
    }

    hideMsg() { this.msgLbl.string = ''; }
}
