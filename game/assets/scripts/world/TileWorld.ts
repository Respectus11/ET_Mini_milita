/**
 * TileWorld.ts
 * ---------------------------------------------------------------------------
 * The whole arena model in one class:
 *   1. Parses an ASCII MapDef into a collision grid + spawn/pickup lists.
 *   2. Provides swept-AABB movement with solid tiles and one-way platforms.
 *   3. Provides DDA-style raycasting for bullets and bot line-of-sight.
 *   4. Renders the static backdrop (gradient sky, sun, tiles) into Graphics.
 *
 * World coordinate convention: origin at the grid's bottom-left corner,
 * y grows upward. Row 0 of the ASCII art is the TOP row (like a text file).
 */
import { Color, Graphics, Vec3 } from 'cc';
import { CFG } from '../core/GameConfig';
import { MapDef } from '../data/Maps';

const T = CFG.TILE;

export enum TileType {
    EMPTY = 0,
    SOLID = 1,
    PLATFORM = 2,
}

/** Axis-aligned box used for movement queries (duck-typed by Fighter). */
interface Aabb {
    x: number; y: number; w: number; h: number;
}

export class RayHit {
    hit = false;
    x = 0; y = 0;
}

export class TileWorld {
    cols = 30;
    rows = 16;
    grid: TileType[][] = [];          // [asciiRow][col] -> tile type
    pSpawns: Vec3[] = [];             // P1 candidate spawns
    qSpawns: Vec3[] = [];             // P2 candidate spawns
    botSpawns: Vec3[] = [];           // bot candidate spawns
    itemSpawns: { ch: string; cx: number; cy: number }[] = [];

    constructor(public def: MapDef) {
        this.parse();
    }

    /**
     * Walks the ASCII rows once, filling the type grid and collecting
     * gameplay markers ('P','Q','E' spawn points; 'B','I','M','W' pickups).
     * Rows are padded/truncated to the widest row so sloppy maps can't crash.
     */
    private parse() {
        this.rows = this.def.rows.length;
        this.cols = Math.max(...this.def.rows.map(r => r.length));
        for (let r = 0; r < this.rows; r++) {
            const row: TileType[] = [];
            const line = (this.def.rows[r] || '').padEnd(this.cols, '.');
            for (let c = 0; c < this.cols; c++) {
                let tt = TileType.EMPTY;
                switch (line[c]) {
                    case '#': tt = TileType.SOLID; break;
                    case '-': tt = TileType.PLATFORM; break;
                }
                row.push(tt);
                const wx = c * T + T / 2;
                const wy = (this.rows - 1 - r) * T + T / 2;
                switch (line[c]) {
                    case 'P': this.pSpawns.push(new Vec3(wx, wy, 0)); break;
                    case 'Q': this.qSpawns.push(new Vec3(wx, wy, 0)); break;
                    case 'E': this.botSpawns.push(new Vec3(wx, wy, 0)); break;
                    case 'W':
                    case 'B': // buna speed pickup
                    case 'I': // injera heal pickup
                    case 'M': // mesob shield pickup
                        this.itemSpawns.push({ ch: line[c], cx: wx, cy: wy });
                        break;
                }
            }
            this.grid.push(row);
        }
    }

    // World origin: bottom-left of grid at (0,0). Grid pixel size: cols*T x rows*T
    get worldW(): number { return this.cols * T; }
    get worldH(): number { return this.rows * T; }

    tileAt(col: number, row: number): TileType {
        if (col < 0 || col >= this.cols) return TileType.SOLID;
        if (row < 0 || row >= this.rows) return TileType.EMPTY;
        return this.grid[this.rows - 1 - row][col];
    }

    /** Point query used by bullets and bot ledge checks. */
    solidAtWorld(x: number, y: number): boolean {
        return this.tileAt(Math.floor(x / T), Math.floor(y / T)) === TileType.SOLID;
    }

    private overlapsSolid(a: Aabb): boolean {
        const c0 = Math.floor(a.x / T), c1 = Math.floor((a.x + a.w - 0.01) / T);
        const r0 = Math.floor(a.y / T), r1 = Math.floor((a.y + a.h - 0.01) / T);
        for (let c = c0; c <= c1; c++)
            for (let r = r0; r <= r1; r++)
                if (this.tileAt(c, r) === TileType.SOLID) return true;
        return false;
    }

