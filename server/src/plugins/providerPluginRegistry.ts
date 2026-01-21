import * as fs from "fs";
import * as path from "path";

export type MySQLConnectionConfig = {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
};

export type MySQLProviderPluginConfig = {
  providerId: string;
  serviceType: string;
  connection: MySQLConnectionConfig;
  /**
   * SQL must be a SELECT query. Use positional `?` parameters.
   * Example: "SELECT flight_no AS flightNumber, destination, date, price FROM flights WHERE destination=? LIMIT 20"
   */
  sql: string;
  /**
   * Param order maps workflow filters (genre/time/destination/etc) to SQL `?` params.
   * Example: ["destination","date"]
   */
  paramOrder?: string[];
  /**
   * Map canonical listing fields to SQL result columns.
   * If omitted, we use row[field] directly.
   */
  fieldMap?: Record<string, string>;
  maxRows?: number; // safety cap (default: 50)
};

type ProviderPluginPersistence = {
  mysql?: Record<string, MySQLProviderPluginConfig>;
  lastSaved: string;
};

const PERSISTENCE_FILE = path.join(__dirname, "../../eden-provider-plugins-persistence.json");

const MYSQL_BY_PROVIDER_ID = new Map<string, MySQLProviderPluginConfig>();

export function loadProviderPluginPersistence(): void {
  try {
    if (!fs.existsSync(PERSISTENCE_FILE)) return;
    const raw = fs.readFileSync(PERSISTENCE_FILE, "utf-8");
    if (!raw || raw.trim().length < 2) return;
    const parsed = JSON.parse(raw) as ProviderPluginPersistence;
    const mysql = parsed.mysql || {};
    for (const [providerId, cfg] of Object.entries(mysql)) {
      if (!providerId || !cfg) continue;
      MYSQL_BY_PROVIDER_ID.set(providerId, cfg);
    }
  } catch (err: any) {
    console.warn(`⚠️  [ProviderPlugins] Failed to load persistence: ${err?.message || err}`);
  }
}

export function saveProviderPluginPersistence(): void {
  try {
    const mysql: Record<string, MySQLProviderPluginConfig> = {};
    for (const [k, v] of MYSQL_BY_PROVIDER_ID.entries()) {
      mysql[k] = v;
    }
    const payload: ProviderPluginPersistence = {
      mysql,
      lastSaved: new Date().toISOString(),
    };
    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err: any) {
    console.warn(`⚠️  [ProviderPlugins] Failed to save persistence: ${err?.message || err}`);
  }
}

export function setMySQLProviderPluginConfig(cfg: MySQLProviderPluginConfig): void {
  MYSQL_BY_PROVIDER_ID.set(cfg.providerId, cfg);
}

export function getMySQLProviderPluginConfig(providerId: string): MySQLProviderPluginConfig | null {
  return MYSQL_BY_PROVIDER_ID.get(providerId) || null;
}


