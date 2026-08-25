#!/usr/bin/env node
/**
 * ET Mini Militia — LAN Room Relay
 * ---------------------------------------------------------------------------
 * Zero-dependency WebSocket relay for local multiplayer rooms.
 * Both devices run the game as WS clients; this process pairs them into
 * 2-player rooms and forwards game messages between the two peers.
 *
 * Run:      node tools/lan-relay.mjs [port]        (default port 9420)
 * Then:     type one of the printed IPv4 addresses into the game's
 *           LAN screen on BOTH phones, e.g. ws://192.168.1.23:9420
 *
 * Wire protocol (client -> relay), JSON text frames:
 *   {t:'create'}                     -> {t:'created', code}
 *   {t:'join', code}                 -> {t:'joined'} + both get {t:'ready'}
 *                                       or {t:'error', msg:'bad_code'|'full'}
 *   {t:'data', d:{...game msg}}      -> peer receives {t:'data', d:{...}}
 *   {t:'ping'}                       -> {t:'pong'}
 * On peer disconnect the other side gets {t:'peer_gone'}.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';

const PORT = Number(process.argv[2]) || 9420;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** roomCode -> { peers:Set<Client>, created:number } */
const rooms = new Map();
const clients = new Set();

// ---------------------------------------------------------------- WS frames
function wsAccept(key) {
    return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

function encodeFrame(str) {
    const payload = Buffer.from(str, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.from([0x81, len]);
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81; header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81; header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payload]);
}

/** Incremental RFC6455 frame parser fed raw socket chunks. */
class FrameReader {
    constructor(onText, onClose, onPing) {
        this.buf = Buffer.alloc(0);
        this.onText = onText; this.onClose = onClose; this.onPing = onPing;
    }
    push(chunk) {
        this.buf = Buffer.concat([this.buf, chunk]);
        while (true) {
            if (this.buf.length < 2) return;
            const fin = (this.buf[0] & 0x80) !== 0;
            const opcode = this.buf[0] & 0x0f;
            const masked = (this.buf[1] & 0x80) !== 0;
            let len = this.buf[1] & 0x7f;
            let off = 2;
            if (len === 126) {
                if (this.buf.length < 4) return;
                len = this.buf.readUInt16BE(2); off = 4;
            } else if (len === 127) {
                if (this.buf.length < 10) return;
                const big = this.buf.readBigUInt64BE(2);
                if (big > 8n * 1024n * 1024n) return; // sanity cap 8 MiB
                len = Number(big); off = 10;
            }
            let maskKey = null;
            if (masked) {
                if (this.buf.length < off + 4) return;
                maskKey = this.buf.subarray(off, off + 4); off += 4;
            }
            if (this.buf.length < off + len) return;
            let payload = this.buf.subarray(off, off + len);
            if (maskKey) {
                payload = Buffer.from(payload);
                for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
            }
            this.buf = this.buf.subarray(off + len);
            if (!fin) continue; // fragmentation unsupported/ignored (small msgs only)
            if (opcode === 0x1) this.onText(payload.toString('utf8'));
            else if (opcode === 0x8) { this.onClose(); return; }
            else if (opcode === 0x9 && this.onPing) this.onPing();
        }
    }
}

// ------------------------------------------------------------------- server
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('etmm-relay-ok\n');
        return;
    }
    res.writeHead(426); res.end('WebSocket upgrade required');
});

server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
        socket.destroy(); return;
    }
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`);

    const client = {
        socket,
        room: null,
        send(obj) {
            try { socket.write(encodeFrame(JSON.stringify(obj))); } catch { /* gone */ }
        },
        alive: true,
    };
    clients.add(client);

    const reader = new FrameReader(
        text => handleMsg(client, text),
        () => dropClient(client),
        () => client.send({ t: 'pong' }),
    );
    socket.on('data', chunk => reader.push(chunk));
    socket.on('close', () => dropClient(client));
    socket.on('error', () => dropClient(client));
    socket.setNoDelay(true);

    client.send({ t: 'welcome' });
});

function makeCode() {
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
        }
    } while (rooms.has(code));
    return code;
}

function dropClient(client) {
    if (!client.alive) return;
    client.alive = false;
    clients.delete(client);
    if (client.room) {
        const room = rooms.get(client.room);
        if (room) {
            for (const p of room.peers) {
                if (p !== client) p.send({ t: 'peer_gone' });
            }
            room.peers.delete(client);
            if (room.peers.size === 0) rooms.delete(client.room);
        }
        client.room = null;
    }
    try { client.socket.destroy(); } catch { /* already dead */ }
}

function handleMsg(client, text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    switch (msg.t) {
        case 'create': {
            dropFromRoom(client);
            const code = makeCode();
            rooms.set(code, { peers: new Set([client]), created: Date.now() });
            client.room = code;
            client.send({ t: 'created', code });
            log(`room ${code} created`);
            break;
        }
        case 'join': {
            const code = String(msg.code || '').toUpperCase().trim();
            const room = rooms.get(code);
            if (!room || room.peers.size === 0) {
                client.send({ t: 'error', msg: 'bad_code' }); return;
            }
            if (room.peers.size >= 2) {
                client.send({ t: 'error', msg: 'full' }); return;
            }
            dropFromRoom(client);
            room.peers.add(client);
            client.room = code;
            client.send({ t: 'joined', code });
            for (const p of room.peers) p.send({ t: 'ready', code });
            log(`peer joined ${code} (${room.peers.size}/2)`);
            break;
        }
        case 'data': {
            const room = rooms.get(client.room);
            if (!room) return;
            for (const p of room.peers) {
                if (p !== client) p.send({ t: 'data', d: msg.d });
            }
            break;
        }
        case 'ping': client.send({ t: 'pong' }); break;
    }
}

function dropFromRoom(client) {
    if (client.room) dropClientKeepSocket(client);
}

/** Leaves current room but keeps the socket usable for a new room. */
function dropClientKeepSocket(client) {
    const room = rooms.get(client.room);
    if (room) {
        for (const p of room.peers) {
            if (p !== client) p.send({ t: 'peer_gone' });
        }
        room.peers.delete(client);
        if (room.peers.size === 0) rooms.delete(client.room);
    }
    client.room = null;
}

function log(s) {
    console.log(`[${new Date().toLocaleTimeString()}] ${s}`);
}

server.listen(PORT, () => {
    console.log('=============================================');
    console.log(' ET Mini Militia — LAN relay listening');
    console.log(` Port: ${PORT}`);
    console.log(' Give players one of these addresses:');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`   ws://${net.address}:${PORT}   (${name})`);
            }
        }
    }
    console.log(' Rooms auto-clean when empty. Ctrl+C to stop.');
    console.log('=============================================');
});

// Reap stale empty rooms every minute.
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (room.peers.size === 0 || now - room.created > 6 * 3600 * 1000) {
            rooms.delete(code);
        }
    }
}, 60_000);
