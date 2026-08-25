import { _decorator, Color, Component, EditBox, Graphics, Label, Node, UITransform } from 'cc';
const { ccclass } = _decorator;
import {
    CHARACTERS, OutfitOverride,
    loadOutfit, saveOutfit, resolveChar,
} from '../data/Characters';
import { MAPS } from '../data/Maps';
import { getLang, setLang, t } from '../data/Strings';
import { ensureUT, coverSize, makeButton, RADIUS, TYPE } from '../core/UIUtil';
import { CFG } from '../core/GameConfig';
import { drawFighterRig } from '../core/FighterArt';
import { WeaponId, WEAPONS } from '../data/Weapons';
import { drawGun } from '../gameplay/GunArt';
import { LanClient, PeerMsg } from '../net/LanClient';

export type MenuMode = 'bots' | 'local' | 'netHost' | 'netGuest';

export interface MenuState {
    mode: MenuMode;
    mapIndex: number;
    twoPlayers: boolean;
    charP1: number;
    charP2: number;
    /** Custom outfit overrides per player slot (persisted + LAN-synced). */
    outfitP1: OutfitOverride;
    outfitP2: OutfitOverride;
    /** Live LAN connection handed over to GameRoot on match start. */
    lan: LanClient | null;
}

// ---- outfit editor palettes ----------------------------------------------
// Clothes/scarf share a vivid Ethiopian-flag-inspired palette plus
// neutrals; skin tones span a realistic range.
const CLOTHES_PALETTE = [
    '#2e7d32', '#c62828', '#1565c0', '#8e24aa', '#fdd835', '#fb8c00',
    '#00897b', '#d81b60', '#5d4037', '#212121', '#f5f5f5', '#455a64',
];
const SCARF_PALETTE = [
    '#ffc107', '#ffecb3', '#ffffff', '#e53935', '#ffd54f', '#8d6e63',
    '#4fc3f7', '#aed581', '#f48fb1', '#9575cd',
];
const SKIN_TONES = [
    '#ffe0bd', '#e8b98a', '#c68642', '#8d5524', '#6b3f1d', '#4a2c15',
];

/** Fully code-built main menu (no scene/prefab assets needed). */
@ccclass('MainMenu')
export class MainMenu extends Component {
    state: MenuState = {
        mode: 'bots', mapIndex: 0, twoPlayers: false, charP1: 0, charP2: 1,
        outfitP1: loadOutfit('p1'), outfitP2: loadOutfit('p2'),
        lan: null,
    };
    onStart: ((s: MenuState) => void) | null = null;

    private langBtn!: Node;
    private mapLabel!: Label;
    private mapPreview!: Graphics;
    private p1Label: Label | null = null;
    private p2Label: Label | null = null;
    // Outfit editor panel bits
    private outfitNode: Node | null = null;
    // LAN panel bits
    private lanClient: LanClient | null = null;
    private panelNode: Node | null = null;
    private panelStatus: Label | null = null;
    private panelCodeLbl: Label | null = null;
    private panelStartBtn: Node | null = null;
    private relayBox: EditBox | null = null;
    private codeBox: EditBox | null = null;

    onDestroy() {
        // If a connection was never handed off to the match, drop it.
        if (this.lanClient) this.lanClient.disconnect();
    }

