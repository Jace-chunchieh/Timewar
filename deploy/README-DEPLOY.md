# TimeWar 腾讯云自动部署指南

GitHub 推送 `main` 分支 → Webhook 通知腾讯云服务器 → 自动拉取代码、安装依赖、构建、重启服务。

```
GitHub 仓库 push(main)
   │  POST http://<服务器公网IP>:9000/hook（HMAC-SHA256 签名）
   ▼
webhook-server.mjs（校验签名）
   ▼
deploy.sh（git reset --hard origin/main → npm ci → npm run build → systemctl restart timewar）
```

## 一、服务器准备（一次性）

```bash
# 1. 安装 Node.js 20+（Ubuntu/Debian 示例）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # 应显示 v20+

# 2. 克隆仓库（建议 /opt/timewar）
sudo mkdir -p /opt && sudo chown $USER /opt
git clone https://github.com/Jace-chunchieh/Timewar.git /opt/timewar
cd /opt/timewar

# 3. 首次手动构建（验证可运行）
npm ci --no-audit --no-fund
npm run build
PORT=5215 npm run start --workspace apps/server &
curl http://localhost:5215/   # 应返回 HTML
```

## 二、配置 systemd 服务

```bash
# 1. 生成随机 Secret（记下来，稍后填到 GitHub）
openssl rand -hex 24

# 2. 编辑 webhook 服务配置，替换用户名与 Secret
nano /opt/timewar/deploy/timewar-webhook.service   # User=你的用户名、WEBHOOK_SECRET=上面的随机串

# 3. 安装服务单元
sudo cp /opt/timewar/deploy/timewar.service        /etc/systemd/system/
sudo cp /opt/timewar/deploy/timewar-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload

# 4. 启动并设为开机自启
sudo systemctl enable --now timewar
sudo systemctl enable --now timewar-webhook

# 5. 确认状态
sudo systemctl status timewar          # active (running)
sudo systemctl status timewar-webhook  # active (running)
curl http://localhost:5215/            # 游戏页面
```

## 三、腾讯云安全组放行端口

云服务器控制台 → 安全组 → 入站规则添加：

| 协议 | 端口 | 来源 | 用途 |
|---|---|---|---|
| TCP | 5215 | 0.0.0.0/0 | 游戏访问 |
| TCP | 9000 | 0.0.0.0/0 | Webhook 接收（建议后续改为仅 GitHub 出口 IP 或加防火墙） |

## 四、GitHub 配置 Webhook

仓库页面 → **Settings → Webhooks → Add webhook**：

- **Payload URL**：`http://<服务器公网IP>:9000/hook`
- **Content type**：`application/json`
- **Secret**：填第二步生成的随机串（与 `timewar-webhook.service` 中 `WEBHOOK_SECRET` 完全一致）
- **SSL verification**：默认（无 HTTPS 时不影响）
- **Which events**：选 **Just the push event**
- 点击 **Add webhook**

添加成功后 GitHub 会发送一次 `ping` 事件（webhook 服务对非 push 事件返回 200 忽略），页面显示绿色 ✓。

## 五、验证自动部署

```bash
# 1. 服务器查看 webhook 日志
sudo journalctl -u timewar-webhook -f
sudo journalctl -u timewar -f

# 2. 本地修改任意文件并推送
git add -A && git commit -m "test: 自动部署验证" && git push

# 3. 观察日志：应出现「收到 push，开始部署」→「部署结束: 成功」
# 4. 等待 30~60 秒后访问 http://<服务器公网IP>:5215 确认新内容生效
```

## 六、手动触发部署

```bash
bash /opt/timewar/deploy/deploy.sh
```

## 七、进阶建议（可选）

- **HTTPS**：用 Nginx 反代 5215 与 9000，配置 Let's Encrypt 证书（webhook 支持 GitHub 的 SSL 校验）。
- **防火墙**：`sudo ufw allow 5215/tcp && sudo ufw allow 9000/tcp`（若使用 UFW）。
- **数据库备份**：定期备份 `/opt/timewar/apps/server/data/game.db`；部署脚本不会删除存档。
- **回滚**：`git -C /opt/timewar log --oneline -5` 找到上个提交，`git -C /opt/timewar reset --hard <sha>` 后 `sudo systemctl restart timewar`。

## 安全说明

- Webhook 端口 9000 仅用于接收 GitHub 请求，已做 HMAC-SHA256 签名校验；`WEBHOOK_SECRET` 请使用强随机值且不要提交到仓库。
- 若不想开放 9000 端口，可改为 Nginx 反代 + HTTPS，或使用腾讯云 CODING / 云托管等平台的官方 Webhook 方案。
