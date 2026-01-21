/**
 * Simple JSON-based logger for tracing garden lifecycle
 * Stores events in a map and saves to JSON file
 */

import * as fs from 'fs';
import * as path from 'path';

interface LogEntry {
  timestamp: number;
  event: string;
  data: any;
}

class SimpleLogger {
  private logFile: string;
  private logs: Map<string, LogEntry[]> = new Map();
  private saveInterval: NodeJS.Timeout | null = null;

  constructor(logFileName: string = 'eden-garden-lifecycle.json') {
    this.logFile = path.join(__dirname, '..', logFileName);
    this.loadLogs();
  }

  /**
   * Load existing logs from file
   */
  private loadLogs(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf-8');
        const data = JSON.parse(content);
        if (data.logs && typeof data.logs === 'object') {
          for (const [key, value] of Object.entries(data.logs)) {
            this.logs.set(key, value as LogEntry[]);
          }
        }
      }
    } catch (err: any) {
      console.warn(`⚠️  [Logger] Failed to load logs: ${err.message}`);
    }
  }

  /**
   * Log an event
   */
  log(category: string, event: string, data: any = {}): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      event,
      data
    };

    if (!this.logs.has(category)) {
      this.logs.set(category, []);
    }
    this.logs.get(category)!.push(entry);

    // Auto-save every 5 seconds
    if (!this.saveInterval) {
      this.saveInterval = setInterval(() => this.save(), 5000);
    }

    // Also save immediately for critical events
    if (event.includes('create') || event.includes('save') || event.includes('error')) {
      this.save();
    }
  }

  /**
   * Save logs to file
   */
  save(): void {
    try {
      const data = {
        lastSaved: new Date().toISOString(),
        logs: Object.fromEntries(this.logs)
      };
      fs.writeFileSync(this.logFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`⚠️  [Logger] Failed to save logs: ${err.message}`);
    }
  }

  /**
   * Get logs for a category
   */
  getLogs(category: string): LogEntry[] {
    return this.logs.get(category) || [];
  }

  /**
   * Clear logs
   */
  clear(): void {
    this.logs.clear();
    this.save();
  }
}

// Singleton instance
let loggerInstance: SimpleLogger | null = null;

/**
 * Initialize the logger
 */
export function initializeLogger(): SimpleLogger {
  if (!loggerInstance) {
    loggerInstance = new SimpleLogger();
    console.log(`📝 [Logger] Initialized - logs will be saved to ${loggerInstance['logFile']}`);
  }
  return loggerInstance;
}

/**
 * Get the logger instance
 */
export function getLogger(): SimpleLogger {
  if (!loggerInstance) {
    return initializeLogger();
  }
  return loggerInstance;
}

