import { createServer } from 'http';
import { parse } from 'url';
import fs from 'fs';
import path from 'path';
import { dhcpInstance } from './lib/dhcp-instance';
import { initDb, closeDb, getDb } from './lib/db-instance';

const dev = process.env.NODE_ENV !== 'production';
const hostname = dev ? 'localhost' : '0.0.0.0';
const port = parseInt(process.env.WEB_PORT || '3000', 10);

// 确保 cwd 为项目根目录（dist/server.js 的上一级）
if (!dev) {
  process.chdir(path.resolve(__dirname, '..'));
}

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

  // 3. 启动 Next.js 服务器
  let server: any;

  if (dev) {
    // 开发模式：使用 next() 完整功能（含 HMR、webpack）
    const next = (await import('next')).default;
    const app = next({ dev, hostname, port });
    const handle = app.getRequestHandler();
    await app.prepare();

    server = createServer(async (req: any, res: any) => {
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

    await new Promise<void>((resolve, reject) => {
      server.listen(port, hostname, () => {
        console.log(`[FluxDHCP] Web server running at http://${hostname}:${port}`);
        resolve();
      });
      server.on('error', reject);
    });
  } else {
    // 生产模式：使用 startServer（与 standalone server.js 完全一致的方式）
    // 读取 required-server-files.json 获取 Next.js 配置
    const configPath = path.join(process.cwd(), '.next', 'required-server-files.json');
    let nextConfig: any;
    if (fs.existsSync(configPath)) {
      const { config } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      nextConfig = config;
      process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
    }

    const { startServer } = await import('next/dist/server/lib/start-server') as any;
    server = await startServer({
      dir: process.cwd(),
      isDev: false,
      config: nextConfig,
      hostname,
      port,
      allowRetry: false,
    });

    console.log(`[FluxDHCP] Web server running at http://${hostname}:${port}`);
  }

  // 4. 启动 DHCP 服务（如果配置启用）
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

  // 5. 优雅关闭
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
