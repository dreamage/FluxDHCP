#!/bin/sh
set -e

# 确保数据目录存在且 nextjs 用户可写
mkdir -p /data
chown nextjs:nodejs /data

# 以 nextjs 用户身份启动服务
exec su -s /bin/sh -c "node dist/server.js" nextjs
