/**
 * In-Memory Redis Server Module
 * Provides an in-memory Redis-compatible server with persistence
 */
import { EventEmitter } from "events";
/**
 * In-memory Redis server implementation with persistence
 * Supports key-value operations, streams, and consumer groups
 */
export declare class InMemoryRedisServer extends EventEmitter {
    private data;
    private streams;
    private streamCounters;
    private consumerGroups;
    private pendingMessages;
    private isConnected;
    private persistenceFile;
    private ledgerEntriesFile;
    private gardensFile;
    private serviceRegistryFile;
    private saveTimeout;
    private readonly SAVE_DELAY_MS;
    private serviceRegistrySaveTimer;
    private serviceRegistrySavePending;
    constructor();
    private loadPersistence;
    private migrateToSeparateFiles;
    private savePersistence;
    saveLedgerEntries(ledgerEntries: any[]): void;
    private savePersistenceImmediate;
    saveIndexers(indexers: any[]): void;
    saveServiceRegistry(): void;
    connect(): Promise<void>;
    ping(): Promise<string>;
    get isOpen(): boolean;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    del(key: string): Promise<number>;
    getKeysMatching(pattern: string): string[];
    hSet(key: string, value: any): Promise<number>;
    hGet(key: string, field: string): Promise<string | null>;
    xAdd(streamKey: string, id: string, fields: Record<string, string>): Promise<string>;
    xRead(streams: Array<{
        key: string;
        id: string;
    }>, options?: {
        BLOCK?: number;
        COUNT?: number;
    }): Promise<Array<{
        name: string;
        messages: Array<{
            id: string;
            message: Record<string, string>;
        }>;
    }> | null>;
    xGroupCreate(streamKey: string, groupName: string, id: string, options?: {
        MKSTREAM?: boolean;
    }): Promise<void>;
    xReadGroup(groupName: string, consumerName: string, streams: Array<{
        key: string;
        id: string;
    }>, options?: {
        COUNT?: number;
        BLOCK?: number;
    }): Promise<Array<{
        name: string;
        messages: Array<{
            id: string;
            message: Record<string, string>;
        }>;
    }> | null>;
    xAck(streamKey: string, groupName: string, ...ids: string[]): Promise<number>;
    quit(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): this;
}
//# sourceMappingURL=redis.d.ts.map