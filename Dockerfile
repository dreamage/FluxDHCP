# ===== Stage 1: 系统依赖 + 安装依赖 =====
FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ libcap2-bin && \
    rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# ===== Stage 2: 构建 =====
FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

# ===== Stage 3: 生产镜像（继承 builder，共享所有缓存层）=====
FROM builder AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DB_PATH=/data/fluxdhcp.db
ENV NEXT_TELEMETRY_DISABLED=1
ENV WEB_PORT=3000

# 移除 devDependencies，但保留 typescript（Next.js 运行时加载 next.config.ts 需要）
# 先将 typescript 从 devDependencies 移到 dependencies，再 prune
RUN node -e "const p=require('./package.json');p.dependencies.typescript=p.devDependencies.typescript;delete p.devDependencies.typescript;require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')" && \
    npm prune --omit=dev && \
    npm cache clean --force

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs && \
    mkdir -p /home/nextjs && chown nextjs:nodejs /home/nextjs

RUN setcap cap_net_bind_service=ep $(which node)

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME /data

EXPOSE 3000/tcp 67/udp

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/docker-entrypoint.sh"]
