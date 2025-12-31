import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export interface StoredToken {
  userId: string;
  accessToken: string;
  tokenType: string;
  expiresAt: number | null; // Unix timestamp, null = never expires
  scopes: string[];
  createdAt: number;
  updatedAt: number;
}

export class TokenStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        token_type TEXT NOT NULL DEFAULT 'Bearer',
        expires_at INTEGER,
        scopes TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);
    `);
  }

  saveToken(token: StoredToken): void {
    const stmt = this.db.prepare(`
      INSERT INTO tokens (user_id, access_token, token_type, expires_at, scopes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        token_type = excluded.token_type,
        expires_at = excluded.expires_at,
        scopes = excluded.scopes,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      token.userId,
      token.accessToken,
      token.tokenType,
      token.expiresAt,
      JSON.stringify(token.scopes),
      token.createdAt,
      token.updatedAt,
    );
  }

  getToken(userId: string): StoredToken | null {
    const stmt = this.db.prepare(`
      SELECT user_id, access_token, token_type, expires_at, scopes, created_at, updated_at
      FROM tokens
      WHERE user_id = ?
    `);

    const row = stmt.get(userId) as
      | {
          user_id: string;
          access_token: string;
          token_type: string;
          expires_at: number | null;
          scopes: string;
          created_at: number;
          updated_at: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      accessToken: row.access_token,
      tokenType: row.token_type,
      expiresAt: row.expires_at,
      scopes: JSON.parse(row.scopes) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getValidToken(userId: string): StoredToken | null {
    const token = this.getToken(userId);

    if (!token) {
      return null;
    }

    // Check expiration (with 5-minute buffer)
    if (token.expiresAt !== null) {
      const bufferMs = 5 * 60 * 1000;
      if (Date.now() + bufferMs > token.expiresAt * 1000) {
        return null;
      }
    }

    return token;
  }

  deleteToken(userId: string): boolean {
    const stmt = this.db.prepare("DELETE FROM tokens WHERE user_id = ?");
    const result = stmt.run(userId);
    return result.changes > 0;
  }

  listUsers(): string[] {
    const stmt = this.db.prepare("SELECT user_id FROM tokens");
    const rows = stmt.all() as Array<{ user_id: string }>;
    return rows.map((row) => row.user_id);
  }

  close(): void {
    this.db.close();
  }
}

// Default singleton instance
let defaultStore: TokenStore | null = null;

export function getDefaultTokenStore(): TokenStore {
  if (!defaultStore) {
    const dbPath = process.env["SQLITE_DB_PATH"] ?? "./data/tokens.db";
    defaultStore = new TokenStore(dbPath);
  }
  return defaultStore;
}
