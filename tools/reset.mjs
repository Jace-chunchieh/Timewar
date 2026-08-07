// 重置存档：删除本地 SQLite 数据库文件（下次启动自动创建新存档）
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DB = fileURLToPath(new URL('../apps/server/data/game.db', import.meta.url));
const files = [DB, `${DB}-wal`, `${DB}-shm`];
let removed = false;
for (const f of files) {
  try {
    rmSync(f, { force: true });
    removed = true;
    console.log(`已删除: ${f}`);
  } catch {
    /* 不存在则跳过 */
  }
}
if (!removed) {
  console.log('存档不存在或已重置，无需操作');
}
console.log('提示：重置前请先停止正在运行的 dev 服务器。');