    build() {
        const W = 1920, H = 1080;
        // paint past the design width so notched/tall phones see no gutters
        const CW = Math.max(W, coverSize().w);

        // background
        const bgN = new Node('bg');
        this.node.addChild(bgN);
        const bg = bgN.addComponent(Graphics);
        bg.fillColor = new Color(24, 28, 38);
        bg.rect(-CW / 2, -H / 2, CW, H);
        bg.fill();
        bg.fillColor = new Color(196, 148, 58, 255);
        bg.rect(-CW / 2, 120, CW, 8);
        bg.fill();
        bg.fillColor = new Color(46, 125, 50, 255);
        bg.rect(-CW / 2, 100, CW, 8);
        bg.fill();
        bg.fillColor = new Color(198, 40, 40, 255);
        bg.rect(-CW / 2, 80, CW, 8);
        bg.fill();

        // title
        this.title('ET MINI MILITIA', 0, 420, TYPE.display);
        this.title('ኢቲ ሚኒ ሚሊሻ', 0, 320, TYPE.h1, new Color(230, 200, 120));

        // language toggle
        this.langBtn = this.button(t('language'), -780, 430, () => {
            setLang(getLang() === 'en' ? 'am' : 'en');
            this.rebuildTexts();
        }, 220, 70);

        // map selector
        this.title(t('map_select'), 0, 190, TYPE.body);
        this.arrowButton(-560, 60, '<', () => this.changeMap(-1));
        this.arrowButton(560, 60, '>', () => this.changeMap(1));
        const mapNameN = new Node('mapname');
        ensureUT(mapNameN);
        this.node.addChild(mapNameN);
        this.mapLabel = this.makeLabel(mapNameN, '', 0, 90, TYPE.h2);
        const prevNode = new Node('mappreview');
        ensureUT(prevNode);
        this.node.addChild(prevNode);
        prevNode.setPosition(0, -30, 0);
        this.mapPreview = prevNode.addComponent(Graphics);

        // mode buttons
        makeButton(this.node, {
            text: t('play_bots'), x: 0, y: -140, w: 620, h: 100,
            fill: new Color(46, 125, 50), fontSize: TYPE.h3,
            onClick: () => {
                this.state.mode = 'bots';
                this.state.twoPlayers = false;
                this.state.lan = null;
                this.onStart?.(this.state);
            },
        });

        makeButton(this.node, {
            text: t('play_2p'), x: 0, y: -270, w: 620, h: 100,
            fill: new Color(21, 101, 192), fontSize: TYPE.h3,
            onClick: () => {
                this.state.mode = 'local';
                this.state.twoPlayers = true;
                this.state.lan = null;
                this.onStart?.(this.state);
            },
        });

        // LAN row
        this.button(t('lan_host'), -170, -370, () => this.openLanPanel('host'),
            300, 76, new Color(0, 105, 92));
        this.button(t('lan_join'), 170, -370, () => this.openLanPanel('join'),
            300, 76, new Color(0, 105, 92));

        // character selectors (with per-slot outfit customization)
        this.p1Label = this.charRow(-650, 'p1', (dir) => {
            this.state.charP1 = (this.state.charP1 + dir + CHARACTERS.length) % CHARACTERS.length;
            this.refreshChars();
        });
        this.p2Label = this.charRow(650, 'p2', (dir) => {
            this.state.charP2 = (this.state.charP2 + dir + CHARACTERS.length) % CHARACTERS.length;
            this.refreshChars();
        });
        this.refreshAll();
    }

    private charRow(x: number, slot: 'p1' | 'p2',
                    onChange: (d: number) => void): Label {
        const lblN = new Node('charLbl' + x);
        this.node.addChild(lblN);
        const lbl = this.makeLabel(lblN, '', x, -450, TYPE.body);
        this.arrowButton(x - 260, -450, '<', () => onChange(-1), true);
        this.arrowButton(x + 260, -450, '>', () => onChange(1), true);
        this.button(t('customize'), x, -545,
            () => this.openOutfitPanel(slot), 240, 60,
            new Color(96, 78, 40), TYPE.small);
        return lbl;
    }

    private refreshChars() {
        if (this.p1Label) {
            this.p1Label.string = `${t('choose_char_p1')}: ${t(CHARACTERS[this.state.charP1].nameKey)}`;
        }
        if (this.p2Label) {
            this.p2Label.string = `${t('choose_char_p2')}: ${t(CHARACTERS[this.state.charP2].nameKey)}`;
        }
    }

    private refreshAll() {
        this.langBtn.getComponentInChildren(Label)!.string = t('language');
        this.mapLabel.string = t(this.mapDef().nameKey);
        this.drawPreview();
        this.refreshChars();
    }

    private rebuildTexts() {
        // simplest robust approach: rebuild whole menu
        this.closeLan();
        this.closePanel();
        if (this.outfitNode && this.outfitNode.isValid) this.outfitNode.destroy();
        this.outfitNode = null;
        this.node.removeAllChildren();
        this.build();
    }

    /** Destroys the LAN panel and drops every stale widget reference. */
    private closePanel() {
        if (this.panelNode && this.panelNode.isValid) this.panelNode.destroy();
        this.panelNode = null;
        this.panelStatus = null;
        this.panelCodeLbl = null;
        this.panelStartBtn = null;
        this.relayBox = null;
        this.codeBox = null;
    }

