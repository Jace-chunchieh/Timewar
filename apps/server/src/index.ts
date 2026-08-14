import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadGameData } from './config.js';
import { openDatabase } from './db/database.js';
import { cryptoRng } from './engine/index.js';
import { GameRepository } from './repositories/gameRepository.js';
import { GameService } from './services/gameService.js';

const PORT = Number(process.env.PORT ?? 5215);
const DB_PATH = fileURLToPath(new URL('../data/game.db', import.meta.url));

const data = loadGameData();
const db = openDatabase(DB_PATH);
const repo = new GameRepository(db);
const ctx = {
  balance: data.balance,
  cities: data.cities,
  routes: data.routes,
  rng: cryptoRng(),
};
const service = new GameService(repo, ctx);
const app = await buildApp(service, { isDev: process.env.NODE_ENV !== 'production' });

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n  现实时间人口战争游戏 已启动`);
  console.log(`  本机访问:   http://localhost:${PORT}`);
  const os = await import('node:os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  局域网访问: http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log('');
} catch (err) {
  const e = err as { code?: string; message?: string };
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[TimeWar] 端口 ${PORT} 已被占用。`);
    console.error(`  1. 可能已有实例在运行（宝塔「异常重启」或上次部署的进程），无需重复启动。`);
    console.error(`  2. 若确需重启: 先释放端口 → ss -ltnp | grep ${PORT} → kill -9 <pid>`);
    console.error(`  3. 然后重新启动。`);
  }
  app.log.error(err);
  process.exit(1);
}
