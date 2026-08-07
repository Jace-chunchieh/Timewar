#!/usr/bin/env bash
# TimeWar 自动部署脚本（由 webhook 服务调用，也可手动执行）
# 用法: bash deploy/deploy.sh [仓库路径]
set -euo pipefail

REPO_DIR="${1:-/opt/timewar}"
cd "$REPO_DIR"

echo "[deploy] $(date) 开始部署 $REPO_DIR"

# 1. 拉取最新代码（main 分支）
git fetch origin
git reset --hard origin/main

# 2. 安装依赖（使用 lock 文件保证一致）
npm ci --no-audit --no-fund

# 3. 构建前端
npm run build

# 4. 重启游戏服务
sudo systemctl restart timewar

echo "[deploy] $(date) 部署完成"
