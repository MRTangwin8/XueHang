# 学航 · 教学管理平台 —— 单容器镜像（后端 + 前端页面，不含数据库服务）
#
# 数据库：默认用 SQLite（数据文件在 /data 卷里）；也可在安装向导中填写外部的 MySQL / MariaDB / PostgreSQL。
# 所有需要持久化的内容（配置 .env、SQLite 数据库、上传文件）都在 /data。
#
#   docker build -t xuehang .
#   docker run -d --init -p 8080:3001 -v xuehang-data:/data --name xuehang xuehang
#
# 可选构建参数：--build-arg WITH_MYSQL=1  预装 MySQL / MariaDB 驱动（mariadb，LGPL-2.1）。
# 不预装时，选择 MySQL 后会在容器内联网按需安装。

# ---------- 1. 构建前端 ----------
FROM node:24-bookworm AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY web web
RUN npm run build -w web

# ---------- 2. 后端运行依赖 + Prisma 客户端 ----------
FROM node:24-bookworm AS server
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace server --omit=dev --no-audit --no-fund
ARG WITH_MYSQL=0
RUN if [ "$WITH_MYSQL" = "1" ]; then npm install --no-save --no-audit --no-fund --workspace server @prisma/adapter-mariadb@7.10.1 mariadb; fi
COPY server server
# 生成默认（SQLite）的 Prisma 客户端；换用其他数据库时由启动脚本 / 安装向导重新生成
RUN cd server && DATABASE_URL="file:./prisma/build.db" npx prisma generate

# ---------- 3. 运行镜像 ----------
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3001 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    npm_config_update_notifier=false
WORKDIR /app
COPY --chown=node:node package.json package-lock.json LICENSE NOTICE ./
COPY --from=server --chown=node:node /app/node_modules node_modules
COPY --from=server --chown=node:node /app/server server
COPY --chown=node:node web/package.json web/package.json
COPY --from=web --chown=node:node /app/web/dist web/dist
COPY docker/entrypoint.sh /usr/local/bin/xuehang-entrypoint
RUN chmod +x /usr/local/bin/xuehang-entrypoint && mkdir -p /data && chown node:node /data /app
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["xuehang-entrypoint"]
