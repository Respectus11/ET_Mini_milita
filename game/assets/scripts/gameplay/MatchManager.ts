import { _decorator, Color, Component, Graphics, Node } from 'cc';
const { ccclass } = _decorator;
import { bus, Evt } from '../core/EventBus';
import { CFG } from '../core/GameConfig';
import { clamp, fmtTime } from '../core/Utils';
import { ensureUT } from '../core/UIUtil';
import { CHARACTERS, CharacterDef, OutfitOverride, resolveChar } from '../data/Characters';
import { MAPS, MapDef } from '../data/Maps';
import { WeaponId, WEAPONS, WEAPON_LIST } from '../data/Weapons';
import { Fighter } from './Fighter';
import { PickupItem } from './PickupItem';
import { WeaponCrate } from './WeaponCrate';
import { ProjectileSystem } from './Projectile';
import { ExplosiveBarrel } from './ExplosiveBarrel';
import { Grenade } from './Grenade';
import { TileWorld } from '../world/TileWorld';
import { BotBrain } from '../ai/BotBrain';
import { PeerMsg } from '../net/LanClient';
import { Effects } from '../world/Effects';
import { ScreenShake } from '../world/ScreenShake';
import { Theme } from '../core/Theme';
import { Sfx } from '../core/Audio';
import { t } from '../data/Strings';

export type NetRole = 'off' | 'host' | 'guest';

export interface MatchOptions {
    mapIndex: number;
    twoPlayers: boolean;
    charP1: number;
    charP2: number;
    /** Player-customized clothes/scarf/skin overrides (see Characters.ts). */
    outfitP1?: OutfitOverride;
    outfitP2?: OutfitOverride;
    /** LAN multiplayer role. 'host' simulates; 'guest' mirrors snapshots. */
    netRole?: NetRole;
}

@ccclass('MatchManager')
export class MatchManager extends Component {
    opts: MatchOptions = { mapIndex: 0, twoPlayers: false, charP1: 0, charP2: 1 };

    world!: TileWorld;
    mapDef!: MapDef;
    fighters: Fighter[] = [];
    humans: Fighter[] = [];
    bots: BotBrain[] = [];
    projectiles!: ProjectileSystem;
    itemsRoot: Node = null!;   // buna / injera / mesob pickups
    crateRoot: Node = null!;   // weapon crates
    fighterRoot: Node = null!;
    barrelsRoot: Node = null!; // explosive red barrels
    grenadesRoot: Node = null!; // active hand grenades

    barrels: ExplosiveBarrel[] = [];
    grenades: Grenade[] = [];
    private killStreaks: Map<number, { current: number; lastKillT: number; multikill: number }> = new Map();
    private matchClock = 0;

    scores: Map<number, number> = new Map();
    timeLeft = CFG.MATCH_TIME;
    matchOver = false;
    private respawnQueue: { f: Fighter; t: number }[] = [];
    private fragHandler!: (killerId: number, victimId: number) => void;

    // ---- LAN state -------------------------------------------------------
    netRole: NetRole = 'off';
    /** Set by GameRoot; delivers a PeerMsg to the other device. */
    netSend: ((d: PeerMsg) => void) | null = null;
    /** Which fighter the LOCAL human controls (guest controls humans[1]). */
    myFighterId = 0;
    private snapT = 0;
    private inputT = 0;
    private remoteInput: Extract<PeerMsg, { m: 'input' }> | null = null;
    private guestDots: Node[] = [];

    // ---- juice layer -------------------------------------------------------
    fx!: Effects;                    // pooled world-space VFX
    shake = new ScreenShake();       // trauma-based screen shake
    frozen = false;                  // countdown hold (host/offline)
    hitStopT = 0;                    // brief slow-mo on big impacts
    private shakeBaseX = 0;
    private shakeBaseY = 0;
    private prevHp = new Map<number, number>();
    private aimG: Graphics | null = null;
    private aimWasOn = false;

