#!/bin/bash
# TimeWar 自动部署脚本（配合宝塔 Webhook / GitHub Webhook 使用）
# 用法: bash deploy.sh <项目目录> [分支]
# 示例: bash deploy.sh /www/wwwroot/Timewar main
set -e

DIR="${1:-/www/wwwroot/Timewar}"
BRANCH="${2:-main}"

if [ ! -d "$DIR/.git" ]; then
  echo "[TimeWar] 目录不存在或不是 git 仓库: $DIR"
  echo "[TimeWar] 首次部署请先执行:"
  echo "  git clone https://github.com/Jace-chunchieh/Timewar.git $DIR"
  exit 1
fi

cd "$DIR"
echo "[TimeWar] 拉取代码 ($BRANCH)..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[TimeWar] 安装依赖..."
npm install --no-audit --no-fund

echo "[TimeWar] 构建前端..."
npm run build

echo "[TimeWar] 重启后端..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart timewar-server 2>/dev/null || pm2 start npm --name timewar-server -- start
  pm2 save 2>/dev/null || true
elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q timewar; then
  systemctl restart timewar
else
  echo "[TimeWar] 未检测到 pm2/systemd，请手动重启后端服务"
fi

echo "[TimeWar] 部署完成: $(date '+%Y-%m-%d %H:%M:%S')"
