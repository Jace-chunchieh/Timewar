import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameState } from '@timewar/shared';

export const ADMIN_CODE = 'ainiyiwannian';

export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_state (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_codes (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS banner_gifts (
      id TEXT PRIMARY KEY,
      for_code TEXT NOT NULL,
      claimed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER
    );
  `);
  // 迁移：为旧存档补充授权码列（归管理员），初始化管理员授权码，并补充邮箱列
  const cols = db.prepare(`PRAGMA table_info(game_state)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'code')) {
    db.exec(`ALTER TABLE game_state ADD COLUMN code TEXT DEFAULT NULL`);
  }
  const authCols = db.prepare(`PRAGMA table_info(auth_codes)`).all() as { name: string }[];
  if (!authCols.some((c) => c.name === 'email')) {
    db.exec(`ALTER TABLE auth_codes ADD COLUMN email TEXT DEFAULT NULL`);
  }
  db.prepare(`UPDATE game_state SET code = ? WHERE code IS NULL`).run(ADMIN_CODE);
  db.prepare(
    `INSERT OR IGNORE INTO auth_codes (code, name, is_admin, created_at) VALUES (?, ?, 1, ?)`
  ).run(ADMIN_CODE, '管理员', Date.now());
  return db;
}
