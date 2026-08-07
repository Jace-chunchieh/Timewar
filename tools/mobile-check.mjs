// 移动端适配检查：截图各页面 + 检查横向溢出
import { chromium } from 'playwright';

await fetch('http://localhost:5215/api/game/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
await fetch('http://localhost:5215/api/tutorial/step', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 0 }) });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await page.goto('http://localhost:5215/');
await page.waitForSelector('button:has-text("人口")', { timeout: 30000 });
await page.waitForTimeout(2500);

const report = {};

async function check(name) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollW: doc.scrollWidth, clientW: doc.clientWidth, overflowX: doc.scrollWidth > doc.clientWidth };
  });
  report[name] = overflow;
  await page.screenshot({ path: `m-${name}.png` });
}

// 生产
await page.getByRole('button', { name: '生产', exact: true }).click();
await check('production');
// 训练
await page.getByRole('button', { name: '训练', exact: true }).click();
await check('training');
// 更多菜单 → 编军/科技/战报/设置
await page.locator('nav button', { hasText: '更多' }).click();
await check('more-menu');
await page.getByRole('button', { name: '编军' }).click();
await check('craft');
await page.locator('nav button', { hasText: '更多' }).click();
await page.getByRole('button', { name: '科技研发' }).click();
await check('tech');
await page.locator('nav button', { hasText: '更多' }).click();
await page.getByRole('button', { name: '战报' }).click();
await check('reports');
await page.locator('nav button', { hasText: '更多' }).click();
await page.getByRole('button', { name: '设置' }).click();
await check('settings');
// 军团（含神行符表单）
await page.getByRole('button', { name: '军队', exact: true }).click();
await check('armies');
// 将领
await page.getByRole('button', { name: '将领', exact: true }).click();
await check('generals');

// 地图（全国层）
await page.getByRole('button', { name: '地图', exact: true }).click();
await check('map-national');
// 进入广东子图
await page.locator('[data-province="gd"]').click();
await page.waitForTimeout(1000);
const cityCount = await page.evaluate(() => document.querySelectorAll('[data-city]').length);
console.log('data-city count:', cityCount);
await check('map-province');
// 城市详情抽屉
await page.locator('[data-city="qingyuan"]').click({ timeout: 5000 }).catch((e) => console.log('city click fail:', String(e).slice(0, 80)));
const selected = await page.evaluate(() => !!document.querySelector('[data-city="qingyuan"] circle[stroke="#f0c96a"]'));
console.log('selected:', selected);
await page.getByRole('button', { name: /查看城市/ }).click().catch((e) => console.log('no sheet btn:', String(e).slice(0, 80)));
await page.waitForTimeout(500);
const sheetState = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim());
  return { sheetOpen: btns.some((t) => t === '✕'), hasOffense: btns.some((t) => t === '确认出征') };
});
console.log('sheet:', JSON.stringify(sheetState));
await check('city-sheet');
// 关闭抽屉（点顶部遮罩区域）
await page.mouse.click(195, 60);
await page.waitForTimeout(400);
const sheetClosed = await page.evaluate(() => ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '✕'));
console.log('sheet closed:', sheetClosed);

console.log(JSON.stringify(report, null, 2));
await browser.close();
