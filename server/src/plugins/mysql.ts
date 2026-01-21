import mariadb from "mariadb";
import type { MySQLConnectionConfig } from "./providerPluginRegistry";

export type MySQLTestQueryRequest = {
  connection: MySQLConnectionConfig;
  sql: string;
  params?: any[];
  maxRows?: number;
};

export type MySQLTestQueryResponse = {
  elapsedMs: number;
  rowCount: number;
  rows: any[];
  columns: string[];
};

function isSelectOnly(sql: string): boolean {
  const s = String(sql || "").trim().toLowerCase();
  // Basic guardrail: allow SELECT / WITH ... SELECT
  if (s.startsWith("select")) return true;
  if (s.startsWith("with")) return true;
  return false;
}

export async function testMySQLQuery(req: MySQLTestQueryRequest): Promise<MySQLTestQueryResponse> {
  const sql = String(req.sql || "").trim();
  if (!sql) throw new Error("sql is required");
  if (!isSelectOnly(sql)) throw new Error("Only SELECT queries are allowed in testMySQLQuery");

  const maxRows = Math.max(1, Math.min(Number(req.maxRows || 50), 200));

  // Log SQL query execution details
  console.log(`   🗄️  [MySQL Plugin] Executing SQL:`, sql);
  console.log(`   🗄️  [MySQL Plugin] Connection: ${req.connection.user}@${req.connection.host}:${req.connection.port || 3306}/${req.connection.database}`);
  console.log(`   🗄️  [MySQL Plugin] Params:`, req.params || []);
  console.log(`   🗄️  [MySQL Plugin] Max Rows:`, maxRows);

  const start = Date.now();
  const pool = mariadb.createPool({
    host: req.connection.host,
    port: req.connection.port || 3306,
    user: req.connection.user,
    password: req.connection.password,
    database: req.connection.database,
    connectionLimit: 2,
    // keep timeouts short for wizard UX
    connectTimeout: 5000,
    acquireTimeout: 5000,
  });

  let conn: mariadb.PoolConnection | null = null;
  try {
    conn = await pool.getConnection();
    const rows: any[] = await conn.query(sql, req.params || []);
    // mariadb returns an array + also meta (last item?) for some APIs; normalize to plain objects.
    // Also convert BigInt values to numbers/strings for JSON serialization
    
    // Recursive function to normalize BigInt values in nested structures
    const normalizeBigInt = (value: any): any => {
      if (typeof value === 'bigint') {
        // Convert BigInt to Number if within safe integer range, otherwise to String
        if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
          return Number(value);
        } else {
          return value.toString();
        }
      }
      if (Array.isArray(value)) {
        return value.map(normalizeBigInt);
      }
      if (value !== null && typeof value === 'object') {
        const normalized: any = {};
        for (const [k, v] of Object.entries(value)) {
          normalized[k] = normalizeBigInt(v);
        }
        return normalized;
      }
      return value;
    };
    
    const normalizedRows = Array.isArray(rows) ? rows.slice(0, maxRows).map(r => {
      return normalizeBigInt(r);
    }) : [];
    const columns = normalizedRows.length > 0 ? Object.keys(normalizedRows[0]) : [];
    const elapsedMs = Date.now() - start;
    console.log(`   ✅ [MySQL Plugin] Query completed: ${normalizedRows.length} row(s) in ${elapsedMs}ms`);
    if (normalizedRows.length > 0) {
      console.log(`   📊 [MySQL Plugin] Columns:`, columns.join(', '));
      // Use a BigInt replacer for safe JSON serialization
      const bigIntReplacer = (key: string, value: any): any => {
        if (typeof value === 'bigint') {
          if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
            return Number(value);
          } else {
            return value.toString();
          }
        }
        return value;
      };
      console.log(`   📊 [MySQL Plugin] First row sample:`, JSON.stringify(normalizedRows[0], bigIntReplacer, 2));
      if (normalizedRows.length > 1) {
        console.log(`   📊 [MySQL Plugin] All rows (${normalizedRows.length}):`, JSON.stringify(normalizedRows, bigIntReplacer, 2));
      }
    } else {
      console.log(`   📊 [MySQL Plugin] No rows returned`);
    }
    return {
      elapsedMs,
      rowCount: normalizedRows.length,
      rows: normalizedRows,
      columns,
    };
  } catch (err: any) {
    console.error(`   ❌ [MySQL Plugin] Query failed:`, err.message);
    throw err;
  } finally {
    try { if (conn) conn.release(); } catch {}
    try { await pool.end(); } catch {}
  }
}


