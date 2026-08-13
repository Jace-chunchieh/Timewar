import { expect, test } from 'playwright/test';

async function resetGame() {
  const res = await fetch('http://localhost:5215/api/game/reset', {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json', 'x-auth-code': 'ainiyiwannian' },
  });
  expect(res.status).toBe(200);
}

async function setNumberInput(page: import('playwright/test').Page, ariaLabel: string, value: number) {
  await page.locator(`input[aria-label="${ariaLabel}"]`).fill(String(value));
}

test.describe.configure({ mode: 'serial' });

test('全国版完整流程：教程 → 两级地图 → 生产 → 训练 → 出征 → 占领 → A市升级 → 离线报告', async ({ page, request, browser }) => {
  await resetGame();
  await page.goto('/');

  // ---- 授权码登录（管理员）----
  await page.waitForSelector('text=授权码登录');
  await page.locator('input[type="password"]').fill('ainiyiwannian');
  await page.getByRole('button', { name: '进入游戏' }).click();

  // ---- 欢迎弹窗（新档展示一次）----
  await page.waitForSelector('text=开始游戏', { timeout: 30000 });
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.waitForSelector('text=新手引导 · 1/6', { timeout: 15000 });

  // ---- 全国层地图（标题可见）----
  await expect(page.locator('text=全国 · 点选省份进入')).toBeVisible();
  await expect(page.locator('text=1/351').first()).toBeVisible();

  // ---- 新手引导 6 步（第 5 步会自动进入广东省并选中清远）----
  await expect(page.locator('text=新手引导 · 1/6')).toBeVisible();
  for (let i = 1; i <= 6; i++) {
    await expect(page.locator(`text=新手引导 · ${i}/6`)).toBeVisible();
    await page.locator('button', { hasText: i === 6 ? '完成' : '下一步' }).click();
  }
  await expect(page.locator('text=新手引导')).toBeHidden();

  // ---- 教程结束后位于广东子图 ----
  await expect(page.locator('text=A市').first()).toBeVisible();
  // 面包屑返回全国
  await page.getByRole('button', { name: '全国' }).click();
  await expect(page.locator('text=全国 · 点选省份进入')).toBeVisible();
  // 重新进入广东子图
  await page.locator('[data-province="gd"]').click();
  await expect(page.locator('text=清远').first()).toBeVisible();

  // ---- 生产分配：武器 100 人 ----
  await page.getByRole('button', { name: '人口与生产' }).click();
  await setNumberInput(page, '武器制造分配人口', 100);
  await page.getByRole('button', { name: '应用分配' }).click();
  await expect(page.locator('text=武器制造').first()).toBeVisible();

  // ---- 训练 100 人（A市 1级容量 100）----
  await page.getByRole('button', { name: '训练', exact: true }).click();
  await setNumberInput(page, '训练人数', 100);
  await page.getByRole('button', { name: '开始训练' }).click();
  await expect(page.locator('text=批次 · 100 人')).toBeVisible();

  // ---- 科技页可访问 ----
  await page.getByRole('button', { name: '科技研发' }).click();
  await expect(page.locator('text=科研院 · 神行符')).toBeVisible();

  // ---- 编军页可访问 ----
  await page.getByRole('button', { name: '编军', exact: true }).click();
  await expect(page.locator('text=士兵合成')).toBeVisible();

  // ---- 军团：200 步兵进攻清远 ----
  await page.getByRole('button', { name: '军团' }).click();
  await expect(page.locator('text=组建军团并出征')).toBeVisible();
  await setNumberInput(page, '军团步兵', 200);
  // 多将领选择：点选第一名将领
  await page.locator('button:has-text("统帅")').first().click();
  await page.locator('label', { hasText: '目标城市' }).first().locator('select').selectOption('qingyuan');
  await expect(page.locator('text=预计胜率')).toBeVisible();
  await page.getByRole('button', { name: '确认出征' }).click();
  await expect(page.locator('text=行军中（1）')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: '撤回' })).toBeVisible();

  // ---- 从地图打开清远详情（可进攻）----
  await page.getByRole('button', { name: '世界地图' }).click();
  // 地图层级可能停留在广东子图（教程进入过），若在全国层先进入广东
  if (await page.locator('[data-province="gd"]').isVisible()) {
    await page.locator('[data-province="gd"]').click();
  }
  await page.locator('[data-tut="qingyuan"]').click();
  await expect(page.locator('text=敌方情报')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认出征' }).first()).toBeVisible();

  // ---- 等待行军到达并战斗（A市→清远约 12 分钟）----
  let captured = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(10_000);
    const res = await request.get('/api/game/state', { headers: { 'x-auth-code': 'ainiyiwannian' } });
    const s = await res.json();
    if (s.state.cities.length >= 2) {
      captured = true;
      break;
    }
  }
  expect(captured).toBe(true);

  // ---- 占领反馈：A市 升 2 级、+4/10秒 ----
  await page.reload();
  await page.waitForSelector('text=TIME WAR');
  await expect(page.locator('text=2/351').first()).toBeVisible();
  await expect(page.locator('text=+4/10秒').first()).toBeVisible();

  // ---- 战报页：胜利记录 ----
  await page.getByRole('button', { name: '战报', exact: true }).click();
  await expect(page.locator('text=胜利').first()).toBeVisible({ timeout: 10000 });

  // ---- 模拟离线：直接把存档的 lastCalculatedAt 拨回 70 秒（避免被浏览器轮询干扰）----
  // 注：真实离线行为已由单元/API 测试覆盖；此处直接改库模拟 70 秒离线
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const dbPath = join(process.cwd(), 'apps', 'server', 'data', 'game.db');
  const db = new DatabaseSync(dbPath);
  const row = db.prepare('SELECT state FROM game_state LIMIT 1').get() as { state: string };
  const st = JSON.parse(row.state);
  st.lastCalculatedAt = new Date(Date.now() - 70_000).toISOString();
  db.prepare('UPDATE game_state SET state = ?, updated_at = ?').run(JSON.stringify(st), Date.now());
  db.close();

  // 1) API 层验证离线报告已生成
  const offRes = await request.get('/api/game/state', { headers: { 'x-auth-code': 'ainiyiwannian' } });
  const offState = (await offRes.json()).state;
  expect(offState.offlineReport).toBeTruthy();
  expect(offState.offlineReport.offlineMs).toBeGreaterThan(60_000);

  // 2) 浏览器 UI 验证离线报告弹窗（独立浏览器实例，try/finally 保证关闭）
  const { chromium } = await import('playwright/test');
  const browser2 = await chromium.launch();
  try {
    const page2 = await browser2.newPage();
    await page2.goto('/');
    // 新上下文需重新授权码登录
    await page2.waitForSelector('text=授权码登录');
    await page2.locator('input[type="password"]').fill('ainiyiwannian');
    await page2.getByRole('button', { name: '进入游戏' }).click();
    await expect(page2.locator('text=离线报告').first()).toBeVisible({ timeout: 15000 });
    await page2.locator('button', { hasText: '确认' }).click();
    await expect(page2.locator('text=离线报告')).toBeHidden();
  } finally {
    await browser2.close();
  }
});