    // callbacks injected by GameRoot
    onEnd: ((winnerId: number | null) => void) | null = null;
    touchApply: ((f1: Fighter, f2: Fighter | null) => void) | null = null;
    keyboardApply: ((f: Fighter) => void) | null = null;

    start() {
        this.netRole = this.opts.netRole ?? 'off';
        this.mapDef = MAPS[clamp(this.opts.mapIndex, 0, MAPS.length - 1)];
        this.world = new TileWorld(this.mapDef);

        ensureUT(this.node);
        // Shift the whole match subtree so world (0,0) sits at the
        // arena's bottom-left on screen. Fighters, pickups, crates, barrels,
        // and projectiles all use raw world coordinates — aligning the ROOT
        // keeps every entity in register with the painted tiles.
        this.node.setPosition(-this.world.worldW / 2, -this.world.worldH / 2, 0);
        this.shakeBaseX = -this.world.worldW / 2;
        this.shakeBaseY = -this.world.worldH / 2;
        const bg = this.node.addComponent(Graphics);
        this.world.drawStatic(bg, 0, 0);
        this.fx = new Effects(this.node);
        this.aimG = this.node.addComponent(Graphics);

        this.fighterRoot = new Node('fighters');
        this.itemsRoot = new Node('items');
        this.crateRoot = new Node('crates');
        this.barrelsRoot = new Node('barrels');
        this.grenadesRoot = new Node('grenades');
        ensureUT(this.fighterRoot);
        ensureUT(this.itemsRoot);
        ensureUT(this.crateRoot);
        ensureUT(this.barrelsRoot);
        ensureUT(this.grenadesRoot);
        this.node.addChild(this.fighterRoot);
        this.node.addChild(this.itemsRoot);
        this.node.addChild(this.crateRoot);
        this.node.addChild(this.barrelsRoot);
        this.node.addChild(this.grenadesRoot);

        this.projectiles = new ProjectileSystem({
            world: this.world,
            fighters: [],
            barrels: this.barrels,
            onSplash: (x: number, y: number) => this.onSplashFx(x, y),
        }, this.node);

        this.spawnBarrels();
        this.spawnRoster();
        this.projectiles.host.fighters = this.fighters.map(f => ({
            x: f.x, y: f.y, w: f.w, h: f.h,
            get alive() { return f.alive; },
            ownerId: f.id,
            ref: f,
            applyDamage: (d: number, k: number, hitY?: number, isExp?: boolean) =>
                f.applyDamage(d, k, hitY, isExp),
        }));

        this.spawnItems();
        this.spawnCrates();

        this.fragHandler = (killerId: number, victimId: number) => this.onFrag(killerId, victimId);
        bus.on(Evt.FRAG, this.fragHandler);
        this.schedule(this.tick, 0);
    }

    onDestroy() {
        bus.off(Evt.FRAG, this.fragHandler);
    }

