/**
 * db.ts — SQLite wrapper using node-sqlite3-wasm (WASM-based, no native compilation needed).
 * Provides a better-sqlite3-compatible API:
 *   - db.prepare(sql).run(params)   → { changes, lastInsertRowid }
 *   - db.prepare(sql).get(params)   → row | undefined
 *   - db.prepare(sql).all(params)   → row[]
 *   - db.exec(sql)
 *   - db.pragma(str)
 *   - db.transaction(fn)()          → runs fn inside BEGIN/COMMIT
 *
 * node-sqlite3-wasm uses ':name' params in SQL and { ':name': val } in run().
 * This wrapper accepts '@name' params in SQL and { name: val } objects (better-sqlite3 style)
 * and converts them automatically.
 */

import { Database as SqliteDb } from 'node-sqlite3-wasm';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'inventory.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Convert @param → :param in SQL strings
function convertSql(sql: string): string {
  return sql.replace(/@(\w+)/g, ':$1');
}

// Convert { name: val } → { ':name': val } for named params
function convertParams(params: unknown): unknown {
  if (Array.isArray(params)) return params;
  if (params && typeof params === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      out[k.startsWith(':') ? k : `:${k}`] = v;
    }
    return out;
  }
  return params;
}

class WrappedStatement {
  private _stmt: ReturnType<SqliteDb['prepare']>;

  constructor(stmt: ReturnType<SqliteDb['prepare']>) {
    this._stmt = stmt;
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number } {
    // Accept run(val1, val2) or run({ key: val }) or run([val1, val2])
    let params: unknown;
    if (args.length === 1) {
      params = convertParams(args[0]);
    } else if (args.length > 1) {
      params = args; // positional array
    } else {
      params = [];
    }
    return this._stmt.run(params as Parameters<typeof this._stmt.run>[0]) as { changes: number; lastInsertRowid: number };
  }

  get(...args: unknown[]): unknown {
    let params: unknown;
    if (args.length === 1) {
      params = convertParams(args[0]);
    } else if (args.length > 1) {
      params = args;
    } else {
      params = [];
    }
    return this._stmt.get(params as Parameters<typeof this._stmt.get>[0]);
  }

  all(...args: unknown[]): unknown[] {
    let params: unknown;
    if (args.length === 1) {
      params = convertParams(args[0]);
    } else if (args.length > 1) {
      params = args;
    } else {
      params = [];
    }
    return this._stmt.all(params as Parameters<typeof this._stmt.all>[0]) as unknown[];
  }
}

class WrappedDatabase {
  private _db!: SqliteDb;

  constructor(dbPath: string) {
    // Clean up stale lock directory left by a previous process (ts-node-dev respawn race)
    const lockDir = dbPath + '.lock';
    if (fs.existsSync(lockDir)) {
      try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    // Retry open up to 5 times with 200ms delay to handle lock race
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        this._db = new SqliteDb(dbPath);
        // Use DELETE journal mode (simpler, no WAL shm/wal files, less lock contention in dev)
        this._db.exec("PRAGMA journal_mode = DELETE");
        this._db.exec("PRAGMA foreign_keys = ON");
        this._db.exec("PRAGMA busy_timeout = 5000");
        return;
      } catch (e) {
        lastErr = e;
        // Synchronous sleep between attempts
        const until = Date.now() + 200;
        while (Date.now() < until) { /* spin */ }
      }
    }
    throw lastErr;
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  pragma(str: string): void {
    this._db.exec(`PRAGMA ${str}`);
  }

  prepare(sql: string): WrappedStatement {
    const converted = convertSql(sql);
    return new WrappedStatement(this._db.prepare(converted));
  }

  /**
   * Returns a function that, when called, runs fn inside a transaction.
   * Mirrors better-sqlite3's db.transaction(fn) API.
   */
  transaction<T extends unknown[], R>(fn: (...args: T) => R): (...args: T) => R {
    return (...args: T): R => {
      this._db.exec('BEGIN');
      try {
        const result = fn(...args);
        this._db.exec('COMMIT');
        return result;
      } catch (e) {
        this._db.exec('ROLLBACK');
        throw e;
      }
    };
  }
}

// ---- Migration runner ----
function runMigrations(db: WrappedDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT filename FROM _migrations').all() as { filename: string }[]).map(
      (r) => r.filename
    )
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run([file]);
    console.log(`[db] Applied migration: ${file}`);
  }
}

const db = new WrappedDatabase(DB_PATH);
runMigrations(db);

export default db;
