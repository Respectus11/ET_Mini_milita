import { _decorator, Component, Node, Graphics, Color, Label, assetManager, ImageAsset, Sprite, SpriteFrame, UITransform, tween, Vec3 } from 'cc';
import { ensureUT } from '../core/UIUtil';
import { Sfx } from '../core/Audio';

const { ccclass } = _decorator;

export interface QuoteItem {
    quote: string;
    author: string;
}

export const HISTORICAL_QUOTES: QuoteItem[] = [
    {
        quote: "Stand firm in honor; victory is forged in the heart of courage.",
        author: "Battle of Adwa / Imperial Ethos"
    },
    {
        quote: "Courage is not the absence of fear, but the triumph over it.",
        author: "Warrior Tradition"
    },
    {
        quote: "A warrior's greatest weapon is his unwavering spirit.",
        author: "Tewodros II Legacy"
    },
    {
        quote: "The soil beneath our boots was won with valor — defend it with pride.",
        author: "Patriot Oath"
    }
];

@ccclass('LoadingScreen')
export class LoadingScreen extends Component {
    public onLoaded: (() => void) | null = null;

    private artSpriteNode: Node | null = null;
    private quoteLabel: Label | null = null;
    private authorLabel: Label | null = null;
    private statusLabel: Label | null = null;
    private barGfx: Graphics | null = null;

    private progress: number = 0;
    private targetProgress: number = 1.0;
    private isDone: boolean = false;

    private readonly steps = [
        'Preparing battlefield equipment...',
        'Locking satellite coordinates...',
        'Checking ammunition & grenades...',
        'Calibrating jetpack thrusters...',
        'Entering combat arena!'
    ];

    public build(customQuoteIndex?: number) {
        const rootUT = ensureUT(this.node);
        rootUT.setContentSize(1920, 1080);
        this.node.setPosition(0, 0, 0);

        // 1. Cinematic dark background with battle vignette
        const bgNode = new Node('load_bg');
        this.node.addChild(bgNode);
        ensureUT(bgNode).setContentSize(1920, 1080);
        const bgGfx = bgNode.addComponent(Graphics);
        bgGfx.fillColor = new Color(8, 11, 16, 255);
        bgGfx.rect(-960, -540, 1920, 1080);
        bgGfx.fill();

        // 2. Art Frame Container (positioned nicely at upper center)
        const frameW = 620;
        const frameH = 430;
        const frameY = 120;

        const frameNode = new Node('art_frame');
        this.node.addChild(frameNode);
        ensureUT(frameNode).setContentSize(frameW, frameH);
        frameNode.setPosition(0, frameY, 0);

        const frameGfx = frameNode.addComponent(Graphics);
        // Outer dark shadow
        frameGfx.fillColor = new Color(0, 0, 0, 160);
        frameGfx.roundRect(-frameW / 2 - 8, -frameH / 2 - 8, frameW + 16, frameH + 16, 12);
        frameGfx.fill();
        // Golden metallic border
        frameGfx.strokeColor = new Color(212, 175, 55, 230); // Royal Gold
        frameGfx.lineWidth = 4;
        frameGfx.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, 8);
        frameGfx.stroke();
        // Inner subtle border
        frameGfx.strokeColor = new Color(120, 90, 35, 120);
        frameGfx.lineWidth = 1;
        frameGfx.roundRect(-frameW / 2 + 5, -frameH / 2 + 5, frameW - 10, frameH - 10, 6);
        frameGfx.stroke();

        // 3. The Heroic Artwork Image Node
        this.artSpriteNode = new Node('hero_art_img');
        frameNode.addChild(this.artSpriteNode);
        const imgUT = ensureUT(this.artSpriteNode);
        imgUT.setContentSize(frameW - 12, frameH - 12);
        this.artSpriteNode.setPosition(0, 0, 0);

        const sprite = this.artSpriteNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        // Load the artwork file from textures/hero_art.png
        this.loadArtwork(sprite);

        // Gentle breathing animation on the framed artwork
        tween(frameNode)
            .repeatForever(
                tween(frameNode)
                    .to(3.0, { scale: new Vec3(1.015, 1.015, 1) })
                    .to(3.0, { scale: new Vec3(1.0, 1.0, 1) })
            )
            .start();

        // 4. Quote and Author
        const qIdx = customQuoteIndex !== undefined
            ? (customQuoteIndex % HISTORICAL_QUOTES.length)
            : Math.floor(Math.random() * HISTORICAL_QUOTES.length);
        const selectedQuote = HISTORICAL_QUOTES[qIdx];

