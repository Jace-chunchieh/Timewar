import type Database from 'better-sqlite3';
import type { GameState } from '@timewar/shared';

export interface AuthCodeInfo {
  code: string;
  name: string;
  isAdmin: boolean;
  createdAt: number;
}

export class GameRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  get(code: string): GameState | null {
    const row = this.db
      .prepare('SELECT state FROM game_state WHERE code = ? ORDER BY updated_at DESC LIMIT 1')
      .get(code) as { state: string } | undefined;
    return row ? (JSON.parse(row.state) as GameState) : null;
  }

  save(state: GameState, code: string): void {
    this.db
      .prepare(
        `INSERT INTO game_state (id, state, updated_at, code) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
      )
      .run(state.id, JSON.stringify(state), Date.now(), code);
  }

  deleteAll(code: string): void {
    this.db.prepare('DELETE FROM game_state WHERE code = ?').run(code);
  }

  // ---------- 授权码 ----------

  authCode(code: string): AuthCodeInfo | undefined {
    const row = this.db
      .prepare('SELECT code, name, is_admin, created_at FROM auth_codes WHERE code = ?')
      .get(code) as { code: string; name: string; is_admin: number; created_at: number } | undefined;
    return row
      ? { code: row.code, name: row.name, isAdmin: row.is_admin === 1, createdAt: row.created_at }
      : undefined;
  }

  authCodes(): AuthCodeInfo[] {
    const rows = this.db
      .prepare('SELECT code, name, is_admin, created_at FROM auth_codes ORDER BY created_at')
      .all() as { code: string; name: string; is_admin: number; created_at: number }[];
    return rows.map((r) => ({ code: r.code, name: r.name, isAdmin: r.is_admin === 1, createdAt: r.created_at }));
  }

  addAuthCode(code: string, name: string, isAdmin = false): AuthCodeInfo {
    this.db
      .prepare('INSERT OR IGNORE INTO auth_codes (code, name, is_admin, created_at) VALUES (?, ?, ?, ?)')
      .run(code, name, isAdmin ? 1 : 0, Date.now());
    const info = this.authCode(code);
    if (!info) throw new Error('AUTH_CODE_INSERT_FAILED');
    return info;
  }
}
