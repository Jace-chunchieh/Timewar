// 生成全国版数据文件：
//   data/cities.json            全部城市（334+，含 A市，含邻接/坐标/等级）
//   data/cities-national.json   全国层 34 省级节点
//   data/provinces.json         省元数据 + 真实省界接壤
//   data/province-distances.json 任意两省最短路径边数（神行符消耗表）
//   data/routes.json            全部路线（省内邻接 + 跨省真实接壤 + 海路）
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CITIES_RAW } from './cities-raw.mjs';
import { PROVINCES_RAW } from './provinces-raw.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });

// ---------- 投影（全国范围 lon 73~122.5 / lat 16~49） ----------
const MIN_LON = 73;
const MAX_LON = 132;
const MIN_LAT = 16;
const MAX_LAT = 52;
const W = 2000;
const H = 1400;
const PAD_X = 130;
const PAD_TOP = 110;
const PAD_BOTTOM = 90;

function project(lon, lat) {
  const x = PAD_X + ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * (W - PAD_X * 2);
  const y = PAD_TOP + ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * (H - PAD_TOP - PAD_BOTTOM);
  return [Math.round(x), Math.round(y)];
}

// ---------- 布局（最小间距迭代推开，锚定回拉保持地理形状） ----------
function layoutCities(list, minDist = 110, iters = 3000, maxStep = 4.5, anchor = 0.06) {
  const n = list.length;
  const px = list.map((c) => c.x);
  const py = list.map((c) => c.y);
  const ox = [...px];
  const oy = [...py];
  for (let iter = 0; iter < iters; iter++) {
    const fx = new Array(n).fill(0);
    const fy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[i] - px[j];
        const dy = py[i] - py[j];
        const d = Math.hypot(dx, dy);
        if (d >= minDist || d === 0) continue;
        const push = (minDist - d) / d;
        fx[i] += dx * push;
        fy[i] += dy * push;
        fx[j] -= dx * push;
        fy[j] -= dy * push;
      }
    }
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(fx[i], fy[i]);
      if (m > 0) {
        const step = Math.min(maxStep, m);
        px[i] += (fx[i] / m) * step;
        py[i] += (fy[i] / m) * step;
      }
      px[i] += (ox[i] - px[i]) * anchor;
      py[i] += (oy[i] - py[i]) * anchor;
      px[i] = Math.min(W - 120, Math.max(120, px[i]));
      py[i] = Math.min(H - 90, Math.max(70, py[i]));
    }
  }
  return list.map((c, i) => ({ ...c, x: Math.round(px[i]), y: Math.round(py[i]) }));
}

// ---------- 距离 ----------
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const kmBetween = (a, b) => haversineKm(a.lat, a.lon, b.lat, b.lon);

// ---------- 构建城市列表 ----------
// A市：虚拟初始城市（广东，广深之间，1级起步，随玩家最高真实城市等级动态升级）
const ACITY = { id: 'acity', name: 'A市', provinceId: 'gd', level: 1, lat: 22.9, lon: 113.85, virtual: true };

const rawCities = [...CITIES_RAW.map(([id, name, provinceId, level, lat, lon]) => ({ id, name, provinceId, level, lat, lon })), ACITY];
const cities = rawCities.map((c) => {
  const [x, y] = project(c.lon, c.lat);
  return { ...c, x, y, neighbors: [] };
});
const byId = new Map(cities.map((c) => [c.id, c]));
const citiesOfProvince = (pid) => cities.filter((c) => c.provinceId === pid);

