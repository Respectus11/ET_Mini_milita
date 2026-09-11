/**
 * BotBrain.ts
 * ---------------------------------------------------------------------------
 * Advanced per-bot AI implemented as a priority-ranked FSM with 5 states:
 *
 *   PATROL  — wander the map, pick up nearby items passively
 *   LOOT    — sprint to the nearest health/shield/weapon when low HP or ammo
 *   CHASE   — pursue the nearest foe who breaks line-of-sight
 *   ATTACK  — strafe at ideal range, lead-aim, shoot, melee when close
 *   RETREAT — flee when critically low on HP while still returning fire
 *
 * Difficulty levels scale aim accuracy, reaction time, grenade use, and
 * jetpack aggression from Easy (forgiving) to Hard (lethal predictive aim).
 *
 * Target acquisition requires TileWorld.hasLineOfSight so bots never shoot
 * through walls. All output lands in Fighter.moveIn/aimIn like any controller.
 */
import { CFG } from '../core/GameConfig';
import { clamp, pick, rand } from '../core/Utils';
import { Fighter } from '../gameplay/Fighter';
import { TileWorld } from '../world/TileWorld';
import { PickupItem } from '../gameplay/PickupItem';
import { WeaponCrate } from '../gameplay/WeaponCrate';

/** 0=Easy 1=Normal 2=Hard */
export type BotDifficulty = 0 | 1 | 2;

type BotState = 'PATROL' | 'LOOT' | 'CHASE' | 'ATTACK' | 'RETREAT';

interface LootTarget { x: number; y: number; }

/** Per-difficulty tuning table. */
const DIFF_PARAMS = [
    // Easy
    { aimWobble: 0.32, reactTime: 0.7,  fireProbability: 0.55, grenadeFreq: 0.08,
      engageRange: 380, jetAggr: 0.2, dodgeChance: 0.01 },
    // Normal
    { aimWobble: 0.10, reactTime: 0.30, fireProbability: 0.85, grenadeFreq: 0.30,
      engageRange: 550, jetAggr: 0.5, dodgeChance: 0.04 },
    // Hard
    { aimWobble: 0.025, reactTime: 0.08, fireProbability: 1.0, grenadeFreq: 0.65,
      engageRange: 780, jetAggr: 0.9, dodgeChance: 0.08 },
] as const;

export class BotBrain {
    state: BotState = 'PATROL';
    difficulty: BotDifficulty;

    private stateT       = 0;
    private wanderDir    = Math.random() < 0.5 ? -1 : 1;
    private jumpT        = 0;
    private strafeDir    = 1;
    private strafeT      = 0;
    private grenadeTimer = rand(3, 7);
    private reactTimer   = 0;   // delay before bot "notices" the foe
    private targetFoe: Fighter | null = null;

    // loot seeking
    private lootTarget: LootTarget | null = null;

    // jetpack aggression
    private highGroundT  = 0;   // how long we've been at same Y as foe
    private dodgeJetT    = 0;   // timer for periodic dodge jet bursts

    constructor(
        public me: Fighter,
        private world: TileWorld,
        difficulty: BotDifficulty = 1,
        // Optional pickup/crate references (set by MatchManager)
        public pickups: PickupItem[] = [],
        public crates: WeaponCrate[] = [],
    ) {
        this.difficulty = difficulty;
        // stagger initial timers so bots aren't all synchronized
        this.grenadeTimer = rand(2, 6);
        this.reactTimer   = rand(0.1, DIFF_PARAMS[difficulty].reactTime);
    }