    // ---- outfit editor -----------------------------------------------------
    /**
     * Full-screen outfit editor for one player slot: live fighter preview
     * plus swatch rows for clothes / scarf / skin. Every change applies to
     * the menu state and persists immediately, so backing out never loses
     * a look the player liked.
     */
    private openOutfitPanel(slot: 'p1' | 'p2') {
        if (this.outfitNode && this.outfitNode.isValid) this.outfitNode.destroy();

        const W = 1920, H = 1080;
        const CW = Math.max(W, coverSize().w);
        const pn = new Node('outfitPanel');
        this.node.addChild(pn);
        pn.addComponent(UITransform);
        this.outfitNode = pn;

        const g = pn.addComponent(Graphics);
        g.fillColor = new Color(8, 10, 16, 245);
        g.rect(-CW / 2, -H / 2, CW, H);
        g.fill();

        const charIdx = slot === 'p1' ? this.state.charP1 : this.state.charP2;
        let ov: OutfitOverride = { ...(slot === 'p1' ? this.state.outfitP1 : this.state.outfitP2) };

        // working copy -> menu state + localStorage
        const commit = () => {
            if (slot === 'p1') this.state.outfitP1 = { ...ov };
            else this.state.outfitP2 = { ...ov };
            saveOutfit(slot, ov);
        };

        // title
        const titleN = new Node('ofTitle');
        pn.addChild(titleN);
        ensureUT(titleN);
        titleN.setPosition(0, 430, 0);
        const tl = titleN.addComponent(Label);
        tl.string = `${t('customize')} — ${t(CHARACTERS[charIdx].nameKey)}`;
        tl.fontSize = TYPE.h1;
        tl.lineHeight = Math.floor(TYPE.h1 * 1.25);
        tl.color = new Color(255, 226, 150);

        // live fighter preview (same rig + rifle layer the game renders)
        const prevN = new Node('preview');
        pn.addChild(prevN);
        ensureUT(prevN);
        prevN.setPosition(-470, 40, 0);
        prevN.setScale(2.8, 2.8, 1);
        const pg = prevN.addComponent(Graphics);
        const gunN = new Node('gun');
        prevN.addChild(gunN);
        ensureUT(gunN);
        const gunG = gunN.addComponent(Graphics);
        gunN.setPosition(CFG.PLAYER_W * 0.06, -CFG.PLAYER_H * 0.02, 0);
        drawGun(gunG, WEAPONS[WeaponId.RIFLE], 0);
        const padN = new Node('pad');
        pn.addChild(padN);
        ensureUT(padN);
        padN.setPosition(-470, -170, 0);
        const padG = padN.addComponent(Graphics);
        padG.fillColor = new Color(28, 34, 46);
        padG.roundRect(-110, -160, 220, 330, RADIUS.md);
        padG.fill();

        // swatch rows: [state key, i18n label, palette]
        const rows: { key: 'b' | 'a' | 's'; label: string; colors: string[] }[] = [
            { key: 'b', label: t('outfit_body'), colors: CLOTHES_PALETTE },
            { key: 'a', label: t('outfit_scarf'), colors: SCARF_PALETTE },
            { key: 's', label: t('outfit_skin'), colors: SKIN_TONES },
        ];
        interface Sw { hex: string; g: Graphics; }
        const swatches: Record<string, Sw[]> = { b: [], a: [], s: [] };
        const GAP = 58, R = 22;

        let y = 250;
        for (const row of rows) {
            const lblN = new Node('rowLbl' + row.key);
            pn.addChild(lblN);
            ensureUT(lblN);
            lblN.setPosition(-560, y, 0);
            const rl = lblN.addComponent(Label);
            rl.string = row.label;
            rl.fontSize = TYPE.body;
            rl.lineHeight = Math.floor(TYPE.body * 1.3);
            rl.color = new Color(200, 205, 215);
            (lblN.getComponent(UITransform)!).setContentSize(300, 50);

            row.colors.forEach((hex, i) => {
                const n = new Node(`sw_${row.key}_${i}`);
                pn.addChild(n);
                n.setPosition(-330 + i * GAP, y, 0);
                n.addComponent(UITransform).setContentSize(R * 2 + 12, R * 2 + 12);
                const sg = n.addComponent(Graphics);
                swatches[row.key].push({ hex, g: sg });
                n.on(Node.EventType.TOUCH_END, () => {
                    ov[row.key] = hex;
                    commit();
                    repaint();
                });
            });
            y -= 140;
        }

        // redraw preview + selection rings; called after every change
        const repaint = () => {
            drawFighterRig(pg, resolveChar(charIdx, ov));
            for (const row of rows) {
                for (const sw of swatches[row.key]) {
                    sw.g.clear();
                    sw.g.fillColor = new Color(sw.hex);
                    sw.g.circle(0, 0, R);
                    sw.g.fill();
                    const selected = ov[row.key] === sw.hex;
                    sw.g.lineWidth = selected ? 5 : 2;
                    sw.g.strokeColor = selected
                        ? new Color(255, 255, 255)
                        : new Color(255, 255, 255, 60);
                    sw.g.circle(0, 0, R + (selected ? 4 : 3));
                    sw.g.stroke();
                }
            }
        };
        repaint();

        // Defaults: clear every override back to roster colors
        this.button(t('outfit_reset'), -230, -420, () => {
            ov = {};
            commit();
            repaint();
        }, 300, 84, new Color(62, 74, 96), TYPE.body);

        this.button(t('done'), 230, -420, () => {
            pn.destroy();
            if (this.outfitNode === pn) this.outfitNode = null;
        }, 300, 84, new Color(46, 125, 50), TYPE.body);
    }

