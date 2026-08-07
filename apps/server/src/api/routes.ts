import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  allocateSchema,
  armyCancelSchema,
  armyCreateSchema,
  armyMarchSchema,
  armyTransferSchema,
  craftSchema,
  generalIdSchema,
  researchSchema,
  techUpgradeSchema,
  trainingCancelSchema,
  trainingStartSchema,
  tutorialStepSchema,
} from '@timewar/shared';
import { GameError } from '../services/gameError.js';
import type { GameService } from '../services/gameService.js';

export function buildApi(service: GameService): FastifyPluginAsync {
  const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
    app.addHook('onSend', async (_req, reply, payload) => {
      // 统一错误结构由 error handler 完成
      void payload;
      if (reply.statusCode >= 400 && typeof payload === 'string') {
        try {
          const parsed = JSON.parse(payload);
          if (parsed?.code) {
            reply.header('content-type', 'application/json; charset=utf-8');
          }
        } catch {
          /* 非 JSON 错误体，原样返回 */
        }
      }
      return payload;
    });

    app.setErrorHandler((err, _req, reply) => {
      if (err instanceof GameError) {
        return reply.code(400).send({ code: err.code, message: err.message, details: err.details });
      }
      if (err && typeof err === 'object' && 'issues' in err) {
        const issues = (err as { issues: { path: unknown[]; message: string }[] }).issues;
        return reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
      }
      app.log.error(err);
      return reply.code(500).send({ code: 'INTERNAL_ERROR', message: '服务器内部错误' });
    });

    const handle = (fn: () => unknown) => async () => {
      const result = await fn();
      return result;
    };

    app.get('/api/game/state', handle(() => ({ state: service.state() })));
    app.get('/api/battles', handle(() => ({ reports: service.reports() })));
    app.post('/api/game/new', handle(() => ({ state: service.newGame() })));
    app.post('/api/game/advance', handle(() => ({ state: service.state() })));
    app.post('/api/game/reset', handle(() => ({ state: service.reset() })));

    app.post('/api/tutorial/step', async (req, _reply) => {
      const body = tutorialStepSchema.parse(req.body);
      return { state: service.setTutorialStep(body.step) };
    });

    app.post('/api/game/welcome-ack', async (_req, _reply) => {
      return { state: service.ackWelcome() };
    });

    app.post('/api/research/allocate', async (req, _reply) => {
      const body = researchSchema.parse(req.body);
      return { state: service.allocateResearch(body.workers) };
    });

    app.post('/api/tech/upgrade', async (req, _reply) => {
      const body = techUpgradeSchema.parse(req.body);
      return { state: service.upgradeTech(body.key) };
    });

    app.post('/api/production/allocate', async (req, _reply) => {
      const body = allocateSchema.parse(req.body);
      return { state: service.allocate(body.workers) };
    });

    app.post('/api/training/start', async (req, _reply) => {
      const body = trainingStartSchema.parse(req.body);
      return { state: service.startTraining(body.count) };
    });

    app.post('/api/training/cancel', async (req, _reply) => {
      const body = trainingCancelSchema.parse(req.body);
      return { state: service.cancelTraining(body.batchId) };
    });

    app.post('/api/soldiers/craft', async (req, _reply) => {
      const body = craftSchema.parse(req.body);
      return { state: service.craft(body.infantry, body.cavalry) };
    });

    app.post('/api/generals/start-training', async (req, _reply) => {
      const body = generalIdSchema.parse(req.body);
      return { state: service.startGeneralTraining(body.generalId) };
    });

    app.post('/api/generals/stop-training', async (req, _reply) => {
      const body = generalIdSchema.parse(req.body);
      return { state: service.stopGeneralTraining(body.generalId) };
    });

    app.post('/api/generals/dismiss-garrison', async (req, _reply) => {
      const body = generalIdSchema.parse(req.body);
      return { state: service.dismissGarrison(body.generalId) };
    });

    app.post('/api/armies/create', async (req, _reply) => {
      const body = armyCreateSchema.parse(req.body);
      return {
        state: service.createArmy({
          originCityId: body.originCityId,
          generalId: body.generalId,
          infantry: body.infantry,
          cavalry: body.cavalry,
          targetCityId: body.targetCityId,
          useTalisman: body.useTalisman,
        }),
      };
    });

    app.post('/api/armies/march', async (req, _reply) => {
      const body = armyMarchSchema.parse(req.body);
      return {
        state: service.march({
          armyId: body.armyId,
          targetCityId: body.targetCityId,
          useTalisman: body.useTalisman,
        }),
      };
    });

    app.post('/api/armies/cancel-march', async (req, _reply) => {
      const body = armyCancelSchema.parse(req.body);
      return { state: service.cancelMarch(body.armyId) };
    });

    app.post('/api/armies/transfer', async (req, _reply) => {
      const body = armyTransferSchema.parse(req.body);
      return {
        state: service.transfer({
          originCityId: body.originCityId,
          targetCityId: body.targetCityId,
          infantry: body.infantry,
          cavalry: body.cavalry,
          generalId: body.generalId,
        }),
      };
    });
  };
  return plugin;
}
