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

  // ---------- 游戏内邮箱 ----------

  mailList(code: string): MailItem[] {
    const rows = this.db
      .prepare('SELECT id, to_code, from_code, title, body, item_type, item_amount, claimed, created_at FROM game_mail WHERE to_code = ? ORDER BY created_at DESC')
      .all(code) as {
      id: string; to_code: string; from_code: string; title: string; body: string;
      item_type: string | null; item_amount: number; claimed: number; created_at: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      toCode: r.to_code,
      fromCode: r.from_code,
      title: r.title,
      body: r.body,
      itemType: r.item_type ?? undefined,
      itemAmount: r.item_amount,
      claimed: r.claimed === 1,
      createdAt: r.created_at,
    }));
  }

  sendMailItem(mail: {
    id: string;
    toCode: string;
    fromCode: string;
    title: string;
    body: string;
    itemType?: string;
    itemAmount: number;
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO game_mail (id, to_code, from_code, title, body, item_type, item_amount, claimed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(mail.id, mail.toCode, mail.fromCode, mail.title, mail.body, mail.itemType ?? null, mail.itemAmount, Date.now());
  }

  // 领取附件：返回是否成功（不存在/非本人/已领取返回原因）
  claimMailItem(id: string, code: string): { ok: true; itemType?: string; itemAmount: number } | { ok: false; reason: 'NOT_FOUND' | 'NOT_OWNER' | 'ALREADY_CLAIMED' } {
    const row = this.db
      .prepare('SELECT to_code, claimed, item_type, item_amount FROM game_mail WHERE id = ?')
      .get(id) as { to_code: string; claimed: number; item_type: string | null; item_amount: number } | undefined;
    if (!row) return { ok: false, reason: 'NOT_FOUND' };
    if (row.to_code !== code) return { ok: false, reason: 'NOT_OWNER' };
    if (row.claimed === 1) return { ok: false, reason: 'ALREADY_CLAIMED' };
    this.db.prepare('UPDATE game_mail SET claimed = 1 WHERE id = ?').run(id);
    return { ok: true, itemType: row.item_type ?? undefined, itemAmount: row.item_amount };
  }

  unclaimedMailCount(code: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM game_mail WHERE to_code = ? AND claimed = 0')
      .get(code) as { c: number };
    return row.c;
  }
}

export interface MailItem {
  id: string;
  toCode: string;
  fromCode: string;
  title: string;
  body: string;
  itemType?: string;
  itemAmount: number;
  claimed: boolean;
  createdAt: number;
}