    private spawnRoster() {
        const mk = (char: CharacterDef, isBot: boolean, label: string): Fighter => {
            const n = new Node('fighter_' + label);
            this.fighterRoot.addChild(n);
            const f = n.addComponent(Fighter);
            f.isBot = isBot;
            f.teamLabel = label;
            if (this.netRole === 'guest') f.netGhost = true;
            f.init(char, this.world);
            f.fx = this.fx;
            f.onNetDeath = () => this.shake.add(0.35);
            f.onShoot = (shooter) => this.fireWeapon(shooter);
            f.onMelee = (attacker) => this.resolveMelee(attacker);
            f.onThrowGrenade = (shooter, vx, vy) => this.throwGrenade(shooter, vx, vy);
            this.scores.set(f.id, 0);
            return f;
        };

        // Human fighters wear the customized outfits chosen in the menu;
        // resolveChar() merges overrides over the roster base colors.
        const p1 = mk(resolveChar(this.opts.charP1, this.opts.outfitP1), false, 'P1');
        p1.giveWeapon(WEAPONS[WeaponId.RIFLE]);
        const s1 = this.safeSpawn('p');
        p1.spawnAt(s1[0], s1[1]);
        this.fighters.push(p1);
        this.humans.push(p1);

        if (this.opts.twoPlayers) {
            const p2 = mk(resolveChar(this.opts.charP2, this.opts.outfitP2), false, 'P2');
            p2.giveWeapon(WEAPONS[WeaponId.RIFLE]);
            const s2 = this.safeSpawn('q');
            p2.spawnAt(s2[0], s2[1]);
            this.fighters.push(p2);
            this.humans.push(p2);

            // LAN matches share bots: identical roster on both devices,
            // simulated by the host only and mirrored via snapshots.
            const wantBots = this.netRole !== 'off' ? CFG.BOT_COUNT : 0;
            for (let i = 0; i < wantBots; i++) {
                const b = mk(CHARACTERS[(i + 2) % CHARACTERS.length], true, 'BOT' + (i + 1));
                b.giveWeapon(WEAPONS[WeaponId.RIFLE]);
                const sb = this.safeSpawn('e');
                b.spawnAt(sb[0], sb[1]);
                if (this.netRole === 'host') this.bots.push(new BotBrain(b, this.world));
                this.fighters.push(b);
            }
        } else {
            for (let i = 0; i < CFG.BOT_COUNT; i++) {
                const b = mk(CHARACTERS[(i + 2) % CHARACTERS.length], true, 'BOT' + (i + 1));
                b.giveWeapon(WEAPONS[WeaponId.RIFLE]);
                const sb = this.safeSpawn('e');
                b.spawnAt(sb[0], sb[1]);
                this.bots.push(new BotBrain(b, this.world));
                this.fighters.push(b);
            }
        }

        this.myFighterId = this.netRole === 'guest'
            ? this.humans[1].id
            : this.humans[0].id;
    }

    /** Returns [x,y] avoiding proximity to living enemies. */
    private safeSpawn(kind: 'p' | 'q' | 'e'): [number, number] {
        let best = this.world.randomSpawn(kind);
        let bestMinDist = -1;
        for (let i = 0; i < 5; i++) {
            const cand = this.world.randomSpawn(kind);
            let minDist = Infinity;
            for (const f of this.fighters) {
                if (!f.alive) continue;
                const d = Math.hypot(f.x - cand.x, f.y - cand.y);
                if (d < minDist) minDist = d;
            }
            if (minDist > bestMinDist) { bestMinDist = minDist; best = cand; }
        }
        return [best.x, best.y];
    }

    /** Buna / injera / mesob pickups on their map markers. */
    private spawnItems() {
        for (const s of this.world.itemSpawns) {
            if (s.ch === 'W' || s.ch === 'X') continue;
            const n = new Node('pickup_' + s.ch);
            this.itemsRoot.addChild(n);
            const it = n.addComponent(PickupItem);
            it.fx = this.fx;
            switch (s.ch) {
                case 'B': it.setup('buna', s.cx, s.cy); break;
                case 'I': it.setup('injera', s.cx, s.cy); break;
                case 'M': it.setup('mesob', s.cx, s.cy); break;
            }
        }
    }

    /** One weapon crate per 'W' marker in the map grid. */
    private spawnCrates() {
        for (const s of this.world.itemSpawns) {
            if (s.ch !== 'W') continue;
            const n = new Node('crate');
            this.crateRoot.addChild(n);
            const crate = n.addComponent(WeaponCrate);
            crate.fx = this.fx;
            crate.setup(s.cx, s.cy);
        }
    }

    /** Spawn explosive barrels from map 'X' markers. */
    private spawnBarrels() {
        for (const sp of this.world.barrelSpawns) {
            const n = new Node('barrel');
            this.barrelsRoot.addChild(n);
            const b = n.addComponent(ExplosiveBarrel);
            b.init(sp.x, sp.y, this.fx);
            b.onDetonate = (barrel, killerId) => this.onBarrelDetonate(barrel, killerId);
            this.barrels.push(b);
        }
    }

