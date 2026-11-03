/**
 * A small in-memory cache with expiry. Each Worker isolate keeps its own; that is enough for
 * "cache the blockhash for 2 seconds", where sharing across data centres would gain nothing.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly now: () => number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (this.entries.size >= this.maxEntries) {
      // Drop the oldest entry. Maps keep insertion order.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expires: this.now() + ttlMs });
  }
}