    /**
     * Moves a body by (dx, dy) resolving collisions axis by axis.
     *
     * Returns [hitX, hitY, landed]:
     *   hitX/hitY — body was snapped flush against a solid tile on that axis
     *   landed    — body came to rest on ground or a platform this frame
     *
     * One-way platforms only engage when falling (dy < 0) AND the feet cross
     * the platform's top surface within this exact frame — so you can jump up
     * through them, walk across them, and drop through with dropDown.
     */
    moveBody(body: { x: number; y: number; w: number; h: number }, dx: number, dy: number, allowPlatformDrop: boolean): [boolean, boolean, boolean] {
        let hitX = false, hitY = false, landed = false;

        // --- X axis: snap flush to the blocking tile's edge ---
        if (dx !== 0) {
            body.x += dx;
            if (this.overlapsSolid(body)) {
                body.x = dx > 0 ? Math.floor((body.x + body.w) / T) * T - body.w - 0.01
                                : Math.floor(body.x / T + 1) * T + 0.01;
                hitX = true;
            }
        }

        // --- Y axis: same snapping for ceilings and floors ---
        if (dy !== 0) {
            body.y += dy;
            if (this.overlapsSolid(body)) {
                body.y = dy > 0 ? Math.floor((body.y + body.h) / T) * T - body.h - 0.01
                                : Math.floor(body.y / T + 1) * T + 0.01;
                hitY = true;
                if (dy < 0) landed = true;
            }
        }

        // One-way platforms: land only if feet crossed the platform top this frame
        if (!landed && dy < 0 && !allowPlatformDrop) {
            const feetPrev = body.y - dy;
            const c0 = Math.floor(body.x / T), c1 = Math.floor((body.x + body.w - 0.01) / T);
            const rFoot = Math.floor(body.y / T);
            const top = rFoot * T + T;
            if (feetPrev >= top && body.y < top) {
                for (let c = c0; c <= c1; c++) {
                    if (this.tileAt(c, rFoot) === TileType.PLATFORM) {
                        body.y = top + 0.01;
                        landed = true;
                        break;
                    }
                }
            }
        }

        // The world border is implicitly solid (tileAt returns SOLID off-grid),
        // so clamp horizontally — a single snap can only resolve one tile of
        // penetration, and this guarantees huge steps can never tunnel out.
        if (body.x < 0.01) { body.x = 0.01; hitX = true; }
        const maxX = this.cols * T - body.w - 0.01;
        if (body.x > maxX) { body.x = maxX; hitX = true; }

        return [hitX, hitY, landed];
    }

    /**
     * Marches a ray from (x0,y0) along (dx,dy) in quarter-tile steps and
     * reports the last free point before hitting SOLID geometry. Good enough
     * for bullets and sight checks; not pixel-exact, which keeps it cheap.
     */
    raycast(x0: number, y0: number, dx: number, dy: number, out?: RayHit): RayHit {
        const res = out ?? new RayHit();
        const len = Math.hypot(dx, dy);
        if (len < 0.0001) { res.hit = false; res.x = x0; res.y = y0; return res; }
        const steps = Math.ceil(len / (T * 0.25));
        const sx = dx / steps, sy = dy / steps;
        let x = x0, y = y0;
        for (let i = 0; i < steps; i++) {
            x += sx; y += sy;
            if (this.solidAtWorld(x, y)) {
                res.hit = true; res.x = x - sx; res.y = y - sy;
                return res;
            }
        }
        res.hit = false; res.x = x; res.y = y;
        return res;
    }

    /** True when nothing solid blocks the straight path between two points. */
    hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
        const h = this.raycast(x0, y0, x1 - x0, y1 - y0);
        return !h.hit;
    }

    randomSpawn(kind: 'p' | 'q' | 'e'): Vec3 {
        const arr = kind === 'p' ? this.pSpawns : kind === 'q' ? this.qSpawns : this.botSpawns;
        if (!arr.length) return new Vec3(this.worldW / 2, this.worldH / 2, 0);
        return arr[Math.floor(Math.random() * arr.length)].clone();
    }

    /**
     * Paints the static arena backdrop once into a Graphics component:
     * banded sky gradient, a sun disc, then every solid/platform tile with
     * an outline and a colored lip on exposed tops for depth cues.
     * (offsetX/offsetY center the grid on the canvas.)
     */
    drawStatic(g: Graphics, offsetX: number, offsetY: number) {
        g.rect(offsetX, offsetY, this.worldW, this.worldH);
        g.fillColor = this.def.skyBottom;
        g.fill();

        // subtle vertical gradient bands
        const bands = 8;
        for (let i = 0; i < bands; i++) {
            const t = i / (bands - 1);
            const c = lerpColor(this.def.skyBottom, this.def.skyTop, t);
            g.fillColor = c;
            const bh = this.worldH / bands;
            g.rect(offsetX, offsetY + i * bh, this.worldW, bh + 1);
            g.fill();
        }

        // sun disc
        g.fillColor = new Color(255, 250, 205, 200);
        g.circle(offsetX + this.worldW * 0.82, offsetY + this.worldH * 0.82, 70);
        g.fill();

        // tiles
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const tt = this.tileAt(c, r);
                if (tt === TileType.EMPTY) continue;
                const x = offsetX + c * T;
                const y = offsetY + (this.rows - 1 - r) * T;
                if (tt === TileType.SOLID) {
                    g.fillColor = this.def.tileFill;
                    g.rect(x, y, T, T);
                    g.fill();
                    g.lineWidth = 3;
                    g.strokeColor = this.def.tileEdge;
                    g.rect(x + 1.5, y + 1.5, T - 3, T - 3);
                    g.stroke();
                    // top grass/deco lip
                    if (this.tileAt(c, r + 1) !== TileType.SOLID) {
                        g.fillColor = this.def.decoColor;
                        g.rect(x, y + T - 10, T, 10);
                        g.fill();
                    }
                } else {
                    g.fillColor = this.def.tileEdge;
                    g.rect(x + 4, y + T - 14, T - 8, 12);
                    g.fill();
                }
            }
        }
    }
}

function lerpColor(a: Color, b: Color, t: number): Color {
    return new Color(
        Math.round(a.r + (b.r - a.r) * t),
        Math.round(a.g + (b.g - a.g) * t),
        Math.round(a.b + (b.b - a.b) * t),
        255,
    );
}