    private onBarrelDetonate(b: ExplosiveBarrel, killerId: number) {
        this.onSplashFx(b.x, b.y);
        const radius = 160;
        const maxDmg = 80;
        for (const f of this.fighters) {
            if (!f.alive) continue;
            const d = Math.hypot(f.x - b.x, f.y - b.y);
            if (d < radius) {
                const falloff = 1 - (d / radius) * 0.6;
                f.applyDamage(Math.round(maxDmg * falloff), killerId, b.y, true);
            }
        }
        for (const other of this.barrels) {
            if (other === b || !other.alive) continue;
            const d = Math.hypot(other.x - b.x, other.y - b.y);
            if (d < radius) {
                // Chain reaction detonation
                other.applyDamage(maxDmg, killerId);
            }
        }
    }

    /** Throw a Mini Militia hand grenade into the match arena. */
    throwGrenade(f: Fighter, vx: number, vy: number) {
        if (this.netRole === 'guest') return;
        const g = this.grenades.find(gr => !gr.active) ?? new Grenade(this.grenadesRoot);
        if (!this.grenades.includes(g)) this.grenades.push(g);
        g.spawn(f.id, f.x + f.faceDir * 18, f.y + 8, vx, vy, this.fx);
    }

    private onDetonateGrenade(g: Grenade) {
        this.onSplashFx(g.x, g.y);
        const radius = 150;
        const maxDmg = 90;
        for (const f of this.fighters) {
            if (!f.alive) continue;
            const d = Math.hypot(f.x - g.x, f.y - g.y);
            if (d < radius) {
                const falloff = 1 - (d / radius) * 0.65;
                f.applyDamage(Math.round(maxDmg * falloff), g.ownerId, g.y, true);
            }
        }
        for (const b of this.barrels) {
            if (!b.alive) continue;
            const d = Math.hypot(b.x - g.x, b.y - g.y);
            if (d < radius) {
                b.applyDamage(Math.round(maxDmg * (1 - d / radius * 0.5)), g.ownerId);
            }
        }
    }

    private fireWeapon(f: Fighter) {
        if (this.netRole === 'guest') return; // visuals come from snapshots
        const w = f.weapon;
        const muzzleX = f.x + f.faceDir * (f.w * 0.55);
        const muzzleY = f.y + f.h * 0.06;
        const baseAng = Math.atan2(f.aimIn.ay, f.aimIn.ax);
        for (let p = 0; p < w.pellets; p++) {
            const ang = baseAng + (Math.random() - 0.5) * (w.spreadDeg * Math.PI / 180);
            const col = w.id === WeaponId.LAUNCHER ? new Color(255, 120, 40)
                : w.id === WeaponId.SNIPER ? new Color(140, 255, 140)
                : w.id === WeaponId.SMG ? new Color(150, 235, 255)
                : w.id === WeaponId.PLASMA ? new Color(0, 240, 255)
                : w.id === WeaponId.MAGNUM ? new Color(255, 215, 0)
                : new Color(255, 240, 120);
            this.projectiles.spawn(f.id, muzzleX, muzzleY, ang,
                w.speed * (0.95 + Math.random() * 0.1), w, col);
        }
        // heavy guns kick the screen a little
        if (w.recoil >= 150) this.shake.add(0.06);
    }

    private resolveMelee(a: Fighter) {
        if (this.netRole === 'guest') return;
        for (const t of this.fighters) {
            if (t === a || !t.alive || t.id === a.id) continue;
            const dx = t.x - a.x, dy = t.y - a.y;
            if (Math.abs(dx) < CFG.MELEE_RANGE + t.w / 2 && Math.abs(dy) < 60 &&
                (Math.sign(dx) === a.faceDir || Math.abs(dx) < 20)) {
                t.applyDamage(CFG.MELEE_DMG, a.id);
                t.vx += Math.sign(dx || a.faceDir) * 320;
                t.vy = Math.max(t.vy, 260);
                this.shake.add(0.08);
                this.fx.burst({
                    x: t.x, y: t.y + t.h * 0.2, count: 5,
                    speed: 190, size: 3.5, life: 0.25,
                });
            }
        }
    }

