/**
 * Audio.ts
 * ---------------------------------------------------------------------------
 * Zero-asset procedural sound effects engine built with the Web Audio API.
 * Synthesizes retro arcade audio for weapons, explosions, jetpack thrust,
 * pickups, hits, frags, UI clicks, and victory fanfares without requiring
 * external sound files.
 *
 * Automatically resumes AudioContext on the first user interaction (touch,
 * mouse, or keyboard) to satisfy mobile browser autoplay policies.
 * Volume is scaled by Settings.getSettings().sfx (0..1).
 */
import { getSettings } from './Settings';
import { WeaponId } from '../data/Weapons';
import { bus, Evt } from './EventBus';

type AudioCtx = any;

class SoundEngine {
    private ctx: AudioCtx | null = null;
    private masterGain: any = null;
    private unlocked = false;
    private lastJetT = 0;

    constructor() {
        this.initUnlockHooks();
        this.wireBusEvents();
    }

    private getContext(): AudioCtx | null {
        if (this.ctx) return this.ctx;
        try {
            const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.updateMasterVolume();
            return this.ctx;
        } catch {
            return null;
        }
    }

    private updateMasterVolume() {
        if (!this.masterGain || !this.ctx) return;
        const vol = Math.max(0, Math.min(1, getSettings().sfx));
        this.masterGain.gain.setValueAtTime(vol * 0.45, this.ctx.currentTime);
    }

    /** Unlocks the AudioContext on first user gesture. */
    private initUnlockHooks() {
        const unlock = () => {
            if (this.unlocked) return;
            const c = this.getContext();
            if (c) {
                if (c.state === 'suspended') {
                    c.resume().catch(() => {});
                }
                this.unlocked = true;
            }
            try {
                const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
                if (g && g.removeEventListener) {
                    g.removeEventListener('touchstart', unlock);
                    g.removeEventListener('touchend', unlock);
                    g.removeEventListener('mousedown', unlock);
                    g.removeEventListener('keydown', unlock);
                }
            } catch { /* ignore */ }
        };

        try {
            const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
            if (g && g.addEventListener) {
                g.addEventListener('touchstart', unlock, { passive: true });
                g.addEventListener('touchend', unlock, { passive: true });
                g.addEventListener('mousedown', unlock, { passive: true });
                g.addEventListener('keydown', unlock, { passive: true });
            }
        } catch { /* ignore */ }
    }

    private wireBusEvents() {
        bus.on(Evt.PICKUP, (_fighterId: number, kind: string) => {
            this.playPickup(kind);
        });
        bus.on(Evt.FRAG, () => {
            this.playFrag();
        });
        bus.on(Evt.WEAPON_CHANGED, () => {
            this.playCrate();
        });
    }

    private canPlay(): boolean {
        const s = getSettings();
        if (s.sfx <= 0.001) return false;
        const c = this.getContext();
        if (!c) return false;
        if (c.state === 'suspended') {
            c.resume().catch(() => {});
        }
        this.updateMasterVolume();
        return true;
    }

    // =========================================================================
    // Sound synthesis routines
    // =========================================================================

