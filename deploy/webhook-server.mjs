// TimeWar Webhook 接收器（零依赖，Node 内置模块）
// 校验 GitHub HMAC 签名后执行 deploy/deploy.sh
// 环境变量:
//   WEBHOOK_SECRET  - GitHub Webhook 配置的 Secret（必填，与 GitHub 一致）
//   WEBHOOK_PORT    - 监听端口（默认 9000）
//   DEPLOY_SCRIPT   - 部署脚本路径（默认 /opt/timewar/deploy/deploy.sh）
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';

const SECRET = process.env.WEBHOOK_SECRET || 'change-me';
const PORT = Number(process.env.WEBHOOK_PORT || 9000);
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || '/opt/timewar/deploy/deploy.sh';

function verifySignature(rawBody, signature) {
  if (!signature) return false;
  const expected = 'sha256=' + createHmac('sha256', SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/hook') {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (!verifySignature(body, req.headers['x-hub-signature-256'])) {
      console.log(new Date().toISOString(), '签名校验失败');
      res.writeHead(401);
      res.end('invalid signature');
      return;
    }
    // 仅 main 分支推送触发部署
    let ref = '';
    try {
      ref = JSON.parse(body.toString()).ref || '';
    } catch {
      /* 忽略解析失败 */
    }
    if (!ref.endsWith('/main')) {
      console.log(new Date().toISOString(), '非 main 分支事件，忽略');
      res.writeHead(200);
      res.end('ignored');
      return;
    }
    res.writeHead(202);
    res.end('deploying');
    console.log(new Date().toISOString(), '收到 push，开始部署');
    const child = execFile('bash', [DEPLOY_SCRIPT], { cwd: '/', timeout: 600_000 }, (err) => {
      console.log(new Date().toISOString(), '部署结束:', err ? `失败 ${err.message}` : '成功');
    });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TimeWar webhook 监听于 :${PORT}（secret 长度 ${SECRET.length}）`);
});
