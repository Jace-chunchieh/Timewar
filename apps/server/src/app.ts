import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApi } from './api/routes.js';
import type { GameService } from './services/gameService.js';

const WEB_ROOT = fileURLToPath(new URL('../../web', import.meta.url));
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

export async function buildApp(
  service: GameService,
  opts: { isDev: boolean }
): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(buildApi(service));

  if (opts.isDev) {
    // 开发模式：Vite 中间件与 API 同端口（默认 5215），支持 HMR
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: WEB_ROOT,
      server: { middlewareMode: true },
      appType: 'spa',
      logLevel: 'info',
    });
    app.addHook('onRequest', (req, reply, done) => {
      if (req.raw.url?.startsWith('/api/')) return done();
      vite.middlewares(req.raw, reply.raw, (err?: unknown) => {
        if (err) done(err as Error);
      });
    });
  } else {
    const fastifyStatic = (await import('@fastify/static')).default;
    if (!existsSync(WEB_DIST)) {
      app.log.warn(`未找到前端构建产物 ${WEB_DIST}，仅提供 API 服务（请先运行 npm run build）`);
    } else {
      await app.register(fastifyStatic, { root: WEB_DIST });
      app.setNotFoundHandler((_req, reply) => {
        reply.type('text/html').sendFile('index.html');
      });
    }
  }

  return app;
}
