import { _decorator, Color, Component, EditBox, Graphics, Label, Node, UITransform } from 'cc';
const { ccclass } = _decorator;
import { CHARACTERS } from '../data/Characters';
import { MAPS } from '../data/Maps';
import { getLang, setLang, t } from '../data/Strings';
import { ensureUT } from '../core/UIUtil';
import { LanClient, PeerMsg } from '../net/LanClient';

export type MenuMode = 'bots' | 'local' | 'netHost' | 'netGuest';

export interface MenuState {
    mode: MenuMode;
    mapIndex: number;
    twoPlayers: boolean;
    charP1: number;
    charP2: number;
    /** Live LAN connection handed over to GameRoot on match start. */
    lan: LanClient | null;
}

/** Fully code-built main menu (no scene/prefab assets needed). */
@ccclass('MainMenu')
export class MainMenu extends Component {
    state: MenuState = {
        mode: 'bots', mapIndex: 0, twoPlayers: false, charP1: 0, charP2: 1,
        lan: null,
    };
    onStart: ((s: MenuState) => void) | null = null;

    private langBtn!: Node;
    private mapLabel!: Label;
    private mapPreview!: Graphics;
    private p1Label: Label | null = null;
    private p2Label: Label | null = null;
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

        // background
        const bgN = new Node('bg');
        this.node.addChild(bgN);
        const bg = bgN.addComponent(Graphics);
        bg.fillColor = new Color(24, 28, 38);
        bg.rect(-W / 2, -H / 2, W, H);
        bg.fill();
        bg.fillColor = new Color(196, 148, 58, 255);
        bg.rect(-W / 2, 120, W, 8);
        bg.fill();
        bg.fillColor = new Color(46, 125, 50, 255);
        bg.rect(-W / 2, 100, W, 8);
        bg.fill();
        bg.fillColor = new Color(198, 40, 40, 255);
        bg.rect(-W / 2, 80, W, 8);
        bg.fill();

        // title
        this.title('ET MINI MILITIA', 0, 420, 110);
        this.title('ኢቲ ሚኒ ሚሊሻ', 0, 320, 64, new Color(230, 200, 120));

        // language toggle
        this.langBtn = this.button(t('language'), -780, 430, () => {
            setLang(getLang() === 'en' ? 'am' : 'en');
            this.rebuildTexts();
        }, 220, 70);

        // map selector
        this.title(t('map_select'), 0, 190, 44);
        this.arrowButton(-560, 60, '<', () => this.changeMap(-1));
        this.arrowButton(560, 60, '>', () => this.changeMap(1));
        const mapNameN = new Node('mapname');
        ensureUT(mapNameN);
        this.node.addChild(mapNameN);
        this.mapLabel = this.makeLabel(mapNameN, '', 0, 90, 48);
        const prevNode = new Node('mappreview');
        ensureUT(prevNode);
        this.node.addChild(prevNode);
        prevNode.setPosition(0, -30, 0);
        this.mapPreview = prevNode.addComponent(Graphics);

        // mode buttons
        this.button(t('play_bots'), 0, -140, () => {
            this.state.mode = 'bots';
            this.state.twoPlayers = false;
            this.state.lan = null;
            this.onStart?.(this.state);
        }, 620, 100, new Color(46, 125, 50));

        const twoBtn = this.button(t('play_2p'), 0, -270, () => {
            this.state.mode = 'local';
            this.state.twoPlayers = true;
            this.state.lan = null;
            this.onStart?.(this.state);
        }, 620, 100, new Color(21, 101, 192));

        // LAN row
        this.button(t('lan_host'), -170, -370, () => this.openLanPanel('host'),
            300, 76, new Color(0, 105, 92));
        this.button(t('lan_join'), 170, -370, () => this.openLanPanel('join'),
            300, 76, new Color(0, 105, 92));

