import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { numToIp } from '../lib/ip-utils';
import {
  PRAGMA_STATEMENTS,
  CREATE_TABLE_POOLS,
  CREATE_TABLE_RESERVATIONS,
  CREATE_TABLE_DEVICE_OPTIONS,
  CREATE_TABLE_LEASES,
  CREATE_TABLE_DHCP_LOGS,
  CREATE_TABLE_CONFIG,
  CREATE_TABLE_WEBHOOKS,
  CREATE_TABLE_MAC_NOTES,
  CREATE_TABLE_MAC_BLACKLIST,
  CREATE_TABLE_DECLINED_IPS,
  CREATE_TABLE_WEBHOOK_DELIVERIES,
  CREATE_TABLE_API_KEYS,
  CREATE_TABLE_ADMIN_SESSIONS,
  CREATE_INDEXES,
  SEED_CONFIG,
} from './schema';

let db: Database.Database | null = null;

/**
 * 获取数据库单例
 * 优先使用环境变量 DB_PATH，否则使用默认路径 ./data/fluxdhcp.db
 */
/**
 * 解析数据库文件路径（不初始化连接）
 */
export function resolveDbPath(dbPath?: string): string {
  return dbPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'fluxdhcp.db');
}

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = resolveDbPath(dbPath);

  // 确保数据目录存在
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);

  // 执行 PRAGMA 设置
  for (const pragma of PRAGMA_STATEMENTS) {
    db.pragma(pragma);
  }

  // 执行建表
  db.exec(CREATE_TABLE_POOLS);
  db.exec(CREATE_TABLE_RESERVATIONS);
  db.exec(CREATE_TABLE_DEVICE_OPTIONS);
  db.exec(CREATE_TABLE_LEASES);
  db.exec(CREATE_TABLE_DHCP_LOGS);
  db.exec(CREATE_TABLE_CONFIG);
  db.exec(CREATE_TABLE_WEBHOOKS);
  db.exec(CREATE_TABLE_MAC_NOTES);
  db.exec(CREATE_TABLE_MAC_BLACKLIST);
  db.exec(CREATE_TABLE_DECLINED_IPS);
  db.exec(CREATE_TABLE_WEBHOOK_DELIVERIES);
  db.exec(CREATE_TABLE_API_KEYS);
  db.exec(CREATE_TABLE_ADMIN_SESSIONS);

  // Migration: add body_mode column to webhooks if missing
  try {
    db.exec("ALTER TABLE webhooks ADD COLUMN body_mode TEXT DEFAULT 'json'");
  } catch { /* column already exists */ }

  // Migration: add direction column to dhcp_logs if missing
  try {
    db.exec("ALTER TABLE dhcp_logs ADD COLUMN direction TEXT DEFAULT 'recv'");
  } catch { /* column already exists */ }

  // Migration: add yiaddr/siaddr/giaddr columns to dhcp_logs if missing
  try { db.exec("ALTER TABLE dhcp_logs ADD COLUMN yiaddr TEXT"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE dhcp_logs ADD COLUMN siaddr TEXT"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE dhcp_logs ADD COLUMN giaddr TEXT"); } catch { /* column already exists */ }

  // Migration: add request_body column to webhook_deliveries if missing
  try { db.exec("ALTER TABLE webhook_deliveries ADD COLUMN request_body TEXT"); } catch { /* column already exists */ }

  // Migration: rename log_retention_days → dhcp_log_retention_days
  try { db.exec("UPDATE config SET key = 'dhcp_log_retention_days' WHERE key = 'log_retention_days'"); } catch { /* already migrated */ }

  // Migration: 纯数字 netmask（CIDR 前缀，如 24）转点分十进制，
  // 否则这类历史地址池过不了 isValidIPv4 校验，在界面上无法编辑。
  try {
    const legacy = db.prepare(
      "SELECT id, name, netmask FROM pools WHERE netmask GLOB '[0-9]*' AND netmask NOT LIKE '%.%'"
    ).all() as Array<{ id: number; name: string; netmask: string }>;

    if (legacy.length > 0) {
      const updateNetmask = db.prepare("UPDATE pools SET netmask = ?, updated_at = datetime('now') WHERE id = ?");
      for (const pool of legacy) {
        const prefix = Number(pool.netmask);
        if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
          console.warn(`[FluxDHCP] Pool "${pool.name}" has an unrecognized netmask "${pool.netmask}", left unchanged`);
          continue;
        }
        const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
        updateNetmask.run(numToIp(mask), pool.id);
        console.log(`[FluxDHCP] Migrated netmask of pool "${pool.name}": ${pool.netmask} -> ${numToIp(mask)}`);
      }
    }
  } catch (err) {
    console.error('[FluxDHCP] Failed to migrate numeric netmask values:', err);
  }

  // Migration: remove deprecated language config key
  try { db.exec("DELETE FROM config WHERE key = 'language'"); } catch { /* no-op */ }

  // 执行索引创建
  for (const indexSql of CREATE_INDEXES) {
    db.exec(indexSql);
  }

  // 插入初始配置
  db.exec(SEED_CONFIG);

  // 注册 IPv4 → 数值 自定义函数(供 SQL 层 IP 范围查询使用)
  db.function('ip2num', (ip: string): number => {
    if (!ip) return 0;
    const parts = ip.split('.');
    if (parts.length !== 4) return 0;
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const oct = parseInt(parts[i], 10);
      if (isNaN(oct) || oct < 0 || oct > 255) return 0;
      n = (n * 256) + oct;
    }
    return n >>> 0;
  });

  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
