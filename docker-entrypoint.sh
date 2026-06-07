#!/bin/sh
set -e

# 确保数据目录存在且 nextjs 用户可写
mkdir -p /data
chown nextjs:nodejs /data

# 从 standalone/server.js 提取内嵌的 Next.js 配置并注入环境变量
# 这样我们的 dist/server.js 可以使用 NextServer 而无需 webpack
if [ -f /app/server.js ] && [ -z "$__NEXT_PRIVATE_STANDALONE_CONFIG" ]; then
  CONFIG=$(node -e "
    const fs = require('fs');
    const src = fs.readFileSync('/app/server.js', 'utf8');
    const m = src.match(/const nextConfig\s*=\s*(\{[\s\S]*?\})\s*\nprocess\.env\./);
    if (m) {
      try { JSON.parse(m[1]); process.stdout.write(m[1]); }
      catch(e) { /* not valid JSON as-is, skip */ }
    }
  " 2>/dev/null || true)
  if [ -n "$CONFIG" ]; then
    export __NEXT_PRIVATE_STANDALONE_CONFIG="$CONFIG"
  fi
fi

# 以 nextjs 用户身份启动服务
exec su -s /bin/sh -c "__NEXT_PRIVATE_STANDALONE_CONFIG=\"\$__NEXT_PRIVATE_STANDALONE_CONFIG\" node dist/server.js" nextjs
