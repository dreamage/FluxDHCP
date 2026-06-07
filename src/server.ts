import { createServer } from 'http';
import { parse } from 'url';
import { dhcpInstance } from './lib/dhcp-instance';
import { initDb, closeDb, getDb } from './lib/db-instance';

const dev = process.env.NODE_ENV !== 'production';
const hostname = dev ? 'localhost' : '0.0.0.0';
const port = parseInt(process.env.WEB_PORT || '3000', 10);

// 全局未捕获异常处理
process.on('uncaughtException', (err) => {
  console.error('[FluxDHCP] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FluxDHCP] Unhandled rejection:', reason);
});

async function main() {
  // 1. 初始化数据库
  try {
    initDb();
    console.log('[FluxDHCP] Database initialized');
  } catch (err) {
    console.error('[FluxDHCP] Failed to initialize database:', err);
    process.exit(1);
  }

  // 2. 初始化 DHCP 实例（传入数据库连接）
  const db = getDb();
  dhcpInstance.init(db);
  dhcpInstance.startLogCleanup();

  // 3. 创建 Next.js 请求处理器
  let handle: any;

  if (dev) {
    // 开发模式：使用 next() 完整功能（含 HMR、webpack）
    const next = (await import('next')).default;
    const app = next({ dev, hostname, port });
    handle = app.getRequestHandler();
    await app.prepare();
  } else {
    // 生产模式：使用 NextServer 直接启动（standalone 兼容，无需 webpack）
    const { default: NextServer } = await import('next/dist/server/next-server');
    const nextServer = new NextServer({
      dir: process.cwd(),
      dev: false,
      hostname,
      port,
      conf: process.env.__NEXT_PRIVATE_STANDALONE_CONFIG
        ? JSON.parse(process.env.__NEXT_PRIVATE_STANDALONE_CONFIG)
        : undefined,
    });
    handle = nextServer.getRequestHandler();
  }

  console.log('[FluxDHCP] Next.js prepared');

  // 4. 创建 HTTP Server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('[FluxDHCP] Error handling request:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  server.on('error', (err) => {
    console.error('[FluxDHCP] HTTP server error:', err);
  });

  // 5. 启动 HTTP Server
  await new Promise<void>((resolve, reject) => {
    server.listen(port, hostname, () => {
      console.log(`[FluxDHCP] Web server running at http://${hostname}:${port}`);
      resolve();
    });
    server.on('error', reject);
  });

  // 6. 启动 DHCP 服务（如果配置启用）
  const row = db.prepare("SELECT value FROM config WHERE key = 'dhcp_enabled'").get() as { value: string } | undefined;
  if (row?.value === '1') {
    try {
      await dhcpInstance.start();
      console.log('[FluxDHCP] DHCP server started on UDP 67');
    } catch (err: any) {
      console.error('[FluxDHCP] Failed to start DHCP server:', err?.message || err);
      if (err?.code === 'EACCES') {
        console.error('[FluxDHCP] Hint: Binding UDP 67 requires root or NET_ADMIN capability');
      } else if (err?.code === 'EADDRINUSE') {
        console.error('[FluxDHCP] Hint: UDP port 67 is already in use by another DHCP server');
      }
    }
  } else {
    console.log('[FluxDHCP] DHCP server is disabled in config');
  }

  // 7. 优雅关闭
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('[FluxDHCP] Shutting down...');
    try {
      await dhcpInstance.stop();
    } catch (err) {
      console.error('[FluxDHCP] Error stopping DHCP server:', err);
    }

    server.close(() => {
      try {
        closeDb();
      } catch (err) {
        console.error('[FluxDHCP] Error closing database:', err);
      }
      process.exit(0);
    });

    // 强制退出超时（5秒）
    setTimeout(() => {
      console.error('[FluxDHCP] Forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[FluxDHCP] Fatal error:', err);
  process.exit(1);
});