    private onFrag(killerId: number, victimId: number) {
        if (killerId !== victimId) {
            this.scores.set(killerId, (this.scores.get(killerId) ?? 0) + 1);
        }
        const victim = this.fighters.find(f => f.id === victimId);
        if (victim) this.respawnQueue.push({ f: victim, t: CFG.RESPAWN_TIME });

        // ---- juice: pop, shake, hit-stop (host/offline only) ----
        if (this.netRole !== 'guest' && victim) {
            this.fx.confetti(victim.x, victim.y, [
                victim.char.body, victim.char.accent,
                Theme.gold, Theme.flagGreen, Theme.flagRed,
            ], 30);
            this.fx.floatText(victim.x, victim.y + 40, 'KO!', Theme.goldHi, 40);
            this.shake.add(0.5);
            this.hitStopT = 0.07;
        }

        // Killstreak calculation
        if (killerId !== victimId) {
            const vSt = this.killStreaks.get(victimId);
            if (vSt) { vSt.current = 0; vSt.multikill = 0; }

            let kSt = this.killStreaks.get(killerId);
            if (!kSt) {
                kSt = { current: 0, lastKillT: 0, multikill: 0 };
                this.killStreaks.set(killerId, kSt);
            }
            if (this.matchClock - kSt.lastKillT < 3.8) {
                kSt.multikill++;
            } else {
                kSt.multikill = 1;
            }
            kSt.lastKillT = this.matchClock;
            kSt.current++;

            let streakBadge = '';
            if (kSt.multikill === 2) streakBadge = 'double_kill';
            else if (kSt.multikill === 3) streakBadge = 'triple_kill';
            else if (kSt.current === 5) streakBadge = 'rampage';
            else if (kSt.current >= 7) streakBadge = 'unstoppable';

            if (streakBadge) {
                Sfx.playKillstreak(kSt.current);
                bus.emit(Evt.KILLSTREAK, killerId, streakBadge, kSt.current);
                const kf = this.fighters.find(f => f.id === killerId);
                if (kf && this.fx) {
                    this.fx.floatText(kf.x, kf.y + 60, t(streakBadge), Theme.goldHi, 44);
                }
            }
        }

        const killer = this.fighters.find(f => f.id === killerId);
        if (killer && (this.scores.get(killerId) ?? 0) >= CFG.FRAG_LIMIT) {
            this.endMatch(killerId);
        }
    }

    private endMatch(winnerId: number | null) {
        if (this.matchOver) return;
        this.matchOver = true;
        Sfx.playVictory();
        if (this.netRole === 'host' && this.netSend) {
            this.netSend({ m: 'end', winnerId });
        }
        if (this.onEnd) this.onEnd(winnerId);
    }

    // ---- LAN: peer message routing ----------------------------------------
    handlePeerMsg(d: PeerMsg) {
        switch (d.m) {
            case 'input':
                if (this.netRole === 'host') this.remoteInput = d;
                break;
            case 'snap':
                if (this.netRole === 'guest') this.applySnapshot(d);
                break;
            case 'end':
                if (this.netRole === 'guest' && !this.matchOver) {
                    this.timeLeft = Math.min(this.timeLeft, 0.05);
                    this.matchOver = true;
                    if (this.onEnd) this.onEnd(d.winnerId);
                }
                break;
        }
    }

    /** Combined pickup-taken flags: items first, then weapon crates. */
    private pickupFlags(): number[] {
        const out: number[] = [];
        for (const n of this.itemsRoot.children) {
            const it = n.getComponent(PickupItem);
            out.push(it && it.taken ? 1 : 0);
        }
        for (const n of this.crateRoot.children) {
            const c = n.getComponent(WeaponCrate);
            out.push(c && c.taken ? 1 : 0);
        }
        return out;
    }

