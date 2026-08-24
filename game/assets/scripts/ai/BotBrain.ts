/**
 * BotBrain.ts
 * ---------------------------------------------------------------------------
 * Per-bot decision layer implemented as a four-state FSM:
 *
 *   PATROL — wander between walls/ledges, occasional idle hops
 *   CHASE  — run/jet toward the nearest visible foe
 *   ATTACK — strafe around ideal engagement range (~300 px), lead the aim,
 *            fire, melee when very close
 *   RETREAT— flee and return fire when HP is low
 *
 * Target acquisition uses TileWorld.hasLineOfSight so bots can't shoot
 * through walls. Movement output lands in Fighter.moveIn/aimIn like any
 * other controller.
 */
import { CFG } from '../core/GameConfig';
import { clamp, pick, rand } from '../core/Utils';
import { Fighter } from '../gameplay/Fighter';
import { TileWorld } from '../world/TileWorld';

type BotState = 'PATROL' | 'CHASE' | 'ATTACK' | 'RETREAT';

/**
 * Simple but competent bot: patrols, chases on sight, strafes while shooting,
 * uses jetpack to gain high ground or escape, retreats when low HP.
 */
export class BotBrain {
    state: BotState = 'PATROL';
    private stateT = 0;
    private wanderDir = Math.random() < 0.5 ? -1 : 1;
    private jumpT = 0;
    private strafeDir = 1;
    private strafeT = 0;

    constructor(public me: Fighter, private world: TileWorld) {}

    tick(dt: number, foes: Fighter[]) {
        if (!this.me.alive) return;
        this.stateT += dt;
        this.jumpT -= dt;

        const foe = this.nearestVisibleFoe(foes);
        const lowHp = this.me.hp < 30;

        // --- state transitions ---
        if (lowHp && foe && this.state !== 'RETREAT') {
            this.setState('RETREAT');
        } else if (foe) {
            const dist = Math.hypot(foe.x - this.me.x, foe.y - this.me.y);
            if (dist < 520 && this.state !== 'ATTACK' && !lowHp) this.setState('ATTACK');
            else if (this.state === 'PATROL') this.setState('CHASE');
        } else if ((this.state === 'ATTACK' || this.state === 'CHASE') && this.stateT > 1.2) {
            this.setState('PATROL');
        } else if (this.state === 'RETREAT' && (!foe || this.stateT > 3)) {
            this.setState(this.me.hp >= CFG.MAX_HP * 0.6 ? 'PATROL' : 'RETREAT');
        }

        // --- behaviors ---
        const m = this.me.moveIn;
        m.mx = 0; m.jet = false; m.dropDown = false;

        switch (this.state) {
            case 'PATROL': {
                m.mx = this.wanderDir;
                if (this.jumpT <= 0 && this.me.grounded && Math.random() < 0.02) {
                    m.jet = true; this.jumpT = rand(0.4, 0.9);
                }
                // turn at walls / ledges
                const aheadX = this.me.x + this.wanderDir * (CFG.PLAYER_W / 2 + 12);
                if (this.world.solidAtWorld(aheadX, this.me.y) ||
                    (!this.world.solidAtWorld(aheadX, this.me.y - CFG.TILE) && this.me.grounded)) {
                    this.wanderDir *= -1;
                }
                break;
            }
            case 'CHASE': {
                if (foe) {
                    const dx = foe.x - this.me.x;
                    m.mx = Math.sign(dx);
                    if (foe.y > this.me.y + CFG.TILE * 0.8 && this.me.grounded && this.fuelOk()) m.jet = true;
                }
                break;
            }
            case 'ATTACK': {
                if (!foe) { this.setState('PATROL'); break; }
                const dx = foe.x - this.me.x;
                const dy = foe.y - this.me.y;
                const dist = Math.hypot(dx, dy);
                const ideal = 300;
                this.strafeT -= dt;
                if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = rand(0.5, 1.4); }
                m.mx = Math.abs(dist - ideal) < 80 ? this.strafeDir * 0.7 : Math.sign(dx);
                if (dy > CFG.TILE && this.me.grounded && this.fuelOk()) m.jet = true;
                if (Math.abs(dx) < CFG.MELEE_RANGE && dist < CFG.MELEE_RANGE + 30) {
                    this.me.tryMelee(foe);
                }
                // aim with slight lead & wobble
                const lead = clamp(Math.atan2(dy + 10, dx), -Math.PI, Math.PI);
                const wob = rand(-0.06, 0.06);
                this.me.aimIn.ax = Math.cos(lead + wob);
                this.me.aimIn.ay = Math.sin(lead + wob);
                this.me.aimIn.aiming = true;
                if (dist < 700) this.me.tryFire();
                break;
            }
            case 'RETREAT': {
                if (foe) {
                    const dx = this.me.x - foe.x;
                    m.mx = Math.sign(dx) || 1;
                    if (foe.y > this.me.y && this.me.grounded && this.fuelOk()) m.jet = true;
                    // still fight back while fleeing
                    const ang = Math.atan2(foe.y - this.me.y, foe.x - this.me.x);
                    this.me.aimIn.ax = Math.cos(ang);
                    this.me.aimIn.ay = Math.sin(ang);
                    this.me.aimIn.aiming = true;
                    if (Math.random() < 0.35) this.me.tryFire();
                } else {
                    m.mx = this.wanderDir;
                }
                break;
            }
        }
    }

    private setState(s: BotState) {
        this.state = s;
        this.stateT = 0;
        if (s === 'PATROL') {
            this.wanderDir = pick([-1, 1]);
            this.me.aimIn.aiming = false;
        }
    }

    private fuelOk(): boolean { return this.me.fuel > 25; }

    private nearestVisibleFoe(foes: Fighter[]): Fighter | null {
        let best: Fighter | null = null;
        let bestD = Infinity;
        for (const f of foes) {
            if (!f.alive || f.invuln > 0.01) continue;
            const d = Math.hypot(f.x - this.me.x, f.y - this.me.y);
            if (d > 900 || d >= bestD) continue;
            if (this.world.hasLineOfSight(this.me.x, this.me.y, f.x, f.y)) {
                best = f; bestD = d;
            }
        }
        return best;
    }
}
