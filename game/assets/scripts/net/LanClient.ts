/**
 * LanClient.ts
 * ---------------------------------------------------------------------------
 * WebSocket client for LAN rooms. Every device (host and guest alike)
 * connects to the tiny relay in tools/lan-relay.mjs; the relay pairs two
 * peers per room code and forwards game messages between them.
 *
 * Uses the global WebSocket, which exists both in browsers and in Cocos
 * native builds, so the same code path works in preview and on Android.
 */
import { loadStr, saveStr } from '../core/Storage';
import { OutfitOverride } from '../data/Characters';

/** Peer-to-peer game payloads carried inside relay 'data' envelopes. */
export type PeerMsg =
    | { m: 'hello'; char: number; outfit?: OutfitOverride }
    | {
        m: 'start'; mapIndex: number; charHost: number; charGuest: number;
        outfitHost?: OutfitOverride; outfitGuest?: OutfitOverride;
      }
    | {
        m: 'input';
        mx: number; jet: boolean; drop: boolean;
        ax: number; ay: number; aim: boolean; fire: boolean;
        rl: boolean;                            // reload request
      }
    | {
        m: 'snap';
        tl: number;                          // time left (s)
        scores: number[];                    // score per fighter index
        items: number[];                     // 1 = taken, indexed like itemSpawns
        fs: NetFighterState[];               // per fighter
        ps: number[];                        // flat [x,y,x,y,...] projectiles
      }
    | { m: 'end'; winnerId: number | null };

export interface NetFighterState {
    i: number;   // fighter index in roster order
    x: number; y: number;
    fc: number;  // faceDir (-1|1)
    hp: number;
    fu: number;  // fuel
    al: number;  // alive 1/0
    am: number;  // ammo
    rl: number;  // reloading 1/0
    sp: number;  // buna speed timer remaining
    sh: number;  // shield hp remaining
    wp?: number; // weapon index into WEAPON_LIST
}

export type RelayMsg =
    | { t: 'welcome' }
    | { t: 'created'; code: string }
    | { t: 'joined'; code: string }
    | { t: 'ready'; code: string }
    | { t: 'error'; msg: string }
    | { t: 'data'; d: PeerMsg }
    | { t: 'peer_gone' }
    | { t: 'pong' };

export type NetRole = 'host' | 'guest';

const WSImpl: any = (globalThis as any).WebSocket;

export class LanClient {
    role: NetRole = 'host';
    code = '';
    connected = false;

    onReady: (() => void) | null = null;          // both peers in room
    onData: ((d: PeerMsg) => void) | null = null;
    onPeerGone: (() => void) | null = null;
    onError: ((msg: string) => void) | null = null;
    onStatus: ((s: string) => void) | null = null;

    private ws: any = null;

    get isOpen(): boolean {
        return !!this.ws && this.ws.readyState === 1;
    }

    connect(relayUrl: string): Promise<void> {
        this.disconnect();
        return new Promise((resolve, reject) => {
            if (!WSImpl) {
                reject(new Error('WebSocket unavailable'));
                return;
            }
            this.onStatus?.('connecting');
            const ws = new WSImpl(relayUrl);
            this.ws = ws;
            let settled = false;

            ws.onopen = () => {
                this.connected = true;
                settled = true;
                resolve();
            };
            ws.onerror = () => {
                if (!settled) { settled = true; reject(new Error('connect_failed')); }
                else this.onError?.('socket_error');
            };
            ws.onclose = () => {
                const wasOpen = this.connected;
                this.connected = false;
                if (!settled) { settled = true; reject(new Error('connect_failed')); }
                else if (wasOpen) this.onPeerGone?.();
            };
            ws.onmessage = (ev: any) => {
                let msg: RelayMsg;
                try { msg = JSON.parse(String(ev.data)); } catch { return; }
                this.handleRelay(msg);
            };
        });
    }

    private handleRelay(msg: RelayMsg) {
        switch (msg.t) {
            case 'created': {
                this.code = msg.code;
                const r = this.onCreateResolve;
                this.onCreateResolve = null;
                if (r) r(msg.code);
                break;
            }
            case 'joined': {
                this.code = msg.code;
                if (this.onJoinedResolve) {
                    const r = this.onJoinedResolve;
                    this.onJoinedResolve = null;
                    r(true);
                }
                break;
            }
            case 'ready':
                this.onStatus?.('ready');
                this.onReady?.();
                break;
            case 'error': {
                this.onError?.(msg.msg);
                if (this.onJoinedResolve) {
                    const r = this.onJoinedResolve;
                    this.onJoinedResolve = null;
                    r(false);
                }
                break;
            }
            case 'data':
                this.onData?.(msg.d);
                break;
            case 'peer_gone':
                this.onPeerGone?.();
                break;
        }
    }

    createRoom(): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.isOpen) { reject(new Error('not_connected')); return; }
            this.role = 'host';
            const timer = setTimeout(() => reject(new Error('create_timeout')), 4000);
            this.onCreateResolve = (code) => {
                clearTimeout(timer);
                this.onCreateResolve = null;
                resolve(code);
            };
            this.send({ t: 'create' } as any);
        });
    }
    private onCreateResolve: ((code: string) => void) | null = null;

    joinRoom(code: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.isOpen) { reject(new Error('not_connected')); return; }
            this.role = 'guest';
            let done = false;
            const timer = setTimeout(() => {
                if (!done) { done = true; this.onJoinedResolve = null; reject(new Error('join_timeout')); }
            }, 5000);
            this.onJoinedResolve = (ok) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                this.onJoinedResolve = null;
                ok ? resolve() : reject(new Error('bad_code'));
            };
            this.send({ t: 'join', code } as any);
        });
    }
    private onJoinedResolve: ((ok: boolean) => void) | null = null;

    /** Sends a raw relay-level envelope (internal + tests). */
    sendRaw(obj: unknown) {
        if (this.isOpen) this.ws.send(JSON.stringify(obj));
    }

    /** Sends a peer-to-peer game payload to the other player. */
    send(d: PeerMsg) {
        this.sendRaw({ t: 'data', d });
    }

    disconnect() {
        if (this.ws) {
            try { this.ws.onclose = null; this.ws.onerror = null; } catch { /* noop */ }
            try { this.ws.close(); } catch { /* noop */ }
            this.ws = null;
        }
        this.connected = false;
        this.code = '';
    }

    /** Default relay address persisted between sessions. */
    static savedRelay(): string {
        return loadStr('etmm_relay') || 'ws://192.168.1.10:9420';
    }

    static saveRelay(url: string) {
        saveStr('etmm_relay', url);
    }
}
