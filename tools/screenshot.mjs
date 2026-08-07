// 临时脚本：截图验证地图布局与字体（npm run dev 运行时执行）
import { chromium } from 'playwright';

await fetch('http://localhost:5215/api/game/reset', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
await fetch('http://localhost:5215/api/tutorial/step', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ step: 0 }),
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5215/');
await page.waitForSelector('text=TIME WAR');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'map.png' });

await page.getByRole('button', { name: '人口与生产' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'production.png' });

await page.getByRole('button', { name: '军团' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'armies.png' });

await browser.close();
console.log('screenshots done');
