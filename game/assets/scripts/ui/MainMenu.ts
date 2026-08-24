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
            this.state.twoPlayers = false;
            this.onStart?.(this.state);
        }, 620, 100, new Color(46, 125, 50));

        const twoBtn = this.button(t('play_2p'), 0, -270, () => {
            this.state.twoPlayers = true;
            this.onStart?.(this.state);
        }, 620, 100, new Color(21, 101, 192));

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
        const lbl = this.makeLabel(lblN, '', x, -400, 36);
        this.arrowButton(x - 260, -400, '<', () => onChange(-1), true);
        this.arrowButton(x + 260, -400, '>', () => onChange(1), true);
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
        this.node.removeAllChildren();
        this.build();
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
