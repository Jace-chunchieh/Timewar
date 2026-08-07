import type Database from 'better-sqlite3';
import type { GameState } from '@timewar/shared';

export class GameRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  get(): GameState | null {
    const row = this.db.prepare('SELECT state FROM game_state ORDER BY updated_at DESC LIMIT 1').get() as
      | { state: string }
      | undefined;
    return row ? (JSON.parse(row.state) as GameState) : null;
  }

  save(state: GameState): void {
    this.db
      .prepare(
        `INSERT INTO game_state (id, state, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
      )
      .run(state.id, JSON.stringify(state), Date.now());
  }

  deleteAll(): void {
    this.db.prepare('DELETE FROM game_state').run();
  }
}