    /** HOST: broadcast authoritative world state (~15 Hz). */
    private buildSnapshot(): Extract<PeerMsg, { m: 'snap' }> {
        return {
            m: 'snap',
            tl: Math.round(this.timeLeft * 10) / 10,
            scores: this.fighters.map(f => this.scores.get(f.id) ?? 0),
            items: this.pickupFlags(),
            fs: this.fighters.map((f, i) => ({
                i,
                x: Math.round(f.x), y: Math.round(f.y),
                fc: f.faceDir,
                hp: Math.max(0, Math.round(f.hp)),
                fu: Math.round(f.fuel),
                al: f.alive ? 1 : 0,
                am: f.ammo,
                rl: f.reloading ? 1 : 0,
                sp: Math.round(f.speedT),
                sh: Math.round(f.shieldHp),
                wp: WEAPON_LIST.indexOf(f.weapon.id),
                wp2: f.weapon2 ? WEAPON_LIST.indexOf(f.weapon2.id) : -1,
            })),
            ps: this.projectiles.liveCoords(),
        };
    }

    /** GUEST: adopt a snapshot — sync fighters/HUD/pickups/projectiles. */
    private applySnapshot(s: Extract<PeerMsg, { m: 'snap' }>) {
        this.timeLeft = s.tl;
        this.fighters.forEach((f, i) => {
            const st = s.fs[i];
            if (st) f.applyNetState(st);
            this.scores.set(f.id, s.scores[i] ?? 0);
        });

        // pickups: same combined order as buildSnapshot()
        const flags = s.items;
        let fi = 0;
        for (const n of this.itemsRoot.children) {
            const it = n.getComponent(PickupItem);
            if (!it) continue;
            const taken = flags[fi++] === 1;
            if (it.taken !== taken) {
                it.taken = taken;
                it.node.active = !taken;
            }
        }
        for (const n of this.crateRoot.children) {
            const c = n.getComponent(WeaponCrate);
            if (!c) continue;
            const taken = flags[fi++] === 1;
            if (c.taken !== taken) {
                c.taken = taken;
                c.node.active = !taken;
            }
        }

        // projectile ghosts
        const want = s.ps.length / 2;
        while (this.guestDots.length < want) {
            const n = new Node('ghostProj');
            this.itemsRoot.addChild(n);
            ensureUT(n);
            const g = n.addComponent(Graphics);
            g.fillColor = new Color(255, 240, 120, 230);
            g.circle(0, 0, 7);
            g.fill();
            this.guestDots.push(n);
        }
        for (let k = 0; k < this.guestDots.length; k++) {
            const dot = this.guestDots[k];
            if (k < want) {
                dot.setPosition(s.ps[k * 2], s.ps[k * 2 + 1], 0);
                dot.active = true;
            } else dot.active = false;
        }
    }

    /** Fire-intent flags injected by GameRoot (touch stick / mouse). */
    guestFireTouch = false;
    guestFireKeys = false;
    guestReload = false;
    guestGrenade = false;

    /** GUEST: relay the local player's inputs to the host at ~30 Hz. */
    private sendLocalInput() {
        if (!this.netSend || this.humans.length < 2) return;
        const me = this.humans[1];
        const doReload = this.guestReload;
        const doGrenade = this.guestGrenade;
        this.guestReload = false;
        this.guestGrenade = false;
        this.netSend({
            m: 'input',
            mx: me.moveIn.mx,
            jet: me.moveIn.jet,
            drop: me.moveIn.dropDown,
            ax: me.aimIn.ax,
            ay: me.aimIn.ay,
            aim: me.aimIn.aiming,
            fire: this.guestFireTouch || this.guestFireKeys,
            rl: doReload,
            gr: doGrenade,
        });
    }