    /** Called every tick by MatchManager. foes = all fighters that are enemies of this bot. */
    tick(dt: number, foes: Fighter[]) {
        if (!this.me.alive) return;
        this.stateT      += dt;
        this.jumpT       -= dt;
        this.grenadeTimer -= dt;
        this.dodgeJetT   -= dt;
        this.highGroundT += dt;

        const p = DIFF_PARAMS[this.difficulty];

        // --- target acquisition with reaction delay ---
        const rawFoe = this.nearestVisibleFoe(foes);
        if (rawFoe) {
            this.reactTimer -= dt;
            if (this.reactTimer <= 0) {
                this.targetFoe = rawFoe;
            }
        } else {
            this.targetFoe = null;
            this.reactTimer = p.reactTime;
        }
        const foe = this.targetFoe;
        const lowHp = this.me.hp < CFG.MAX_HP * 0.28;
        const ammoLow = this.me.ammo <= Math.max(1, (this.me.weapon.magSize || 10) * 0.2);

        // --- loot priority scan ---
        const loot = this.findBestLoot(lowHp, ammoLow);

        // --- state transitions (priority-ranked) ---
        if (lowHp) {
            if (this.state !== 'RETREAT' && foe) this.setState('RETREAT');
            else if (!foe && loot) this.setState('LOOT');
            else if (!foe && this.state === 'ATTACK') this.setState('PATROL');
        } else if (loot && (ammoLow || (this.me.hp < CFG.MAX_HP * 0.55 && !foe))) {
            if (this.state !== 'LOOT') this.setState('LOOT');
        } else if (foe) {
            const dist = Math.hypot(foe.x - this.me.x, foe.y - this.me.y);
            if (dist < p.engageRange && !lowHp) {
                if (this.state !== 'ATTACK') this.setState('ATTACK');
            } else if (this.state === 'PATROL' || this.state === 'LOOT') {
                this.setState('CHASE');
            }
        } else if ((this.state === 'ATTACK' || this.state === 'CHASE') && this.stateT > 1.5) {
            this.setState('PATROL');
        } else if (this.state === 'RETREAT' && !foe && this.stateT > 2) {
            this.setState(this.me.hp >= CFG.MAX_HP * 0.55 ? 'PATROL' : 'RETREAT');
        }

        // --- clear intent ---
        const m = this.me.moveIn;
        m.mx = 0; m.jet = false; m.dropDown = false;

        switch (this.state) {

            // ---- PATROL: wander + opportunistic loot pickup -----------------
            case 'PATROL': {
                m.mx = this.wanderDir;
                if (this.jumpT <= 0 && this.me.grounded && Math.random() < 0.015) {
                    m.jet = true; this.jumpT = rand(0.3, 0.8);
                }
                // turn at walls and ledge drops
                const aheadX = this.me.x + this.wanderDir * (CFG.PLAYER_W / 2 + 14);
                const aheadGround = this.me.y - CFG.TILE * 0.9;
                if (this.world.solidAtWorld(aheadX, this.me.y) ||
                    (!this.world.solidAtWorld(aheadX, aheadGround) && this.me.grounded)) {
                    this.wanderDir *= -1;
                }
                break;
            }

            // ---- LOOT: rush toward nearest pickup / crate -------------------
            case 'LOOT': {
                if (!loot) { this.setState('PATROL'); break; }
                this.lootTarget = loot;
                const dx = loot.x - this.me.x;
                const dy = loot.y - this.me.y;
                m.mx = Math.sign(dx);
                // jetpack up to reach elevated loot
                if (dy > CFG.TILE * 0.6 && this.me.fuel > 20) m.jet = true;
                // arrived — MatchManager handles actual pickup, just get close
                if (Math.hypot(dx, dy) < CFG.BOT_PICKUP_RANGE) {
                    this.lootTarget = null;
                    this.setState('PATROL');
                }
                break;
            }

            // ---- CHASE: pursue foe that lost or regained line-of-sight -----
            case 'CHASE': {
                if (!foe) { this.setState('PATROL'); break; }
                const dx = foe.x - this.me.x;
                const dy = foe.y - this.me.y;
                m.mx = Math.sign(dx);
                // use jet to reach foe on upper ledges
                if (dy > CFG.TILE * 0.7 && this.me.grounded && this.fuelOk()) m.jet = true;
                // switch to ATTACK once close enough
                if (Math.hypot(dx, dy) < p.engageRange) this.setState('ATTACK');
                break;
            }

            // ---- ATTACK: strafe, aim, shoot, throw grenades -----------------
            case 'ATTACK': {
                if (!foe) { this.setState('PATROL'); break; }
                const dx   = foe.x - this.me.x;
                const dy   = foe.y - this.me.y;
                const dist = Math.hypot(dx, dy);
                const ideal = this.me.weapon.id === 'sniper' ? 600 :
                              this.me.weapon.id === 'shotgun' ? 150 :
                              this.me.weapon.id === 'flamethrower' ? 120 : 280;

                // strafe oscillation
                this.strafeT -= dt;
                if (this.strafeT <= 0) {
                    this.strafeDir *= -1;
                    this.strafeT = rand(0.5, 1.6);
                }
                m.mx = Math.abs(dist - ideal) < 80 ? this.strafeDir * 0.85 : Math.sign(dx);

                // ---- jetpack aggression: gain high ground over time ----
                if (Math.abs(dy) < CFG.TILE * 0.4) {
                    // same vertical level: try to gain height after 1.5s
                    if (this.highGroundT > (1.5 - p.jetAggr) && this.fuelOk()) {
                        m.jet = true;
                        this.highGroundT = 0;
                    }
                } else {
                    this.highGroundT = 0;
                }
                // chase foe upward
                if (dy > CFG.TILE * 0.5 && this.fuelOk()) m.jet = true;
                // periodic dodge jets
                if (this.dodgeJetT <= 0 && dist < 420 && this.fuelOk() &&
                    Math.random() < p.dodgeChance * 10) {
                    m.jet = true;
                    this.dodgeJetT = rand(0.9 - p.jetAggr * 0.5, 1.8);
                }

                // melee if very close
                if (dist < CFG.MELEE_RANGE + 40) {
                    this.me.tryMelee(foe);
                }

                // grenade: throw when foe is at good arc distance or in a corner
                if (this.grenadeTimer <= 0 && this.me.grenades > 0 &&
                    dist > 140 && dist < 520 && Math.random() < p.grenadeFreq) {
                    const cornerBonus = this.foeNearWall(foe) ? 1.8 : 1.0;
                    if (Math.random() < p.grenadeFreq * cornerBonus) {
                        this.me.aimIn.ax = dx / dist;
                        this.me.aimIn.ay = Math.max(0.28, dy / dist + 0.38 + rand(0, 0.2));
                        this.me.tryThrowGrenade();
                        this.grenadeTimer = rand(4 - p.grenadeFreq * 2, 9);
                    }
                }

                // ---- aim with predictive lead (Hard) or static aim (Easy) ---
                let aimX: number, aimY: number;
                if (this.difficulty === 2) {
                    // predictive aim: estimate where foe will be when bullet arrives
                    const bulletSpeed = this.me.weapon.speed || 1200;
                    const travelT = clamp(dist / bulletSpeed, 0, 0.4);
                    const predX   = foe.x + (foe as any).vx * travelT;
                    const predY   = foe.y + (foe as any).vy * travelT + 18; // headshot bias
                    const pdx = predX - this.me.x, pdy = predY - this.me.y;
                    const pl = Math.hypot(pdx, pdy) || 1;
                    aimX = pdx / pl; aimY = pdy / pl;
                } else {
                    // normal/easy: aim at current position with head bias
                    const headDy = dy + 16;
                    const hl = Math.hypot(dx, headDy) || 1;
                    aimX = dx / hl; aimY = headDy / hl;
                }
                // apply aim wobble scaled by difficulty
                const wob = rand(-p.aimWobble, p.aimWobble);
                this.me.aimIn.ax = Math.cos(Math.atan2(aimY, aimX) + wob);
                this.me.aimIn.ay = Math.sin(Math.atan2(aimY, aimX) + wob);
                this.me.aimIn.aiming = true;
                if (dist < p.engageRange && Math.random() < p.fireProbability) {
                    this.me.tryFire();
                }
                break;
            }

            // ---- RETREAT: flee + fight back ---------------------------------
            case 'RETREAT': {
                if (foe) {
                    const dx = this.me.x - foe.x;
                    m.mx = Math.sign(dx) || 1;
                    // always jet upward while retreating
                    if (this.me.grounded && this.fuelOk()) m.jet = true;
                    // still fight back: aim at foe and return fire
                    const dist = Math.hypot(foe.x - this.me.x, foe.y - this.me.y);
                    const ang  = Math.atan2(foe.y - this.me.y, foe.x - this.me.x);
                    this.me.aimIn.ax = Math.cos(ang);
                    this.me.aimIn.ay = Math.sin(ang);
                    this.me.aimIn.aiming = true;
                    if (Math.random() < 0.5 * p.fireProbability) this.me.tryFire();
                    // defensive grenade drop behind to block pursuit
                    if (this.grenadeTimer <= 0 && this.me.grenades > 0 &&
                        dist < 400 && Math.random() < p.grenadeFreq * 0.5) {
                        this.me.tryThrowGrenade();
                        this.grenadeTimer = rand(5, 10);
                    }
                } else {
                    m.mx = this.wanderDir;
                }
                break;
            }
        }
    }

