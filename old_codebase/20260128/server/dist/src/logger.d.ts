/**
 * Simple JSON-based logger for tracing garden lifecycle
 * Stores events in a map and saves to JSON file
 */
interface LogEntry {
    timestamp: number;
    event: string;
    data: any;
}
declare class SimpleLogger {
    private logFile;
    private logs;
    private saveInterval;
    constructor(logFileName?: string);
    /**
     * Load existing logs from file
     */
    private loadLogs;
    /**
     * Log an event
     */
    log(category: string, event: string, data?: any): void;
    /**
     * Save logs to file
     */
    save(): void;
    /**
     * Get logs for a category
     */
    getLogs(category: string): LogEntry[];
    /**
     * Clear logs
     */
    clear(): void;
}
/**
 * Initialize the logger
 */
export declare function initializeLogger(): SimpleLogger;
/**
 * Get the logger instance
 */
export declare function getLogger(): SimpleLogger;
export {};
//# sourceMappingURL=logger.d.ts.map