    /** HOST: apply latest guest input to its P2 fighter before simulation. */
    private applyRemoteInput() {
        const r = this.remoteInput;
        const p2 = this.humans[1];
        if (!r || !p2) return;
        p2.moveIn.mx = r.mx;
        p2.moveIn.jet = r.jet;
        p2.moveIn.dropDown = r.drop;
        p2.aimIn.aiming = r.aim;
        if (r.aim) { p2.aimIn.ax = r.ax; p2.aimIn.ay = r.ay; }
        if (r.fire) p2.tryFire();
        if (r.rl) p2.startReload();
        if (r.gr) p2.tryThrowGrenade();
    }

    private tick(dt: number) {
        if (this.matchOver) return;
        const rdt = Math.min(dt, 1 / 30);
        this.hitStopT = Math.max(0, this.hitStopT - rdt);
        const sdt = rdt * (this.hitStopT > 0 ? 0.12 : 1);

        // juice runs in real time — shake keeps decaying during hit-stop
        const [ox, oy] = this.shake.offset(rdt);
        this.node.setPosition(this.shakeBaseX + ox, this.shakeBaseY + oy, 0);
        this.fx.tick(rdt);
        this.drawAimTicks();

        // ---- GUEST: mirror-only mode -------------------------------------
        if (this.netRole === 'guest') {
            // Sample the local sticks/keyboard into our fighter's intent
            // FIRST — sendLocalInput() relays exactly what they hold.
            if (this.touchApply) this.touchApply(this.humans[0], null);
            if (this.keyboardApply && this.humans[0]) {
                this.keyboardApply(this.humans[0]);
            }
            this.inputT += rdt;
            if (this.inputT >= 1 / 30) {
                this.inputT = 0;
                this.sendLocalInput();
            }
            return;
        }

        if (this.frozen) return; // countdown hold — the world waits for GO

        // ---- HOST / OFFLINE simulation ------------------------------------
        this.matchClock += sdt;
        this.trackDamage();
        this.timeLeft -= sdt;
        if (this.timeLeft <= 0) {
            this.endMatch(this.leaderId());
            return;
        }

        if (this.touchApply) this.touchApply(this.humans[0], this.humans[1] ?? null);
        if (this.keyboardApply && this.humans[0]) this.keyboardApply(this.humans[0]);
        if (this.netRole === 'host') this.applyRemoteInput();

        for (const b of this.bots) {
            b.tick(sdt, this.fighters.filter(f => f !== b.me));
        }

        for (const f of this.fighters) f.tick(sdt);

        // tick explosive barrels
        for (const b of this.barrels) b.tick(sdt);

        // tick grenades
        for (const gr of this.grenades) {
            gr.tick(sdt, this.world, g => this.onDetonateGrenade(g));
        }

        // sync projectile hitboxes
        const host = this.projectiles.host;
        for (const fr of host.fighters) {
            fr.x = fr.ref.x; fr.y = fr.ref.y;
        }

        this.projectiles.tick(sdt);
        this.projectiles.tickFx(rdt);

        // pickups: animate, respawn, collect
        for (const n of this.itemsRoot.children.slice()) {
            const it = n.getComponent(PickupItem);
            if (!it) continue; // ghost projectile nodes live here too
            it.tick(sdt);
            if (!it.taken) {
                for (const f of this.fighters) it.tryTake(f);
            }
        }
        for (const n of this.crateRoot.children) {
            const c = n.getComponent(WeaponCrate);
            if (!c) continue;
            c.tick(sdt);
            if (!c.taken) {
                for (const f of this.fighters) c.tryTake(f);
            }
        }

        for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
            const r = this.respawnQueue[i];
            r.t -= sdt;
            if (r.t <= 0) {
                const kind = r.f.teamLabel === 'P1' ? 'p' : r.f.teamLabel === 'P2' ? 'q' : 'e';
                const sp = this.safeSpawn(kind as 'p' | 'q' | 'e');
                r.f.spawnAt(sp[0], sp[1]);
                this.respawnQueue.splice(i, 1);
            }
        }

