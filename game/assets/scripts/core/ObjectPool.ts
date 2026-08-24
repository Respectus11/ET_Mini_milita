/**
 * ObjectPool.ts
 * ---------------------------------------------------------------------------
 * Generic object pool to avoid per-frame allocations (projectiles, fx...).
 * The factory creates new items when the pool is empty; the optional reset
 * callback clears per-use state before an item is handed out again.
 */
export class Pool<T> {
    private items: T[] = [];

    constructor(private factory: () => T, private reset?: (item: T) => void) {}

    /** Takes an item from the pool, or manufactures one if empty. */
    get(): T {
        const it = this.items.pop();
        return it !== undefined ? it : this.factory();
    }

    /** Returns an item to the pool after resetting its state. */
    put(it: T) {
        if (this.reset) this.reset(it);
        this.items.push(it);
    }
}
