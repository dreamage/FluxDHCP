# ===== Stage 1: 系统依赖 + 安装依赖 =====
FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# ===== Stage 2: 构建 =====
FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

# ===== Stage 3: 生产镜像（干净基础，仅 COPY 必要文件）=====
# 关键优化：不再 FROM builder，避免继承全部构建层
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DB_PATH=/data/fluxdhcp.db
ENV NEXT_TELEMETRY_DISABLED=1
ENV WEB_PORT=3000

# 安装 libcap 仅用于 setcap，同一层内清理不增加体积
RUN apt-get update && \
    apt-get install -y --no-install-recommends libcap2-bin && \
    setcap cap_net_bind_service=ep $(which node) && \
    apt-get purge -y libcap2-bin && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# --- 从 standalone 输出复制 Next.js 运行时（~62MB vs 完整 ~1066MB）---
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# --- 复制自定义 DHCP 服务器编译产物 ---
COPY --from=builder /app/dist ./dist

# --- 复制 i18n 资源（运行时加载） ---
COPY --from=builder /app/i18n ./i18n

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs && \
    mkdir -p /home/nextjs && chown nextjs:nodejs /home/nextjs

RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME /data

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000/tcp 67/udp

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/docker-entrypoint.sh"]
