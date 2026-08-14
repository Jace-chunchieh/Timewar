import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  addCodeSchema,
  allocateSchema,
  armyCancelSchema,
  armyCreateSchema,
  armyMarchSchema,
  armyMemberSchema,
  armyReinforceSchema,
  armyTransferSchema,
  barbarianAttackSchema,
  batchTrainingSchema,
  bindEmailSchema,
  claimGiftSchema,
  craftSchema,
  garrisonAttackSchema,
  generalIdSchema,
  loginSchema,
  moveCapitalSchema,
  researchSchema,
  soloAttackSchema,
  speedupUseSchema,
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

    // 授权码校验：除登录接口外，所有请求须携带有效授权码（Header: x-auth-code）
    app.addHook('onRequest', (req, reply, done) => {
      if (req.url === '/api/auth/login') return done();
      const code = (req.headers['x-auth-code'] as string | undefined) ?? '';
      const info = service.authInfo(code);
      if (!info) {
        reply.code(401).send({ code: 'AUTH_REQUIRED', message: '请先使用授权码登录' });
        return done();
      }
      service.setCode(code);
      done();
    });

    const handle = (fn: () => unknown) => async () => {
      const result = await fn();
      return result;
    };

    // 登录与授权码管理
    app.post('/api/auth/login', async (req, _reply) => {
      const body = loginSchema.parse(req.body);
      return { auth: service.authLogin(body.code) };
    });

    app.post('/api/auth/add-code', async (req, _reply) => {
      const body = addCodeSchema.parse(req.body);
      return { auth: service.authAddCode(body.code, body.name) };
    });

    app.post('/api/auth/bind-email', async (req, _reply) => {
      const body = bindEmailSchema.parse(req.body);
      return { auth: service.authBindEmail(body.email) };
    });

    app.post('/api/auth/send-banner-gift', async (_req, _reply) => {
      return { sent: await service.sendBannerGift() };
    });

    app.post('/api/auth/claim-banner-gift', async (req, _reply) => {
      const body = claimGiftSchema.parse(req.body);
      return { state: service.claimBannerGift(body.code) };
    });

    app.post('/api/armies/solo-attack', async (req, _reply) => {
      const body = soloAttackSchema.parse(req.body);
      return {
        state: service.soloAttack({
          generalId: body.generalId,
          targetCityId: body.targetCityId,
          infantry: body.infantry,
          cavalry: body.cavalry,
          useTalisman: body.useTalisman,
        }),
      };
    });

    app.get('/api/auth/list', handle(() => ({ codes: service.authList() })));

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
          name: body.name,
          bannerGeneralId: body.bannerGeneralId,
          memberGeneralIds: body.memberGeneralIds,
          strategy: body.strategy,
          infantry: body.infantry,
          cavalry: body.cavalry,
        }),
      };
    });

    app.post('/api/armies/add-general', async (req, _reply) => {
      const body = armyMemberSchema.parse(req.body);
      return { state: service.armyAddGeneral(body.armyId, body.generalId) };
    });

    app.post('/api/armies/remove-general', async (req, _reply) => {
      const body = armyMemberSchema.parse(req.body);
      return { state: service.armyRemoveGeneral(body.armyId, body.generalId) };
    });

    app.post('/api/armies/reinforce', async (req, _reply) => {
      const body = armyReinforceSchema.parse(req.body);
      return { state: service.armyReinforce(body.armyId, body.infantry, body.cavalry) };
    });

    app.post('/api/items/use-speedup', async (req, _reply) => {
      const body = speedupUseSchema.parse(req.body);
      return { state: service.useSpeedup(body.targetType, body.targetId) };
    });

    app.post('/api/generals/batch-training', async (req, _reply) => {
      const body = batchTrainingSchema.parse(req.body);
      return { state: service.batchTraining(body.action) };
    });

    app.post('/api/city/move-capital', async (req, _reply) => {
      const body = moveCapitalSchema.parse(req.body);
      return { state: service.moveCapital(body.cityId) };
    });

    app.post('/api/barbarians/attack', async (req, _reply) => {
      const body = barbarianAttackSchema.parse(req.body);
      return {
        state: service.barbarianAttack({
          campId: body.campId,
          bannerGeneralId: body.bannerGeneralId,
          memberGeneralIds: body.memberGeneralIds,
          strategy: body.strategy,
          infantry: body.infantry,
          cavalry: body.cavalry,
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
          useTalisman: body.useTalisman,
        }),
      };
    });

    app.post('/api/armies/garrison-attack', async (req, _reply) => {
      const body = garrisonAttackSchema.parse(req.body);
      return {
        state: service.garrisonAttack({
          garrisonCityId: body.garrisonCityId,
          generalId: body.generalId,
          targetCityId: body.targetCityId,
          infantry: body.infantry,
          cavalry: body.cavalry,
          useTalisman: body.useTalisman,
        }),
      };
    });
  };
  return plugin;
}
