# TimeWar · 现实时间人口战争游戏（全国版 MVP）

**版本：v2.0.0**（全国版 · 2026-08）

一款以现实世界时间持续运转的单人放置式战争经营游戏。玩家从虚拟城市 **A市**（位于广东、广州与深圳之间）出发，城市持续产生人口；把人口分配到武器 / 盔甲 / 战马生产、军事训练与科技研发，合成步兵、骑兵，由将领率军攻占全国 351 个城市节点。多占一座城市，人口增速提升。

本 MVP 依据 `TimeWar.md` 需求文档扩展开发（44 城粤桂琼 → 全国 333 地级行政区 + 虚拟 A市）。所有现实时间结算均由服务端基于时间戳差值权威计算，前端仅负责展示与预览。

## 版本记录

| 版本 | 内容 |
|---|---|
| **v2.0.0（当前）** | 全国地图（351 城市节点、两级地图、真实省界接壤）、虚拟初始城市 A市（随最高真实城市动态升级）、等级加权人口/训练容量、科技系统（科研院神行符 + 7 项科技）、神行符远征（按省距消耗）、存档版本化迁移 |
| v1.0.0 | 粤桂琼 44 城 MVP：人口/生产/训练/将领/军团/战斗/离线结算/新手引导 |

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Zustand + Tailwind CSS v4 |
| 后端 | Node.js + TypeScript + Fastify |
| 校验 | Zod |
| 数据库 | SQLite（better-sqlite3，WAL 模式） |
| 测试 | Vitest（单元 / 集成）+ Playwright（端到端） |
| 地图 | SVG 两级地图（全国 34 省级节点 → 各省子图，351 城市节点 / 1060 路线） |

## 快速开始

要求：Node.js ≥ 20（建议 22/24）。

```bash
npm install
npm run dev
```

打开浏览器访问 **http://localhost:5215**（端口可通过环境变量 `PORT` 修改，默认 5215）。

`npm run dev` 同时启动后端 API 与前端页面（开发模式使用 Vite 中间件，前后端同端口，前端热更新可用；修改后端代码后请重启）。

## 常用命令

```bash
npm run dev          # 开发模式（端口 5215）
npm start            # 生产模式：先构建，再以静态文件方式服务前端
npm run build        # 构建前端（vite build）
npm run typecheck    # TypeScript 全量类型检查
npm test             # 运行全部单元 / 集成测试（88 个用例）
npm run test:watch   # 测试监听模式
npm run test:e2e     # Playwright 端到端测试（约 12 分钟，需先 npm run dev；
                     #   首次需 npx playwright install chromium，
                     #   国内网络慢可设 $env:PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright"）
npm run reset        # 重置存档（删除 apps/server/data/game.db）
npm run generate:data# 重新生成 cities.json / routes.json / 省距表（坐标由真实经纬度投影 + 最小间距布局）
```

## 目录结构

```text
root/
├─ apps/
│  ├─ web/                     # React 前端
│  │  └─ src/
│  │     ├─ components/        # TopBar / 两级地图 / 城市面板 / 各功能页 / 科技页 / 离线报告 / 新手引导
│  │     ├─ lib/               # 格式化、客户端展示用预览计算、科技定义
│  │     └─ store.ts           # Zustand 全局状态（轮询 + 事件日志 + 地图层级）
│  └─ server/
│     ├─ src/
│     │  ├─ api/               # Fastify 路由（全部写操作）
│     │  ├─ engine/            # 纯逻辑游戏引擎（含科技 / A市动态等级 / 存档迁移，无 UI 依赖）
│     │  ├─ repositories/      # SQLite Repository 层（可替换为 MySQL/PostgreSQL）
│     │  ├─ services/          # 业务编排：校验 → 结算 → 执行 → 事务保存
│     │  └─ db/                # 数据库初始化
│     └─ data/game.db          # SQLite 存档（自动生成）
├─ packages/shared/            # 共享类型 + Zod Schema + 科技常量
├─ data/                       # 游戏配置（全部数值配置化）
│  ├─ cities.json              # 351 城（333 地级行政区 + A市 + 港澳台）：坐标/等级/邻接/省份
│  ├─ cities-national.json     # 全国层 34 省级节点（省会坐标投影）
│  ├─ provinces.json           # 省元数据 + 真实省界接壤
│  ├─ province-distances.json  # 任意两省最短路径边数（神行符消耗表）
│  ├─ routes.json              # 1060 条路线（省内邻接 + 跨省真实接壤 + 5 条海路）
│  └─ game-balance.json        # 全部核心数值
├─ tests/                      # Vitest 单元与 API 集成测试
│  └─ e2e/                     # Playwright 端到端测试
└─ tools/                      # 数据生成 / 存档重置脚本
```

