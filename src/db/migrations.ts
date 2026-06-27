export interface Migration {
  version: number;
  name: string;
  up: (db: import("better-sqlite3").Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          action TEXT NOT NULL,
          decision TEXT,
          reason TEXT,
          metadata TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
        CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
      `);
    },
  },
  {
    version: 2,
    name: "pending_confirmations",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pending_confirmations (
          id TEXT PRIMARY KEY,
          action_json TEXT NOT NULL,
          policy_snapshot_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE INDEX IF NOT EXISTS idx_pending_confirmations_status
          ON pending_confirmations(status);
        CREATE INDEX IF NOT EXISTS idx_pending_confirmations_expires_at
          ON pending_confirmations(expires_at);
      `);
    },
  },
];
