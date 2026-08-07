// 验证地图城市节点间距（无重叠）+ 输出最近城市对
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5215/');
await page.waitForSelector('[data-city="guangzhou"]');

const result = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-city]')].map((g) => {
    const circle = g.querySelector('circle');
    return {
      id: g.getAttribute('data-city'),
      name: g.querySelector('text')?.textContent ?? '',
      cx: Number(circle?.getAttribute('cx')),
      cy: Number(circle?.getAttribute('cy')),
      fontSize: g.querySelector('text') ? Number(g.querySelector('text')?.getAttribute('font-size')) : 0,
    };
  });
  const pairs = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].cx - nodes[j].cx, nodes[i].cy - nodes[j].cy);
      pairs.push({ d, names: `${nodes[i].name}-${nodes[j].name}` });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  return {
    count: nodes.length,
    nearest: pairs.slice(0, 8),
    minDist: pairs[0]?.d,
    fontSizeSample: nodes[0].fontSize,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
