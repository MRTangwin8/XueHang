#!/usr/bin/env bash
# 学航 · 一键部署脚本（Docker）
#
#   ./deploy.sh                 构建并启动（首次安装、升级都用这一条）
#                               默认只监听本机 127.0.0.1:8080，由前面的 Nginx / IIS 等反向代理对外提供 HTTPS
#   PORT=9000 ./deploy.sh       换一个端口（默认 8080）
#   DIRECT=1 ./deploy.sh        不经反向代理，直接对外开放端口（HTTP 明文，仅用于内网或临时试用）
#   DOMAIN=crm.example.com ./deploy.sh
#                               同时启动自动申请 HTTPS 证书的反向代理（域名需已解析到本机，放行 80/443）
#   WITH_MYSQL=1 ./deploy.sh    镜像内预装 MySQL / MariaDB 驱动（不预装也可以，选择 MySQL 时会联网按需安装）
#   DB_NETWORK=1panel-network ./deploy.sh
#                               数据库也在 Docker 里（如 1Panel）时，把学航加入它的 Docker 网络，安装向导里就能直接填数据库容器名
#
#   ./deploy.sh token           查看安装码
#   ./deploy.sh logs            查看运行日志
#   ./deploy.sh backup          把 ./data 打包备份到 ./backups/
#   ./deploy.sh stop            停止
#   ./deploy.sh restart         重启
#   ./deploy.sh update          拉取最新代码并重新构建、启动
#
# 数据（配置、SQLite 数据库、上传文件）都在 ./data，不包含数据库服务。
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "没有找到 docker。请先安装 Docker：https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || die "Docker 没有运行，或当前用户没有权限（Linux 上可在命令前加 sudo，或把用户加入 docker 组）。"
if docker compose version >/dev/null 2>&1; then DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then DC=(docker-compose)
else die "没有找到 docker compose。请安装 Docker Compose 插件：https://docs.docker.com/compose/install/"; fi

# ---- 读取 / 保存本机配置（.env，仅供 docker compose 使用，不含密钥）----
ENV_FILE=.env
get() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
PORT="${PORT:-$(get PORT)}"; PORT="${PORT:-8080}"
DOMAIN="${DOMAIN-$(get DOMAIN)}"
WITH_MYSQL="${WITH_MYSQL:-$(get WITH_MYSQL)}"; WITH_MYSQL="${WITH_MYSQL:-0}"
TZ_VALUE="${TZ:-$(get TZ)}"; TZ_VALUE="${TZ_VALUE:-Asia/Shanghai}"
DB_NETWORK="${DB_NETWORK-$(get DB_NETWORK)}"
DIRECT="${DIRECT:-$(get DIRECT)}"; DIRECT="${DIRECT:-0}"
# 三种对外方式：DOMAIN=自带 Caddy 自动 HTTPS；DIRECT=1 直接开放端口；默认 = 只监听本机，交给你自己的反向代理
if [ -n "$DOMAIN" ]; then TRUST_PROXY=1; BIND=127.0.0.1; DIRECT=0; PROFILE=(--profile https)
elif [ "$DIRECT" = "1" ]; then TRUST_PROXY=0; BIND=0.0.0.0; PROFILE=()
else TRUST_PROXY=1; BIND=127.0.0.1; PROFILE=(); fi
save_env() {
  cat > "$ENV_FILE" <<EOF
# 由 deploy.sh 生成，可手动修改后重新运行 ./deploy.sh
PORT=$PORT
BIND=$BIND
DOMAIN=$DOMAIN
DIRECT=$DIRECT
TRUST_PROXY=$TRUST_PROXY
WITH_MYSQL=$WITH_MYSQL
DB_NETWORK=$DB_NETWORK
TZ=$TZ_VALUE
EOF
}

