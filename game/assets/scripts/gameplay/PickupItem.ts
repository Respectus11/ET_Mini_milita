/**
 * PickupItem.ts
 * ---------------------------------------------------------------------------
 * Ethiopian power-up pickups placed on map markers:
 *   'B' buna   — coffee cup, temporary move-speed boost
 *   'I' injera — flatbread stack, restores health
 *   'M' mesob  — woven table silhouette, damage-absorbing shield
 * ('W' weapon crates are handled separately by WeaponCrate.)
 */
import { _decorator, Color, Component, Graphics, Label, Node } from 'cc';
const { ccclass } = _decorator;
import { CFG } from '../core/GameConfig';
import { Fighter } from './Fighter';
import { ensureUT } from '../core/UIUtil';

export type ItemKind = 'buna' | 'injera' | 'mesob';

@ccclass('PickupItem')
export class PickupItem extends Component {
    kind: ItemKind = 'buna';
    x = 0; y = 0;
    respawnT = 0;
    taken = false;

    private g: Graphics = null!;
    private iconLbl: Label = null!;
    private iconNode: Node = null!;

    setup(kind: ItemKind, x: number, y: number) {
        this.kind = kind;
        this.x = x; this.y = y;
        this.taken = false;
        this.respawnT = 0;

        ensureUT(this.node);
        if (!this.g) {
            this.g = this.node.addComponent(Graphics);
            this.iconNode = new Node('icon');
            this.node.addChild(this.iconNode);
            ensureUT(this.iconNode);
            this.iconLbl = this.iconNode.addComponent(Label);
        }
        this.node.setPosition(x, y, 0);
        this.node.active = true;
        this.draw();
    }

    private color(): Color {
        switch (this.kind) {
            case 'buna': return new Color(160, 100, 40);   // coffee brown
            case 'injera': return new Color(214, 204, 186); // grey-bread
            case 'mesob': return new Color(64, 196, 255);   // shield cyan
        }
    }

    private draw() {
        const g = this.g;
        g.clear();
        const bob = Math.sin(Date.now() / 300 + this.x) * 3;
        const col = this.color();

        // ring + glow pad
        g.lineWidth = 3.5;
        g.strokeColor = col;
        g.circle(0, 26 + bob, 22);
        g.stroke();
        g.fillColor = new Color(col.r, col.g, col.b, 55);
        g.circle(0, 26 + bob, 28);
        g.fill();

        // kind-specific pictogram inside the ring
        g.fillColor = col;
        switch (this.kind) {
            case 'buna': // little jebena cup: body + handle + saucer
                g.roundRect(-8, 20 + bob, 14, 11, 3); g.fill();
                g.arc(7, 24 + bob, 5, -Math.PI / 2, Math.PI / 2, false);
                g.moveTo(-10, 33 + bob); g.lineTo(10, 33 + bob);
                break;
            case 'injera': // stacked soft discs
                g.ellipse(0, 24 + bob, 12, 4.5); g.fill();
                g.ellipse(0, 30 + bob, 9, 3.6); g.fill();
                break;
            case 'mesob': // shield silhouette
                g.moveTo(0, 36 + bob);
                g.lineTo(9, 30 + bob); g.lineTo(9, 21 + bob);
                g.quadraticCurveTo(0, 15 + bob, -9, 21 + bob);
                g.lineTo(-9, 30 + bob);
                break;
        }

        // letter hint below pad
        this.iconNode.setPosition(0, -14, 0);
        this.iconLbl.string = this.kind.toUpperCase().slice(0, 4);
        this.iconLbl.fontSize = 16;
        this.iconLbl.lineHeight = 18;
        this.iconLbl.isBold = true;
        this.iconLbl.color = new Color(255, 255, 255, 190);
    }

    tryTake(f: Fighter): boolean {
        if (this.taken || !f.alive) return false;
        const dx = f.x - this.x, dy = f.y - (this.y + 26);
        if (Math.abs(dx) > 46 || Math.abs(dy) > 60) return false;

        switch (this.kind) {
            case 'buna':
                f.speedT = CFG.BUNA_TIME;
                break;
            case 'injera':
                f.heal(CFG.INJERA_HEAL);
                break;
            case 'mesob':
                f.shieldHp = CFG.SHIELD_HP;
                f.shieldT = CFG.SHIELD_TIME;
                break;
        }
        this.taken = true;
        this.respawnT = CFG.ITEM_RESPAWN;
        this.node.active = false;
        return true;
    }

    tick(dt: number) {
        if (!this.taken) {
            this.draw();
            return;
        }
        this.respawnT -= dt;
        if (this.respawnT <= 0) {
            this.taken = false;
            this.node.active = true;
            this.draw();
        }
    }
}