    // ---- LAN room panel ---------------------------------------------------
    private getLan(): LanClient {
        if (!this.lanClient) this.lanClient = new LanClient();
        return this.lanClient;
    }

    private closeLan() {
        if (this.lanClient) { this.lanClient.disconnect(); this.lanClient = null; }
    }

    private setStatus(s: string) { if (this.panelStatus) this.panelStatus.string = s; }

    /** Detaches network handlers from the panel before handing to GameRoot. */
    private detachNetHandlers() {
        const lan = this.lanClient;
        if (!lan) return;
        lan.onReady = null;
        lan.onData = null;
        lan.onPeerGone = null;
        lan.onError = null;
        lan.onStatus = null;
    }

    private openLanPanel(role: 'host' | 'join') {
        if (this.panelNode && this.panelNode.isValid) this.panelNode.destroy();
        this.closeLan();

        const W = 1920, H = 1080;
        const CW = Math.max(W, coverSize().w);
        const pn = new Node('lanPanel');
        this.node.addChild(pn);
        pn.addComponent(UITransform);
        this.panelNode = pn;

        const g = pn.addComponent(Graphics);
        g.fillColor = new Color(8, 10, 16, 240);
        g.rect(-CW / 2, -H / 2, CW, H);
        g.fill();

        const lbl = (str: string, x: number, y: number, size: number,
                     color?: Color): Label => {
            const n = new Node('plbl' + y + '_' + x);
            pn.addChild(n);
            ensureUT(n);
            n.setPosition(x, y, 0);
            const l = n.addComponent(Label);
            l.string = str;
            l.fontSize = size;
            l.lineHeight = Math.floor(size * 1.25);
            l.color = color ?? new Color(235, 235, 235);
            l.overflow = Label.Overflow.SHRINK;
            (n.getComponent(UITransform)!).setContentSize(900, size * 1.4);
            return l;
        };

        const btn = (text: string, x: number, y: number, onClick: () => void,
                     w: number, h: number, color: Color): Node =>
            makeButton(pn, { text, x, y, w, h, fill: color, onClick });

        const editBox = (x: number, y: number, w: number, h: number,
                         ph: string): EditBox => {
            const bgN = new Node('ebg');
            pn.addChild(bgN);
            bgN.setPosition(x, y, 0);
            bgN.addComponent(UITransform).setContentSize(w, h);
            const ebg = bgN.addComponent(Graphics);
            ebg.fillColor = new Color(28, 34, 46);
            ebg.roundRect(-w / 2, -h / 2, w, h, RADIUS.sm);
            ebg.strokeColor = new Color(120, 130, 150);
            ebg.lineWidth = 3;
            ebg.roundRect(-w / 2, -h / 2, w, h, RADIUS.sm);
            ebg.stroke();
            const n = new Node('eb');
            pn.addChild(n);
            n.setPosition(x, y, 0);
            n.addComponent(UITransform).setContentSize(w, h);
            const eb = n.addComponent(EditBox);
            eb.placeholder = ph;
            eb.string = '';
            eb.maxLength = 64;
            return eb;
        };

        lbl(t('lan_title'), 0, 400, TYPE.h1, new Color(255, 226, 150));
        lbl(t('relay_addr'), 0, 280, TYPE.body);

        this.relayBox = editBox(0, 210, 760, 74, 'ws://192.168.1.10:9420');
        this.relayBox.string = LanClient.savedRelay();

        this.panelCodeLbl = role === 'host'
            ? lbl('', 0, 60, TYPE.display, new Color(120, 255, 160))
            : null;

        let codeStr = '';
        if (role === 'join') {
            lbl(t('room_code'), 0, 90, TYPE.body);
            this.codeBox = editBox(0, 20, 380, 74, 'ABCD');
            this.codeBox.maxLength = 4;
        }

        this.panelStatus = lbl('', 0, -80, TYPE.body, new Color(255, 214, 120));

        const backBtn = btn(t('back'), -420, -420, () => {
            this.closeLan();
            this.closePanel();
        }, 260, 84, new Color(62, 74, 96));

        if (role === 'host') {
            this.panelStartBtn = btn(t('start_match'), 300, -420, () => {
                this.hostStartMatch();
            }, 420, 92, new Color(120, 120, 130));
            btn(t('create_room'), -100, -180, async () => {
                await this.hostCreateRoom();
            }, 520, 92, new Color(0, 105, 92));
        } else {
            btn(t('join_room'), 0, -180, async () => {
                await this.guestJoinRoom(String(this.codeBox?.string || '').toUpperCase().trim());
            }, 520, 92, new Color(0, 105, 92));
        }
        void backBtn;
        void codeStr;
        this.setStatus(t('waiting_relay'));
    }

