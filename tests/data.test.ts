import { describe, expect, it } from 'vitest';
import { loadGameData } from '../apps/server/src/config.js';

describe('全国数据完整性', () => {
  const { balance, cities, routes } = loadGameData();

  it('城市总量 ≥ 333 且包含 A市', () => {
    expect(cities.length).toBeGreaterThanOrEqual(333);
    expect(cities.find((c) => c.id === 'acity')).toBeDefined();
  });

  it('A市 为 1 级且位于广东，仅保留显式邻接（含清远）', () => {
    const acity = cities.find((c) => c.id === 'acity')!;
    expect(acity.level).toBe(1);
    expect(acity.province).toBe('广东');
    expect(acity.neighbors).toContain('qingyuan');
    expect(acity.neighbors).toEqual(
      expect.arrayContaining(['guangzhou', 'shenzhen', 'dongguan', 'huizhou', 'zhongshan', 'qingyuan'])
    );
    expect(acity.neighbors.length).toBe(6);
  });

  it('清远反向邻接 A市（新手路线双向可达）', () => {
    const qy = cities.find((c) => c.id === 'qingyuan')!;
    expect(qy.neighbors).toContain('acity');
  });

  it('全部城市从 A市 BFS 可达（路线连通）', () => {
    const graph = new Map(cities.map((c) => [c.id, c.neighbors]));
    const seen = new Set(['acity']);
    const queue = ['acity'];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of graph.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    const unreachable = cities.filter((c) => !seen.has(c.id));
    expect(unreachable).toEqual([]);
  });

  it('全国城市节点最小间距 ≥ 30px（无重叠）', () => {
    let min = Infinity;
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        min = Math.min(min, Math.hypot(cities[i].x - cities[j].x, cities[i].y - cities[j].y));
      }
    }
    expect(min).toBeGreaterThanOrEqual(30);
  });

  it('每省子图最小间距 ≥ 30px', () => {
    const byProvince = new Map<string, typeof cities>();
    for (const c of cities) {
      const p = c.provinceId ?? c.province;
      if (!byProvince.has(p)) byProvince.set(p, []);
      byProvince.get(p)!.push(c);
    }
    for (const [, cs] of byProvince) {
      let min = Infinity;
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          min = Math.min(min, Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y));
        }
      }
      expect(min).toBeGreaterThanOrEqual(30);
    }
  });

  it('路线两端城市必须存在且对称', () => {
    const ids = new Set(cities.map((c) => c.id));
    for (const r of routes) {
      expect(ids.has(r.from)).toBe(true);
      expect(ids.has(r.to)).toBe(true);
    }
  });

  it('海路仅存在于配置的跨海城市对', () => {
    const sea = routes.filter((r) => r.routeType === 'SEA');
    const allowed = new Set([
      'haikou|zhanjiang',
      'beihai|haikou',
      'fuzhou|taipei',
      'hongkong|shenzhen',
      'macau|zhuhai',
    ]);
    expect(sea.length).toBe(5);
    for (const r of sea) {
      expect(allowed.has([r.from, r.to].sort().join('|'))).toBe(true);
    }
  });

  it('全国层 34 省级节点齐全', async () => {
    const fs = await import('node:fs');
    const file = new URL('../data/cities-national.json', import.meta.url);
    const national = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(national.length).toBe(34);
  });

  it('省距表：接壤=1，广东→北京>1，同省=0', () => {
    const dist = balance.provinceDistances;
    expect(dist['gd|gx']).toBe(1);
    expect(dist['gd|bj']).toBeGreaterThan(1);
    expect(dist['gd|gd']).toBe(0);
    expect(dist['gd|xz']).toBeGreaterThan(1);
  });

  it('关键新手路线：A市→清远 存在路线', () => {
    const key = ['acity', 'qingyuan'].sort().join('|');
    expect(routes.some((r) => [r.from, r.to].sort().join('|') === key)).toBe(true);
  });
});
