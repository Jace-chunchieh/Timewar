#!/bin/bash
# TimeWar 自动部署脚本（宝塔 Node 项目 + GitHub Webhook 版，无 pm2）
# 用法: bash deploy.sh <项目目录> [分支] [端口]
# 示例: bash deploy.sh /www/wwwroot/Timewar main 5215
#
# 原理：项目由宝塔「网站 → Node 项目」守护运行（崩溃自动拉起、开机自启）。
# 本脚本只负责拉代码 + 构建 + 重启端口进程；进程被 kill 后宝塔守护会在数秒内自动拉起。
set -e

DIR="${1:-/www/wwwroot/Timewar}"
BRANCH="${2:-main}"
PORT="${3:-5215}"

if [ ! -d "$DIR/.git" ]; then
  echo "[TimeWar] 目录不存在或不是 git 仓库: $DIR"
  echo "[TimeWar] 首次部署请先执行:"
  echo "  git clone https://github.com/Jace-chunchieh/Timewar.git $DIR"
  exit 1
fi

cd "$DIR"
echo "[TimeWar] 项目目录: $DIR"
echo "[TimeWar] 远程仓库:"
git remote -v || true

echo "[TimeWar] 拉取代码 ($BRANCH)..."
if ! git fetch origin "$BRANCH" 2>&1; then
  echo "[TimeWar] git fetch 失败，请检查："
  echo "  1. 远程地址是否正确（上面 remote -v 输出）"
  echo "  2. 目录写权限：chown -R 当前用户 /www/wwwroot/Timewar"
  exit 1
fi

echo "[TimeWar] 本地当前提交: $(git log --oneline -1 HEAD 2>/dev/null || echo '无提交')"
echo "[TimeWar] 远程最新提交: $(git log --oneline -1 origin/$BRANCH 2>/dev/null || echo 'origin/$BRANCH 不存在')"

git reset --hard "origin/$BRANCH"
echo "[TimeWar] 更新后提交: $(git log --oneline -1 HEAD)"

echo "[TimeWar] 安装依赖..."
npm install --no-audit --no-fund

echo "[TimeWar] 构建前端..."
npm run build

echo "[TimeWar] 重启后端（kill 端口 $PORT 进程，宝塔守护自动拉起）..."
if command -v lsof >/dev/null 2>&1; then
  kill "$(lsof -ti tcp:$PORT)" 2>/dev/null || true
elif command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
else
  pkill -f "tsx src/index.ts" 2>/dev/null || true
fi

echo "[TimeWar] 等待宝塔守护拉起进程..."
for i in $(seq 1 15); do
  sleep 2
  if curl -sf "http://127.0.0.1:$PORT/api/game/state" >/dev/null 2>&1; then
    echo "[TimeWar] 服务已恢复: http://127.0.0.1:$PORT"
    echo "[TimeWar] 部署完成: $(date '+%Y-%m-%d %H:%M:%S')"
    exit 0
  fi
done

echo "[TimeWar] 警告: 30 秒内服务未恢复，请到宝塔面板「网站 → Node 项目」手动重启该项目。"
echo "[TimeWar] 日志可在宝塔 Node 项目页面或 pm2 查看（如项目使用）"
exit 1