    private async connectRelay(): Promise<boolean> {
        const url = String(this.relayBox?.string || '').trim() || LanClient.savedRelay();
        LanClient.saveRelay(url);
        const lan = this.getLan();
        lan.onStatus = s => { if (s === 'connecting') this.setStatus(t('waiting_relay')); };
        try {
            await lan.connect(url);
            return true;
        } catch {
            this.setStatus(t('connect_fail'));
            return false;
        }
    }

    private async hostCreateRoom() {
        if (!await this.connectRelay()) return;
        const lan = this.getLan();
        lan.role = 'host';
        lan.onData = (d: PeerMsg) => {
            if (d.m === 'hello') {
                this.state.charP2 = d.char % CHARACTERS.length;
                if (d.outfit) this.state.outfitP2 = d.outfit; // adopt peer's look
                this.setStatus(`${t('peer_found')} (${t(CHARACTERS[this.state.charP2].nameKey)})`);
                this.enableStart(true);
            } else if (d.m === 'start') {
                // ignore echoes
            }
        };
        lan.onPeerGone = () => {
            this.setStatus(t('waiting_peer'));
            this.enableStart(false);
        };
        lan.onError = msg => {
            this.setStatus(msg === 'full' ? t('room_full')
                : msg === 'bad_code' ? t('bad_code') : msg);
        };
        try {
            const code = await lan.createRoom();
            if (this.panelCodeLbl) this.panelCodeLbl.string = code;
            this.setStatus(t('waiting_peer'));
        } catch {
            this.setStatus(t('connect_fail'));
        }
    }

    private enableStart(on: boolean) {
        if (!this.panelStartBtn) return;
        const g = this.panelStartBtn.getComponent(Graphics)!;
        g.clear();
        g.fillColor = on ? new Color(46, 125, 50) : new Color(120, 120, 130);
        const ut = this.panelStartBtn.getComponent(UITransform)!;
        g.roundRect(-ut.width / 2, -ut.height / 2, ut.width, ut.height, 14);
        g.fill();
        this.panelStartBtn.getComponentInChildren(Label)!.color =
            new Color(255, 255, 255, on ? 255 : 130);
    }

    private hostStartMatch() {
        const lan = this.lanClient;
        if (!lan || !lan.code) return;
        lan.send({
            m: 'start',
            mapIndex: this.state.mapIndex,
            charHost: this.state.charP1,
            charGuest: this.state.charP2,
            outfitHost: this.state.outfitP1,
            outfitGuest: this.state.outfitP2,
        });
        this.detachNetHandlers();
        this.state.mode = 'netHost';
        this.state.twoPlayers = true;
        this.state.lan = lan;
        this.lanClient = null; // ownership moves to GameRoot
        if (this.panelNode) { this.panelNode.destroy(); this.panelNode = null; }
        this.onStart?.(this.state);
    }