## 核心规则速览

- **A市（虚拟初始城市）**：位于广东（广深之间），等级 = max(1, 玩家真实城市最高等级) 动态升级，开局 1 级。
- **人口**：每 10 秒产出 = Σ 已占领城市等级权重（1级+1 … 5级+5）× 军屯加成；余数毫秒持久化，不丢收益。
- **地图**：两级（全国 34 省级节点 → 各省子图）；省内允许虚拟路线（A市 虚拟邻接清远等），**跨省严格按真实省界接壤**。
- **生产**：1 人每秒 1 工作量；武器 3,000 / 盔甲 4,500 / 战马 9,000（冶炼科技加成）；人口可随时撤回，进度保留。
- **训练**：600 秒/批；容量 = Σ 已占领城市等级容量（1级 100 … 5级 500）；完成时 1/10,000 概率诞生将领；取消返还 50%。
- **合成**：步兵 = 训练人口 + 武器 + 盔甲；骑兵另 +1 战马；原子操作。
- **将领**：统帅 = (200 + (等级-1)×100) × (1 + 统帅之道)；训练 1 经验/秒（治军加成），升级需 300×等级²；战力加成 1 + 等级×0.02。
- **军团**：1 将领 + 步兵 + 骑兵；人数 ≤ 统帅上限；速度 = 步兵占比×1.0 + 骑兵占比×1.8（军驿加成）；海路 ×1.5。
- **战斗**：进攻战力（步兵×10 + 骑兵×18×0.7）× 将领加成 × 波动(0.95~1.05，battleId 种子固定)；防守战力 = 守军×14×(1+城防)；胜负后结算伤亡（攻城术减免）、装备回收（胜 40%/40%/25%，负 15%/15%/10%）、占领 / 返回（70% 行军时间）。
- **敌城**：按等级每 10 分钟增长守军至上限（5级上限 30,000）；初始守军由 cityId 种子生成并永久保存（清远新手固定 100）。
- **科技系统**：
  - 科研院：投入人口（≥10,000 基准）后每 10 秒按概率判定获得神行符：基础 0.01% + 每 100 人 +0.001%（神行符强化科技加成）。
  - 神行符：出征消耗 1~N 张突破接壤攻打任意省份城市，消耗 = 两省最短路径边数（接壤 1 张、隔 1 省 2 张…）；无直达路线按大圆距离兜底行军时间。
  - 科技树（一次性人口升级，永久生效）：攻城术（伤亡-1%/级）、军驿（速度+5%/级）、冶炼（生产+5%/级）、军屯（人口+5%/级）、治军（经验+5%/级）、统帅之道（统帅+5%/级）、神行符强化（概率×1.2/级）。
- **离线**：最多结算 24 小时；离线超过 60 秒生成离线报告弹窗；幂等结算，刷新不重复。

## API

```text
GET  /api/game/state            # 读取并推进状态
POST /api/game/new              # 新游戏
POST /api/game/advance          # 立即结算
POST /api/game/reset            # 重置存档
POST /api/tutorial/step         # 新手引导进度
POST /api/production/allocate   # 分配生产人口
POST /api/research/allocate     # 分配科研人口（神行符研发）
POST /api/tech/upgrade          # 科技升级（一次性人口投入）
POST /api/training/start | cancel
POST /api/soldiers/craft        # 合成士兵
POST /api/generals/start-training | stop-training | dismiss-garrison
POST /api/armies/create | march | cancel-march | transfer   # create/march 支持 useTalisman
GET  /api/battles               # 战报列表
```

所有写接口流程：校验请求 → 结算时间 → 校验状态 → 执行业务 → 事务保存 → 返回最新 GameState。错误统一为 `{ code, message, details }`。

## 服务器自动部署（宝塔面板 + GitHub Webhook）