        if (this.netRole === 'host') {
            this.snapT += rdt;
            if (this.snapT >= 1 / 15) {
                this.snapT = 0;
                if (this.netSend) this.netSend(this.buildSnapshot());
            }
        }
    }

    leaderId(): number | null {
        let best: number | null = null;
        let bestScore = 0;
        for (const f of this.fighters) {
            const s = this.scores.get(f.id) ?? 0;
            if (s > bestScore) { bestScore = s; best = f.id; }
        }
        return best;
    }

    scoreOf(id: number): number { return this.scores.get(id) ?? 0; }

    timeStr(): string { return fmtTime(Math.max(0, this.timeLeft)); }

    /** Small screen kick whenever the LOCAL fighter takes damage. */
    private trackDamage() {
        for (const f of this.fighters) {
            const prev = this.prevHp.get(f.id);
            if (prev !== undefined && f.hp < prev && f.id === this.myFighterId) {
                this.shake.add(0.16);
            }
            this.prevHp.set(f.id, f.hp);
        }
    }

    /** Grenade splash: the big one — flash, rings, sparks, debris, smoke. */
    private onSplashFx(x: number, y: number) {
        this.fx.explosion(x, y, 130);
        this.shake.add(0.45);
        this.hitStopT = Math.max(this.hitStopT, 0.05);
        Sfx.playExplosion();
    }

    /** Aim guidance: red laser sight for sniper, tactical dots for other weapons. */
    private drawAimTicks() {
        const g = this.aimG;
        if (!g) return;
        const me = this.fighters.find(f => f.id === this.myFighterId);
        const show = !!me && me.alive && me.aimIn.aiming;
        if (!show) {
            if (this.aimWasOn) { g.clear(); this.aimWasOn = false; }
            return;
        }
        this.aimWasOn = true;
        g.clear();
        const ang = Math.atan2(me!.aimIn.ay, me!.aimIn.ax);

        // Tactical Sniper Laser Sight: long red laser tracer to obstacle/enemy
        if (me!.weapon.id === WeaponId.SNIPER) {
            const maxRange = 1500;
            const hit = this.world.raycast(me!.x, me!.y + me!.h * 0.06, Math.cos(ang) * maxRange, Math.sin(ang) * maxRange);
            const lx = hit.hit ? hit.x : me!.x + Math.cos(ang) * maxRange;
            const ly = hit.hit ? hit.y : me!.y + me!.h * 0.06 + Math.sin(ang) * maxRange;

            // Outer laser beam glow
            g.strokeColor = new Color(255, 30, 30, 110);
            g.lineWidth = 4.5;
            g.moveTo(me!.x + Math.cos(ang) * 22, me!.y + me!.h * 0.06 + Math.sin(ang) * 22);
            g.lineTo(lx, ly);
            g.stroke();

            // Core sharp laser line
            g.strokeColor = new Color(255, 230, 230, 240);
            g.lineWidth = 1.6;
            g.moveTo(me!.x + Math.cos(ang) * 22, me!.y + me!.h * 0.06 + Math.sin(ang) * 22);
            g.lineTo(lx, ly);
            g.stroke();

            // Laser contact point red dot
            g.fillColor = new Color(255, 30, 30, 220);
            g.circle(lx, ly, 4.5);
            g.fill();
            g.fillColor = new Color(255, 255, 255, 250);
            g.circle(lx, ly, 2);
            g.fill();
            return;
        }

        const col = me!.char.accent;
        for (let i = 0; i < 3; i++) {
            const d = 46 + i * 15;
            const px = me!.x + Math.cos(ang) * d;
            const py = me!.y + me!.h * 0.06 + Math.sin(ang) * d;
            g.fillColor = new Color(col.r, col.g, col.b, 210 - i * 65);
            g.circle(px, py, 3.6 - i * 0.8);
            g.fill();
        }
    }
}