    private async guestJoinRoom(code: string) {
        if (!await this.connectRelay()) return;
        const lan = this.getLan();
        lan.role = 'guest';
        lan.onReady = () => {
            lan.send({ m: 'hello', char: this.state.charP2, outfit: this.state.outfitP2 });
            this.setStatus(t('peer_found') + ' — ' + t('waiting_peer'));
        };
        lan.onData = (d: PeerMsg) => {
            if (d.m !== 'start') return;
            this.detachNetHandlers();
            this.state.mode = 'netGuest';
            this.state.twoPlayers = true;
            this.state.mapIndex = d.mapIndex % MAPS.length;
            this.state.charP1 = d.charHost;
            this.state.charP2 = d.charGuest;
            if (d.outfitHost) this.state.outfitP1 = d.outfitHost; // host's look
            if (d.outfitGuest) this.state.outfitP2 = d.outfitGuest;
            this.state.lan = lan;
            this.lanClient = null;
            if (this.panelNode) { this.panelNode.destroy(); this.panelNode = null; }
            this.onStart?.(this.state);
        };
        lan.onPeerGone = () => this.setStatus(t('waiting_peer'));
        lan.onError = msg => {
            this.setStatus(msg === 'full' ? t('room_full')
                : msg === 'bad_code' ? t('bad_code') : msg);
        };
        if (code.length !== 4) { this.setStatus(t('bad_code')); return; }
        try {
            await lan.joinRoom(code);
            // hello is sent from onReady (fires for both peers)
        } catch (e) {
            this.setStatus(String(e).includes('timeout') ? t('bad_code') : t('connect_fail'));
        }
    }

    private mapDef() { return MAPS[this.state.mapIndex]; }

    private changeMap(d: number) {
        this.state.mapIndex = (this.state.mapIndex + d + MAPS.length) % MAPS.length;
        this.mapLabel.string = t(this.mapDef().nameKey);
        this.drawPreview();
    }
    private drawPreview() {
        const g = this.mapPreview;
        g.clear();
        const m = this.mapDef();
        g.fillColor = m.skyTop;
        g.roundRect(-380, -10, 240, 130, 12);
        g.fill();
        g.fillColor = m.tileFill;
        g.rect(-350, 20, 60, 100);
        g.fill();
        g.rect(-270, -10, 80, 130);
        g.fill();
        g.rect(-170, 45, 55, 75);
        g.fill();
        g.fillColor = m.decoColor;
        g.rect(-350, 112, 60, 9);
        g.fill();
        g.rect(-170, 112, 55, 9);
        g.fill();
    }

    // ---- widget helpers ----
    private makeLabel(parent: Node, str: string, x: number, y: number, size: number,
                      color: Color = new Color(255, 255, 255)): Label {
        parent.setPosition(x, y, 0);
        const ut = parent.getComponent(UITransform) ?? parent.addComponent(UITransform);
        ut.setContentSize(700, size * 1.4);
        const l = parent.addComponent(Label);
        l.string = str;
        l.fontSize = size;
        l.lineHeight = Math.floor(size * 1.25);
        l.color = color;
        l.isBold = size >= 44;
        l.overflow = Label.Overflow.SHRINK;
        return l;
    }

    private title(str: string, x: number, y: number, size: number, color?: Color) {
        const n = new Node('title' + y);
        this.node.addChild(n);
        this.makeLabel(n, str, x, y, size, color ?? new Color(255, 226, 150));
    }

    private button(text: string, x: number, y: number, onClick: () => void,
                   w = 300, h = 76, color: Color = new Color(62, 74, 96),
                   fontSize?: number): Node {
        return makeButton(this.node, {
            text, x, y, w, h, fill: color, fontSize, onClick,
        });
    }

    private arrowButton(x: number, y: number, ch: string, onClick: () => void, small = false) {
        this.button(ch === '<' ? '◀' : '▶', x, y, onClick, small ? 70 : 110, small ? 56 : 80,
            new Color(90, 84, 60));
    }
}
