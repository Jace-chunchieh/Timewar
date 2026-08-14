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

  updateEmail(code: string, email: string): void {
    this.db.prepare('UPDATE auth_codes SET email = ? WHERE code = ?').run(email, code);
  }

  emailOf(code: string): string | undefined {
    const row = this.db.prepare('SELECT email FROM auth_codes WHERE code = ?').get(code) as
      | { email: string | null }
      | undefined;
    return row?.email ?? undefined;
  }

  createBannerGift(forCode: string): string {
    const id = `gift-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.db
      .prepare('INSERT INTO banner_gifts (id, for_code, claimed, created_at) VALUES (?, ?, 0, ?)')
      .run(id, forCode, Date.now());
    return id;
  }

  claimBannerGift(code: string): { forCode: string; claimed: boolean } | undefined {
    const row = this.db.prepare('SELECT for_code, claimed FROM banner_gifts WHERE id = ?').get(code) as
      | { for_code: string; claimed: number }
      | undefined;
    if (!row) return undefined;
    if (row.claimed === 1) return { forCode: row.for_code, claimed: true };
    this.db
      .prepare('UPDATE banner_gifts SET claimed = 1, claimed_at = ? WHERE id = ?')
      .run(Date.now(), code);
    return { forCode: row.for_code, claimed: false };
  }
}