        const qNode = new Node('quote_lbl');
        this.node.addChild(qNode);
        ensureUT(qNode).setContentSize(1300, 100);
        qNode.setPosition(0, -180, 0);

        this.quoteLabel = qNode.addComponent(Label);
        this.quoteLabel.string = `“${selectedQuote.quote}”`;
        this.quoteLabel.fontSize = 28;
        this.quoteLabel.lineHeight = 40;
        this.quoteLabel.isBold = true;
        this.quoteLabel.color = new Color(245, 230, 180, 255); // Warm parchment gold
        this.quoteLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.quoteLabel.overflow = Label.Overflow.SHRINK;

        const authNode = new Node('author_lbl');
        this.node.addChild(authNode);
        ensureUT(authNode).setContentSize(800, 40);
        authNode.setPosition(0, -235, 0);

        this.authorLabel = authNode.addComponent(Label);
        this.authorLabel.string = `— ${selectedQuote.author}`;
        this.authorLabel.fontSize = 20;
        this.authorLabel.lineHeight = 28;
        this.authorLabel.isItalic = true;
        this.authorLabel.color = new Color(180, 160, 110, 210);
        this.authorLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        // 5. Tactical Status & Progress Bar
        const statNode = new Node('status_lbl');
        this.node.addChild(statNode);
        ensureUT(statNode).setContentSize(600, 32);
        statNode.setPosition(0, -320, 0);

        this.statusLabel = statNode.addComponent(Label);
        this.statusLabel.string = this.steps[0];
        this.statusLabel.fontSize = 20;
        this.statusLabel.color = new Color(140, 200, 240, 240); // Tactical cyan
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        const barNode = new Node('progress_bar');
        this.node.addChild(barNode);
        ensureUT(barNode).setContentSize(700, 24);
        barNode.setPosition(0, -360, 0);
        this.barGfx = barNode.addComponent(Graphics);
        this.drawProgressBar(0);
    }

    private loadArtwork(sprite: Sprite) {
        // Try loading remote/local texture path
        const possibleUrls = [
            'textures/hero_art.png',
            'assets/textures/hero_art.png',
            '../assets/textures/hero_art.png'
        ];

        let loaded = false;
        for (const url of possibleUrls) {
            assetManager.loadRemote<ImageAsset>(url, (err, imageAsset) => {
                if (!err && imageAsset && !loaded && sprite.isValid) {
                    loaded = true;
                    const sf = SpriteFrame.createWithImage(imageAsset);
                    sprite.spriteFrame = sf;
                }
            });
            if (loaded) break;
        }
    }

    private drawProgressBar(pct: number) {
        if (!this.barGfx) return;
        const g = this.barGfx;
        g.clear();

        const W = 640;
        const H = 16;
        const radius = 6;

        // Bar background
        g.fillColor = new Color(18, 26, 38, 240);
        g.roundRect(-W / 2, -H / 2, W, H, radius);
        g.fill();

        // Border
        g.strokeColor = new Color(70, 110, 150, 140);
        g.lineWidth = 2;
        g.roundRect(-W / 2, -H / 2, W, H, radius);
        g.stroke();

        // Fill progress
        const clamped = Math.max(0.02, Math.min(1.0, pct));
        const fillW = (W - 4) * clamped;

        g.fillColor = new Color(212, 175, 55, 245); // Rich Gold
        g.roundRect(-W / 2 + 2, -H / 2 + 2, fillW, H - 4, radius - 2);
        g.fill();
    }

    public update(dt: number) {
        if (this.isDone) return;

        // Advance simulated progress toward 1.0
        if (this.progress < this.targetProgress) {
            this.progress += dt * 0.45; // ~2.2 seconds loading
            if (this.progress > 1.0) this.progress = 1.0;

            this.drawProgressBar(this.progress);

            // Update tactical step text
            const stepIdx = Math.min(
                this.steps.length - 1,
                Math.floor(this.progress * this.steps.length)
            );
            if (this.statusLabel && this.statusLabel.string !== this.steps[stepIdx]) {
                this.statusLabel.string = this.steps[stepIdx];
            }
        }

        if (this.progress >= 1.0 && !this.isDone) {
            this.isDone = true;
            Sfx.playPickup('injera');
            // Brief pause at 100% then transition
            this.scheduleOnce(() => {
                this.finishAndExit();
            }, 0.35);
        }
    }

    private finishAndExit() {
        tween(this.node)
            .to(0.4, { scale: new Vec3(1.03, 1.03, 1) })
            .call(() => {
                if (this.onLoaded) {
                    this.onLoaded();
                }
                this.node.destroy();
            })
            .start();
    }
}