    private setState(s: BotState) {
        this.state  = s;
        this.stateT = 0;
        this.highGroundT = 0;
        if (s === 'PATROL') {
            this.wanderDir = pick([-1, 1]);
            this.me.aimIn.aiming = false;
        }
        if (s === 'ATTACK') {
            this.strafeDir = pick([-1, 1]);
            this.strafeT   = rand(0.4, 1.2);
        }
    }

    private fuelOk(): boolean { return this.me.fuel > 22; }

    /** True when foe is within 2 tiles of a solid wall (good grenade corner). */
    private foeNearWall(foe: Fighter): boolean {
        const rightSolid = this.world.solidAtWorld(foe.x + CFG.TILE * 1.5, foe.y);
        const leftSolid  = this.world.solidAtWorld(foe.x - CFG.TILE * 1.5, foe.y);
        return rightSolid || leftSolid;
    }

    private nearestVisibleFoe(foes: Fighter[]): Fighter | null {
        const p = DIFF_PARAMS[this.difficulty];
        let best: Fighter | null = null;
        let bestD = Infinity;
        for (const f of foes) {
            if (!f.alive || f.invuln > 0.01) continue;
            const d = Math.hypot(f.x - this.me.x, f.y - this.me.y);
            if (d > p.engageRange * 1.4 || d >= bestD) continue;
            if (this.world.hasLineOfSight(this.me.x, this.me.y, f.x, f.y)) {
                best = f; bestD = d;
            }
        }
        return best;
    }

