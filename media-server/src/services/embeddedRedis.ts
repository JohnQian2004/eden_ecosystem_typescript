/**
 * Embedded In-Memory Redis Server for Media Server
 * Provides an in-memory Redis-compatible server for TikTok features
 * Runs entirely inside the Node.js process - no external Redis needed
 */

import { EventEmitter } from "events";

/**
 * In-memory Redis server implementation
 * Supports basic key-value operations, sets, and hashes for TikTok features
 */
export class EmbeddedRedisServer extends EventEmitter {
  private data: Map<string, any> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  private expirations: Map<string, NodeJS.Timeout> = new Map();
  private isConnected = false;

  constructor() {
    super();
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.emit("connect");
    await new Promise(resolve => setTimeout(resolve, 10));
    this.isConnected = true;
    this.emit("ready");
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  get isOpen(): boolean {
    return this.isConnected;
  }

  // Simple key-value operations
  async get(key: string): Promise<string | null> {
    const value = this.data.get(key);
    if (value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      return value;
    }
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    // Clear any existing expiration
    if (this.expirations.has(key)) {
      clearTimeout(this.expirations.get(key)!);
      this.expirations.delete(key);
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    this.data.set(key, value);
    // Clear any existing expiration
    if (this.expirations.has(key)) {
      clearTimeout(this.expirations.get(key)!);
    }
    // Set new expiration
    const timeout = setTimeout(() => {
      this.data.delete(key);
      this.expirations.delete(key);
    }, seconds * 1000);
    this.expirations.set(key, timeout);
  }

  async del(key: string): Promise<number> {
    const existed = this.data.has(key) || this.sets.has(key);
    if (this.data.has(key)) {
      this.data.delete(key);
    }
    if (this.sets.has(key)) {
      this.sets.delete(key);
    }
    // Clear expiration if exists
    if (this.expirations.has(key)) {
      clearTimeout(this.expirations.get(key)!);
      this.expirations.delete(key);
    }
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return (this.data.has(key) || this.sets.has(key)) ? 1 : 0;
  }

  // Set operations (for likes, follows)
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.has(member)) {
        set.delete(member);
        removed++;
      }
    }
    return removed;
  }

  async sismember(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    return set.has(member) ? 1 : 0;
  }

  async scard(key: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    return set.size;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    if (!set) return [];
    return Array.from(set);
  }

  // Hash operations
  async hSet(key: string, field: string, value: string): Promise<number> {
    if (!this.data.has(key)) {
      this.data.set(key, {});
    }
    const hash = this.data.get(key);
    if (typeof hash === 'object' && hash !== null) {
      hash[field] = value;
      return 1;
    }
    return 0;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    const hash = this.data.get(key);
    if (hash && typeof hash === 'object') {
      return hash[field] || null;
    }
    return null;
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    const hash = this.data.get(key);
    if (hash && typeof hash === 'object') {
      return { ...hash };
    }
    return {};
  }

  async hDel(key: string, ...fields: string[]): Promise<number> {
    const hash = this.data.get(key);
    if (!hash || typeof hash !== 'object') return 0;
    let deleted = 0;
    for (const field of fields) {
      if (hash[field] !== undefined) {
        delete hash[field];
        deleted++;
      }
    }
    return deleted;
  }

  async quit(): Promise<void> {
    this.isConnected = false;
    this.emit("end");
  }

  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

