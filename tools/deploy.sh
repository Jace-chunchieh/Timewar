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

# 权限自愈：Webhook 运行用户可能对工作区无写权限（git reset 需要写文件）
# 属主自行添加读写执行权限（无需 root）；目录属主为他人时此处会静默跳过
chmod -R u+rwX "$DIR" 2>/dev/null || true

# 解决 git 安全目录校验（dubious ownership，CVE-2022-24765）：
# Webhook 运行用户与仓库属主不一致时 git 会拒绝操作，此处自动加入白名单
if ! git config --global --get-all safe.directory 2>/dev/null | grep -qx "$DIR"; then
  git config --global --add safe.directory "$DIR"
  echo "[TimeWar] 已将 $DIR 加入 git safe.directory 白名单"
fi

echo "[TimeWar] 项目目录: $DIR"
echo "[TimeWar] 运行用户: $(whoami 2>/dev/null || echo '未知')"
echo "[TimeWar] 目录属主: $(ls -ld "$DIR" 2>/dev/null | awk '{print $3}')"
echo "[TimeWar] 远程仓库:"
git remote -v || true

echo "[TimeWar] 拉取代码 ($BRANCH)..."
# GitHub 大陆网络不稳定（时好时坏）：快速失败 + 自动重试 5 次
FETCH_OK=0
for attempt in 1 2 3 4 5; do
  echo "[TimeWar] git fetch 尝试 $attempt/5 ..."
  if git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 fetch origin "$BRANCH" 2>&1; then
    FETCH_OK=1
    break
  fi
  [ "$attempt" -lt 5 ] && echo "[TimeWar] 连接 GitHub 失败，10 秒后重试..." && sleep 10
done

if [ "$FETCH_OK" != "1" ]; then
  echo "[TimeWar] 连续 5 次 fetch 失败：服务器无法访问 github.com:443。"
  echo "[TimeWar] 中国大陆服务器建议改用 Gitee 镜像仓库（拉取源）："
  echo "  1) 到 gitee.com 注册并导入本仓库（新建仓库时选「导入 GitHub 仓库」）"
  echo "  2) 服务器执行: git remote set-url origin https://gitee.com/你的账号/Timewar.git"
  echo "  3) 重新触发本脚本即可"
  exit 1
fi

echo "[TimeWar] 本地当前提交: $(git log --oneline -1 HEAD 2>/dev/null || echo '无提交')"
echo "[TimeWar] 远程最新提交: $(git log --oneline -1 origin/$BRANCH 2>/dev/null || echo 'origin/$BRANCH 不存在')"

if ! git reset --hard "origin/$BRANCH" 2>&1; then
  echo "[TimeWar] git reset 失败（多为工作区写权限不足），请 SSH 执行："
  echo "  chown -R \$(whoami) $DIR"
  echo "  或  chmod -R 777 $DIR"
  exit 1
fi
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