    /**
     * Finds the most urgent nearby loot: HP first, then shield, then weapon crate.
     * Returns world position of the nearest qualifying item, or null.
     */
    private findBestLoot(lowHp: boolean, ammoLow: boolean): LootTarget | null {
        const range = CFG.BOT_PICKUP_RANGE * 5; // search radius
        let best: LootTarget | null = null;
        let bestScore = -1;

        for (const item of this.pickups) {
            if (item.taken) continue;
            const d = Math.hypot(item.x - this.me.x, item.y - this.me.y);
            if (d > range) continue;
            let score = 0;
            if (item.kind === 'injera' && lowHp)  score = 3 - d / 1000;
            if (item.kind === 'mesob'  && this.me.hp < CFG.MAX_HP * 0.7) score = 2 - d / 1000;
            if (item.kind === 'buna')              score = 0.5 - d / 1000;
            if (score > bestScore) { bestScore = score; best = { x: item.x, y: item.y + 26 }; }
        }

        if (ammoLow) {
            for (const crate of this.crates) {
                if (crate.taken) continue;
                const d = Math.hypot(crate.x - this.me.x, crate.y - this.me.y);
                if (d > range) continue;
                const score = 1.8 - d / 1000;
                if (score > bestScore) { bestScore = score; best = { x: crate.x, y: crate.y + 26 }; }
            }
        }

        return best;
    }
}