// ---------- 省内邻接：距离阈值 + 每城最近 4 个同省邻居 ----------
for (const province of PROVINCES_RAW) {
  const cs = citiesOfProvince(province.id);
  for (let i = 0; i < cs.length; i++) {
    const others = cs
      .map((o, j) => ({ o, j, km: kmBetween(cs[i], o) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.km - b.km);
    const near = others.filter((x) => x.km <= 135).map((x) => x.o.id);
    const knn = others.slice(0, 4).map((x) => x.o.id);
    const ids = new Set([...near, ...knn]);
    cs[i].neighbors.push(...ids);
  }
}

// 邻接对称化：a 邻接 b 则 b 必须邻接 a
for (const c of cities) {
  for (const n of [...new Set(c.neighbors)]) {
    const other = byId.get(n);
    if (other && !other.neighbors.includes(c.id)) other.neighbors.push(c.id);
  }
}

// ---------- 跨省邻接：真实省界 → 边界最近城市对（LAND 取最近 2 对；SEA 固定对） ----------
const SEA_CITY_PAIRS = [
  ['gd', 'hi', ['zhanjiang', 'haikou']],
  ['gx', 'hi', ['beihai', 'haikou']],
  ['fj', 'tw', ['fuzhou', 'taipei']],
  ['gd', 'hk', ['shenzhen', 'hongkong']],
  ['gd', 'mo', ['zhuhai', 'macau']],
];

function addLink(aId, bId) {
  const a = byId.get(aId);
  const b = byId.get(bId);
  if (!a || !b) return false;
  if (!a.neighbors.includes(bId)) a.neighbors.push(bId);
  if (!b.neighbors.includes(aId)) b.neighbors.push(aId);
  return true;
}

for (const [p1, p2, ids] of SEA_CITY_PAIRS) {
  addLink(ids[0], ids[1]);
}

const provinceAdj = new Map(PROVINCES_RAW.map((p) => [p.id, []]));
for (const p of PROVINCES_RAW) {
  for (const n of p.neighbors) {
    const [pid, routeType] = n.split('|');
    if (routeType === 'SEA') continue; // 海路跨省由固定对处理
    if (!provinceAdj.get(p.id).includes(pid)) provinceAdj.get(p.id).push(pid);
    if (!provinceAdj.get(pid).includes(p.id)) provinceAdj.get(pid).push(p.id);
  }
}
for (const [p1, p2] of provinceAdj.entries()) {
  for (const p2id of p2) {
    if (p1 >= p2id) continue;
    const ca = citiesOfProvince(p1);
    const cb = citiesOfProvince(p2id);
    const pairs = [];
    for (const a of ca) for (const b of cb) pairs.push({ a, b, km: kmBetween(a, b) });
    pairs.sort((x, y) => x.km - y.km);
    let added = 0;
    for (const { a, b } of pairs) {
      if (added >= 2) break;
      if (addLink(a.id, b.id)) added++;
    }
  }
}

// ---------- A市 特殊邻接（广东内虚拟路线，含新手目标清远；只保留显式邻接） ----------
const ACITY_NEIGHBORS = ['guangzhou', 'shenzhen', 'dongguan', 'huizhou', 'zhongshan', 'qingyuan'];
byId.get('acity').neighbors = [...ACITY_NEIGHBORS];
for (const n of ACITY_NEIGHBORS) addLink('acity', n);

// ---------- 布局：按省分别布局（保持省内形状），再做全局轻量推开（处理省际过密） ----------
for (const province of PROVINCES_RAW) {
  const cs = citiesOfProvince(province.id);
  const laid = layoutCities(cs);
  for (const c of cs) {
    const l = laid.find((x) => x.id === c.id);
    c.x = l.x;
    c.y = l.y;
  }
}
const globalLaid = layoutCities(cities, 65, 2500, 2.5, 0.02);
for (const c of cities) {
  const g = globalLaid.find((x) => x.id === c.id);
  c.x = g.x;
  c.y = g.y;
}

// ---------- 校验 ----------
// 1. 连通性：从 A市 BFS 全部可达
const graph = new Map(cities.map((c) => [c.id, c.neighbors]));
const seen = new Set(['acity']);
const queue = ['acity'];
while (queue.length) {
  const cur = queue.shift();
  for (const n of graph.get(cur) ?? []) {
    if (!seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  }
}
const unreachable = cities.filter((c) => !seen.has(c.id));
if (unreachable.length > 0) {
  console.error(`不可达城市 ${unreachable.length} 个:`, unreachable.map((c) => c.name).join('、'));
  process.exit(1);
}
// 2. 每省最小间距
let globalMin = Infinity;
let globalPair = '';
for (let i = 0; i < cities.length; i++) {
  for (let j = i + 1; j < cities.length; j++) {
    const d = Math.hypot(cities[i].x - cities[j].x, cities[i].y - cities[j].y);
    if (d < globalMin) {
      globalMin = d;
      globalPair = `${cities[i].name}-${cities[j].name}`;
    }
  }
}
console.log(`全国最小间距: ${globalPair} ${globalMin.toFixed(1)}px`);
for (const province of PROVINCES_RAW) {
  const cs = citiesOfProvince(province.id);
  let min = Infinity;
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++)
      min = Math.min(min, Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y));
  if (min < 55) console.warn(`⚠ ${province.name} 最小间距 ${min.toFixed(1)}px`);
}
// 3. 清远新手邻接
if (!byId.get('qingyuan').neighbors.includes('acity')) {
  console.error('清远未邻接 A市，新手路线断裂');
  process.exit(1);
}

// ---------- 路线表 ----------
const routeMap = new Map();
for (const c of cities) {
  for (const n of c.neighbors) {
    const key = [c.id, n].sort().join('|');
    if (routeMap.has(key)) continue;
    const a = byId.get(c.id);
    const b = byId.get(n);
    if (!b) continue;
    const km = Math.round(kmBetween(a, b));
    const baseSeconds = Math.max(60, Math.round(((km / 100) * 600) / 5) * 5);
    let routeType = 'LAND';
    for (const [, , ids] of SEA_CITY_PAIRS) {
      if (ids.includes(c.id) && ids.includes(n)) routeType = 'SEA';
    }
    routeMap.set(key, { id: key, from: c.id, to: n, km, baseSeconds, routeType });
  }
}
const routes = [...routeMap.values()].sort((a, b) => a.id.localeCompare(b.id));

// ---------- 省份图与省距表 ----------
const provinceDist = (() => {
  const pids = PROVINCES_RAW.map((p) => p.id);
  const dist = new Map();
  for (const p of pids) {
    const d = new Map(pids.map((x) => [x, Infinity]));
    d.set(p, 0);
    const q = [p];
    while (q.length) {
      const cur = q.shift();
      for (const n of provinceAdj.get(cur) ?? []) {
        if (d.get(n) === Infinity) {
          d.set(n, d.get(cur) + 1);
          q.push(n);
        }
      }
    }
    for (const [k, v] of d) dist.set(`${p}|${k}`, v);
  }
  return dist;
})();
const provinceDistObj = {};
for (const [k, v] of provinceDist) provinceDistObj[k] = v;

// ---------- 输出 ----------
const finalCities = cities.map((c) => ({
  id: c.id,
  name: c.name,
  province: PROVINCES_RAW.find((p) => p.id === c.provinceId).name,
  provinceId: c.provinceId,
  level: c.level,
  x: c.x,
  y: c.y,
  lat: c.lat,
  lon: c.lon,
  neighbors: [...new Set(c.neighbors)].sort(),
  virtual: c.virtual ? true : undefined,
}));

const nationalCities = PROVINCES_RAW.map((p) => {
  const [x, y] = project(p.lon, p.lat);
  return { id: p.id, name: p.name, provinceId: p.id, x, y };
});
const nationalLaid = layoutCities(nationalCities, 120, 1200, 1.6, 0.04);

const provincesOut = PROVINCES_RAW.map((p) => ({
  id: p.id,
  name: p.name,
  neighbors: provinceAdj.get(p.id).sort(),
}));

writeFileSync(join(dataDir, 'cities.json'), JSON.stringify(finalCities, null, 2) + '\n');
writeFileSync(join(dataDir, 'cities-national.json'), JSON.stringify(nationalLaid, null, 2) + '\n');
writeFileSync(join(dataDir, 'provinces.json'), JSON.stringify(provincesOut, null, 2) + '\n');
writeFileSync(join(dataDir, 'province-distances.json'), JSON.stringify(provinceDistObj, null, 0) + '\n');
writeFileSync(join(dataDir, 'routes.json'), JSON.stringify(routes, null, 2) + '\n');

console.log(`城市: ${finalCities.length}（含 A市）| 路线: ${routes.length} | 省级节点: ${nationalCities.length}`);
console.log(`省内邻接阈值 135km + KNN4 | 跨省接壤对: ${provinceAdj.size} 省`);
const seaRoutes = routes.filter((r) => r.routeType === 'SEA');
console.log('海路:', seaRoutes.map((r) => `${r.from}-${r.to}`).join(', '));
console.log(`省距示例: 广东→广西=${provinceDistObj['gd|gx']} 广东→北京=${provinceDistObj['gd|bj']} 广东→新疆=${provinceDistObj['gd|xj']}`);
console.log('A市 邻接:', finalCities.find((c) => c.id === 'acity').neighbors.join('、'));
console.log('清远邻接含 A市:', finalCities.find((c) => c.id === 'qingyuan').neighbors.includes('acity'));