        // character selectors
        this.p1Label = this.charRow(-650, (dir) => {
            this.state.charP1 = (this.state.charP1 + dir + CHARACTERS.length) % CHARACTERS.length;
            this.refreshChars();
        });
        this.p2Label = this.charRow(650, (dir) => {
            this.state.charP2 = (this.state.charP2 + dir + CHARACTERS.length) % CHARACTERS.length;
            this.refreshChars();
        });
        void twoBtn;
        this.refreshAll();
    }

    private charRow(x: number, onChange: (d: number) => void): Label {
        const lblN = new Node('charLbl' + x);
        this.node.addChild(lblN);
        const lbl = this.makeLabel(lblN, '', x, -450, 36);
        this.arrowButton(x - 260, -450, '<', () => onChange(-1), true);
        this.arrowButton(x + 260, -450, '>', () => onChange(1), true);
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
        this.node.removeAllChildren();
        this.build();
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
        const pn = new Node('lanPanel');
        this.node.addChild(pn);
        pn.addComponent(UITransform);
        this.panelNode = pn;

        const g = pn.addComponent(Graphics);
        g.fillColor = new Color(8, 10, 16, 240);
        g.rect(-W / 2, -H / 2, W, H);
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
                     w: number, h: number, color: Color): Node => {
            const n = new Node('pbtn_' + text.slice(0, 6));
            pn.addChild(n);
            n.setPosition(x, y, 0);
            n.addComponent(UITransform).setContentSize(w, h);
            const bg = n.addComponent(Graphics);
            bg.fillColor = color;
            bg.roundRect(-w / 2, -h / 2, w, h, 14);
            bg.fill();
            const ln = new Node('l');
            n.addChild(ln);
            ensureUT(ln);
            const l = ln.addComponent(Label);
            l.string = text;
            l.fontSize = Math.floor(h * 0.4);
            l.lineHeight = Math.floor(h * 0.5);
            l.color = new Color(255, 255, 255);
            l.isBold = true;
            n.on(Node.EventType.TOUCH_END, onClick);
            return n;
        };

        const editBox = (x: number, y: number, w: number, h: number,
                         ph: string): EditBox => {
            const bgN = new Node('ebg');
            pn.addChild(bgN);
            bgN.setPosition(x, y, 0);
            bgN.addComponent(UITransform).setContentSize(w, h);
            const ebg = bgN.addComponent(Graphics);
            ebg.fillColor = new Color(28, 34, 46);
            ebg.roundRect(-w / 2, -h / 2, w, h, 10);
            ebg.strokeColor = new Color(120, 130, 150);
            ebg.lineWidth = 3;
            ebg.roundRect(-w / 2, -h / 2, w, h, 10);
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

        lbl(t('lan_title'), 0, 400, 68, new Color(255, 226, 150));
        lbl(t('relay_addr'), 0, 280, 32);

        this.relayBox = editBox(0, 210, 760, 74, 'ws://192.168.1.10:9420');
        this.relayBox.string = LanClient.savedRelay();

        this.panelCodeLbl = role === 'host'
            ? lbl('', 0, 60, 120, new Color(120, 255, 160))
            : null;

        let codeStr = '';
        if (role === 'join') {
            lbl(t('room_code'), 0, 90, 32);
            this.codeBox = editBox(0, 20, 380, 74, 'ABCD');
            this.codeBox.maxLength = 4;
        }

        this.panelStatus = lbl('', 0, -80, 34, new Color(255, 214, 120));

        const backBtn = btn(t('back'), -420, -420, () => {
            this.closeLan();
            pn.destroy();
            this.panelNode = null;
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
            lan.send({ m: 'hello', char: this.state.charP2 });
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
                   w = 300, h = 76, color: Color = new Color(62, 74, 96)): Node {
        const n = new Node('btn_' + text.slice(0, 6));
        this.node.addChild(n);
        n.setPosition(x, y, 0);
        const ut = n.addComponent(UITransform);
        ut.setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 14);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = new Color(255, 255, 255, 70);
        g.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 12);
        g.stroke();
        const lblN = new Node('lbl');
        n.addChild(lblN);
        ensureUT(lblN);
        const l = lblN.addComponent(Label);
        l.string = text;
        l.fontSize = Math.floor(h * 0.42);
        l.lineHeight = Math.floor(h * 0.52);
        l.color = new Color(255, 255, 255);
        l.isBold = true;
        n.on(Node.EventType.TOUCH_END, onClick);
        return n;
    }

    private arrowButton(x: number, y: number, ch: string, onClick: () => void, small = false) {
        this.button(ch === '<' ? '◀' : '▶', x, y, onClick, small ? 70 : 110, small ? 56 : 80,
            new Color(90, 84, 60));
    }
}