url() {
  if [ -n "$DOMAIN" ]; then echo "https://$DOMAIN"
  elif [ "$DIRECT" = "1" ]; then echo "http://<服务器IP>:$PORT"
  else echo "你的域名（先按部署指南配置 Nginx / IIS 反向代理到 http://127.0.0.1:$PORT）"; fi
}
health() { "${DC[@]}" exec -T app node -e "fetch('http://127.0.0.1:3001/api/install/status').then(r=>r.json()).then(j=>{console.log(j.installed?'installed':'install');}).catch(()=>{console.log('down');})" 2>/dev/null || echo down; }
show_token() {
  local t
  t=$("${DC[@]}" exec -T app sh -c 'cat "$DATA_DIR/.install-token" 2>/dev/null' || true)
  if [ -n "$t" ]; then echo; say "安装码：$t"; else warn "没有安装码：系统已经安装完成，或服务还没启动（./deploy.sh logs 查看日志）。"; fi
}

case "${1:-up}" in
  up|install|start)
    save_env
    # 加入外部 Docker 网络（如 1Panel 的 1panel-network）：生成 docker-compose.override.yml，compose 会自动合并
    if [ -n "$DB_NETWORK" ]; then
      docker network inspect "$DB_NETWORK" >/dev/null 2>&1 || die "找不到 Docker 网络 $DB_NETWORK（用 docker network ls 查看实际名称）"
      cat > docker-compose.override.yml <<EOF
# 由 deploy.sh 生成：把学航加入外部网络 $DB_NETWORK，安装向导中可直接填写数据库容器名
services:
  app:
    networks: [default, dbnet]
networks:
  dbnet:
    external: true
    name: $DB_NETWORK
EOF
      say "已加入 Docker 网络 $DB_NETWORK：安装向导的数据库主机可以直接填数据库容器名"
    else
      rm -f docker-compose.override.yml
    fi
    mkdir -p data
    say "构建镜像并启动（首次需要几分钟）…"
    "${DC[@]}" ${PROFILE[@]+"${PROFILE[@]}"} up -d --build --remove-orphans
    say "等待服务就绪…"
    state=down
    for _ in $(seq 1 90); do state=$(health); [ "$state" != "down" ] && break; sleep 2; done
    echo
    case "$state" in
      install)
        say "服务已启动，进入首次安装。"
        echo "    1. 浏览器打开：$(url)"
        echo "    2. 输入下面的安装码，按向导选择数据库（默认 SQLite 即可）、填写机构信息、选择行业模板、创建管理员。"
        show_token ;;
      installed)
        say "服务已启动：$(url)" ;;
      *)
        warn "服务还没有就绪，可能仍在同步数据库结构。请稍后运行 ./deploy.sh logs 查看日志。" ;;
    esac
    if [ "$DIRECT" = "1" ]; then warn "当前直接开放端口（HTTP 明文），仅建议在内网或临时试用。正式使用请去掉 DIRECT=1，改用反向代理 + HTTPS（见 docs/部署指南.md）。"
    elif [ -z "$DOMAIN" ]; then echo; say "服务只监听本机 127.0.0.1:$PORT。下一步：配置 Nginx / IIS 反向代理并启用 HTTPS（docs/部署指南.md 第 A4 节）。"; fi
    ;;
  token) show_token ;;
  logs) "${DC[@]}" ${PROFILE[@]+"${PROFILE[@]}"} logs -f --tail=200 ;;
  stop) "${DC[@]}" ${PROFILE[@]+"${PROFILE[@]}"} stop ;;
  restart) "${DC[@]}" ${PROFILE[@]+"${PROFILE[@]}"} restart ;;
  backup)
    [ -d data ] || die "没有 ./data 目录"
    mkdir -p backups
    f="backups/xuehang-$(date +%Y%m%d-%H%M%S).tar.gz"
    say "暂停服务以保证数据一致…"
    "${DC[@]}" stop app >/dev/null
    tar -czf "$f" data
    "${DC[@]}" start app >/dev/null
    say "已备份到 $f（使用外部 MySQL / PostgreSQL 时，数据库请另行用 mysqldump / pg_dump 备份）" ;;
  update)
    command -v git >/dev/null 2>&1 && [ -d .git ] || die "当前目录不是 git 仓库，请手动更新代码后运行 ./deploy.sh"
    say "拉取最新代码…"
    git pull --ff-only
    exec "$0" up ;;
  *) sed -n '2,18p' "$0"; exit 1 ;;
esac