**前置**：宝塔 Webhook 插件（若已有其他项目走 GitHub 自动部署则直接复用），服务器已装 Node ≥ 20 与 git。

1. **首次部署**（宝塔 SSH 终端）：
   ```bash
   cd /www/wwwroot
   git clone https://github.com/Jace-chunchieh/Timewar.git
   cd Timewar
   npm install && npm run build
   npm install -g pm2
   pm2 start npm --name timewar-server -- start   # 生产模式，端口 5215
   pm2 save && pm2 startup
   ```
2. **宝塔 Webhook 插件** → 添加：名称 `Timewar`，执行脚本：
   ```bash
   bash /www/wwwroot/Timewar/tools/deploy.sh /www/wwwroot/Timewar main
   ```
   保存并复制插件生成的 Webhook URL（`https://服务器IP:面板端口/hook?access_key=xxx`）。
3. **GitHub**：仓库 Settings → Webhooks → Add webhook：
   - Payload URL 粘贴上一步 URL（保持 HTTPS）
   - Content type `application/json`，事件选 `Just the push event`
4. **验证**：推送一次代码 → 宝塔 Webhook 日志显示 `部署完成` → 访问 `http://服务器IP:5215`。

> 注意：TimeWar 是全栈 Node 应用（非静态网页），`tools/deploy.sh` 会自动执行 `git pull → npm install → npm run build → pm2 restart`；若沿用旧项目的静态站脚本（仅 git pull）不会生效。存档位于 `apps/server/data/game.db`，部署不会丢失。

## 移动端适配

- 响应式断点：桌面端三栏布局（左导航 + 地图 + 右侧详情面板）；移动端（<1024px）隐藏左导航与右侧面板，使用**底部固定导航**（地图/生产/训练/军队/将领 + 更多菜单含编军/科技/战报/设置）。
- 城市详情在移动端以**底部抽屉**呈现（点击"查看城市 · 出征"浮出，可上滑浏览）。
- 顶部资源栏可横向滚动；SVG 地图节点带透明扩大点击区（触控目标 ≥44px）。
- 已用 390px 移动端视口自动化验证：全部页面无横向溢出，两级地图、城市点击、抽屉、神行符表单均可正常操作。

## 测试与验收

- `npm test`：88 个用例，覆盖需求文档第 22 节全部强制验收项（人口等级加权 / 生产 / 训练 / 合成 / 将领 / 战斗 / 离线）+ 全国数据断言（BFS 连通、间距、A市 邻接清远、省距表）+ 科技系统 + 神行符 + 存档迁移。
- `npm run test:e2e`：真实浏览器全流程——两级地图切换 → 新手引导 6 步 → 生产 → 训练 → 科技页 → 出征清远（行军约 12 分钟）→ 占领 → A市 升 2 级、+4/10 秒 → 刷新持久化 → 战报 → 离线报告弹窗（改库模拟离线，避免测试环境浏览器轮询干扰）。

## 设计说明

- 军团兵力从「可用士兵池」抽调；驻军通过占领或调兵产生。行军到达/战败返回时兵力并入驻军。
- A市 等级动态计算（不入存档），引擎与 UI 实时取值；占领高等级城市后立即生效。
- 客户端每秒对存档做「展示性推进」用于进度条/倒计时，真实数值以服务端 5 秒轮询为准。
- 邻接关系：省内由「距离阈值 135km + 最近 4 城」算法生成并对称化；跨省按真实省界接壤对取边界最近城市对（海路固定 5 对：湛江-海口、北海-海口、福州-台北、深圳-香港、珠海-澳门）。
- 存档版本化（当前 v2）：旧 44 城存档自动迁移（保留已占城市、补全国新城市为敌方、初始化科技），建议直接重置体验完整版。
- 已知注意事项：若浏览器标签长期开着游戏页面，页面轮询会持续刷新时间戳，因此「离线报告」需要真实关闭页面 60 秒以上才会弹出（符合"现实时间"设定）。

## 已知边界（MVP 明确不做）

多人在线、联盟、外交、金币/付费资源、建筑升级树、海军兵种、装备品质、抽卡、剧情、敌方主动反攻、侦察迷雾。城市等级为游戏内部平衡口径，非行政等级评价。
