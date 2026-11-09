#!/bin/sh
# 容器启动脚本：
#   1. 以 root 修正 /data 的属主（宿主机目录挂载进来时可能属于 root），然后降权为 node 用户运行；
#   2. 已安装（/data/.env 或环境变量里有 DATABASE_URL）时，先同步数据库结构（升级镜像后自动生效，不删除数据）；
#   3. 启动服务。尚未安装时进入安装模式，浏览器打开页面按向导完成安装。
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/uploads"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node "$0" "$@"
fi

cd /app/server

installed=0
[ -n "$DATABASE_URL" ] && installed=1
[ -f "$DATA_DIR/.env" ] && grep -q '^DATABASE_URL=' "$DATA_DIR/.env" && installed=1

if [ "$installed" = "1" ]; then
  echo "[xuehang] 同步数据库结构…"
  node --import tsx scripts/db-setup.ts
else
  echo "[xuehang] 尚未安装：请用浏览器打开本系统，按安装向导操作（安装码见下方日志，或 $DATA_DIR/.install-token）"
fi

exec node --import tsx src/index.ts