    /** Weapon firing SFX tailored to each weapon's personality. */
    playShoot(weaponId: WeaponId) {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        switch (weaponId) {
            case WeaponId.RIFLE: {
                // Crisp punch + square wave pitch drop + transient noise
                this.noiseBurst(now, 0.06, 0.7, 3000);
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(380, now);
                osc.frequency.exponentialRampToValueAtTime(70, now + 0.1);
                gain.gain.setValueAtTime(0.6, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            }
            case WeaponId.SHOTGUN: {
                // Heavy sub-bass thud + wide noise blast
                this.noiseBurst(now, 0.16, 0.95, 1800);
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
                gain.gain.setValueAtTime(0.9, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.18);
                break;
            }
            case WeaponId.SNIPER: {
                // High-velocity whip-crack + resonant tail
                this.noiseBurst(now, 0.05, 0.9, 6000);
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(750, now);
                osc.frequency.exponentialRampToValueAtTime(90, now + 0.28);
                gain.gain.setValueAtTime(0.7, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.28);
                break;
            }
            case WeaponId.LAUNCHER: {
                // Deep mechanical "thump" + whoosh
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(140, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.22);
                gain.gain.setValueAtTime(0.9, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.22);
                this.noiseBurst(now + 0.04, 0.14, 0.45, 800);
                break;
            }
            case WeaponId.SMG: {
                // Rapid snappy high-pitched crackle
                this.noiseBurst(now, 0.04, 0.55, 3400);
                this.tone(480, 110, now, 0.06, 0.45, 'triangle');
                break;
            }
            case WeaponId.MAGNUM: {
                // Massive hand-cannon thud & crack
                this.noiseBurst(now, 0.09, 0.85, 2400);
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(360, now);
                osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);
                gain.gain.setValueAtTime(0.85, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.22);
                break;
            }
            case WeaponId.PLASMA: {
                // High-tech pulsed energy beam chirp
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1100, now);
                osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
                gain.gain.setValueAtTime(0.55, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.08);
                this.noiseBurst(now, 0.04, 0.25, 5000);
                break;
            }
        }
    }

    /** Grenade pin pulled click. */
    playGrenadePin() {
        if (!this.canPlay()) return;
        const now = this.ctx.currentTime;
        this.tone(1800, 2400, now, 0.05, 0.45, 'triangle');
        this.tone(900, 1200, now + 0.04, 0.08, 0.35, 'square');
    }

    /** Grenade bouncing on hard terrain. */
    playGrenadeBounce() {
        if (!this.canPlay()) return;
        const now = this.ctx.currentTime;
        this.tone(260, 80, now, 0.06, 0.5, 'triangle');
        this.noiseBurst(now, 0.03, 0.35, 1500);
    }

    /** Grenade fuse blinking warning tick/beep. */
    playGrenadeFuse(highPitch = false) {
        if (!this.canPlay()) return;
        const now = this.ctx.currentTime;
        const freq = highPitch ? 2200 : 1400;
        this.tone(freq, freq, now, 0.025, 0.4, 'sine');
    }

    /** Crisp golden headshot critical ding! */
    playHeadshot() {
        if (!this.canPlay()) return;
        const now = this.ctx.currentTime;
        // Crisp dual chime with shimmering metallic overtone
        this.tone(1318.51, 1318.51, now, 0.25, 0.7, 'sine'); // E6
        this.tone(1975.53, 1975.53, now + 0.02, 0.35, 0.6, 'triangle'); // B6
        this.noiseBurst(now, 0.03, 0.3, 7000);
    }

    /** Explosive barrel heavy chain detonation. */
    playBarrelExplode() {
        if (!this.canPlay()) return;
        const now = this.ctx.currentTime;
        // Heavy bass double-kick
        this.tone(190, 25, now, 0.55, 1.0, 'sawtooth');
        this.tone(110, 20, now + 0.06, 0.6, 0.9, 'sine');
        this.noiseBurst(now, 0.55, 0.95, 850);
        this.noiseBurst(now + 0.08, 0.35, 0.6, 1400);
    }

    /** Epic fanfare stinger for killstreaks (Double Kill, Rampage, etc). */
    playKillstreak(streak: number) {
        if (!this.canPlay()) return;
        const now = this.ctx.currentTime;
        if (streak <= 2) {
            // Double Kill: rapid 2-step brass punch
            this.tone(440, 440, now, 0.12, 0.65, 'sawtooth');
            this.tone(554.37, 554.37, now + 0.1, 0.25, 0.7, 'sawtooth');
        } else if (streak === 3) {
            // Triple Kill: triumphant triad
            this.tone(440, 440, now, 0.1, 0.6, 'sawtooth');
            this.tone(554.37, 554.37, now + 0.08, 0.1, 0.6, 'sawtooth');
            this.tone(659.25, 659.25, now + 0.16, 0.35, 0.75, 'sawtooth');
        } else if (streak < 7) {
            // Rampage: 4-note ascending heroic arpeggio
            [392.00, 523.25, 659.25, 783.99].forEach((f, idx) => {
                this.tone(f, f, now + idx * 0.08, idx === 3 ? 0.4 : 0.12, 0.7, 'sawtooth');
            });
        } else {
            // Unstoppable: thunderous war horn fanfare
            [523.25, 659.25, 783.99, 1046.50].forEach((f, idx) => {
                this.tone(f, f, now + idx * 0.09, idx === 3 ? 0.6 : 0.15, 0.8, 'sawtooth');
            });
            this.noiseBurst(now + 0.27, 0.3, 0.5, 2000);
        }
    }

    /** Explosion boom: low-passed noise rumble + sub kick. */
    playExplosion() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Sub kick
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.45);
        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.45);

        // Low rumble noise
        this.noiseBurst(now, 0.5, 0.9, 700);
    }

    /** Melee swipe / bash sound. */
    playMelee() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
        gain.gain.setValueAtTime(0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.12);
        this.noiseBurst(now + 0.02, 0.07, 0.4, 1200);
    }

    /** Jetpack thruster hiss (throttled). */
    playJetpack() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        if (now - this.lastJetT < 0.12) return;
        this.lastJetT = now;
        this.noiseBurst(now, 0.11, 0.22, 1100);
    }

    /** Flesh / armor damage impact. */
    playHit() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.09);
    }

    /** Player defeat / frag sound. */
    playFrag() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        // Two heavy punch hits
        this.tone(140, 50, now, 0.18, 0.7, 'sawtooth');
        this.tone(90, 30, now + 0.1, 0.25, 0.85, 'triangle');
        this.noiseBurst(now, 0.22, 0.5, 900);
    }

    /** Pickups: ascending musical arpeggios. */
    playPickup(kind: string) {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        if (kind === 'buna') {
            // High caffeine zip
            this.tone(523.25, 523.25, now, 0.08, 0.45, 'sine');
            this.tone(659.25, 659.25, now + 0.06, 0.08, 0.45, 'sine');
            this.tone(783.99, 783.99, now + 0.12, 0.14, 0.5, 'sine');
        } else if (kind === 'injera') {
            // Warm healing chime
            this.tone(440, 440, now, 0.1, 0.5, 'sine');
            this.tone(554.37, 554.37, now + 0.08, 0.18, 0.55, 'sine');
        } else {
            // Mesob shield bell
            this.tone(349.23, 349.23, now, 0.09, 0.5, 'triangle');
            this.tone(523.25, 523.25, now + 0.08, 0.09, 0.5, 'triangle');
            this.tone(698.46, 698.46, now + 0.16, 0.22, 0.55, 'sine');
        }
    }

    /** Weapon crate picked up: mechanical weapon click-clack. */
    playCrate() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        this.tone(700, 400, now, 0.05, 0.5, 'square');
        this.tone(900, 600, now + 0.08, 0.08, 0.6, 'square');
    }

    /** Mechanical reload sound. */
    playReload() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        this.tone(600, 300, now, 0.04, 0.4, 'triangle');
        this.tone(850, 450, now + 0.15, 0.06, 0.5, 'triangle');
    }

    /** Dry click when empty. */
    playEmpty() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        this.tone(1400, 1000, now, 0.02, 0.35, 'triangle');
    }

    /** Countdown beeps: mid beep for 3, 2, 1; high flourish for GO. */
    playCountdown(step: string) {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        if (step === 'start' || step === 'GO') {
            this.tone(659.25, 659.25, now, 0.1, 0.6, 'square');
            this.tone(880, 880, now + 0.08, 0.28, 0.7, 'square');
        } else {
            this.tone(440, 440, now, 0.09, 0.5, 'square');
        }
    }

    /** Victory fanfare on match completion. */
    playVictory() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        notes.forEach((freq, idx) => {
            const t = now + idx * 0.12;
            const dur = idx === notes.length - 1 ? 0.45 : 0.14;
            this.tone(freq, freq, t, dur, 0.6, 'sawtooth');
        });
    }

    /** Crisp button click for UI menus. */
    playClick() {
        if (!this.canPlay()) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        this.tone(800, 500, now, 0.03, 0.3, 'triangle');
    }

    // =========================================================================
    // Synthesis helpers
    // =========================================================================

    private tone(freq0: number, freq1: number, time: number, duration: number,
                 volume: number, type: OscillatorType = 'sine') {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq0, time);
        if (freq0 !== freq1) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), time + duration);
        }
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + duration);
    }

    private noiseBurst(time: number, duration: number, volume: number, cutoffHz = 2000) {
        const ctx = this.ctx;
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        if (bufferSize <= 0) return;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoffHz, time);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(time);
        noise.stop(time + duration);
    }
}

/** Global audio engine instance. */
export const Sfx = new SoundEngine();
