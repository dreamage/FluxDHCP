import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  PRAGMA_STATEMENTS,
  CREATE_TABLE_POOLS,
  CREATE_TABLE_RESERVATIONS,
  CREATE_TABLE_DEVICE_OPTIONS,
  CREATE_TABLE_LEASES,
  CREATE_TABLE_LOGS,
  CREATE_TABLE_CONFIG,
  CREATE_TABLE_WEBHOOKS,
  CREATE_TABLE_MAC_NOTES,
  CREATE_TABLE_DECLINED_IPS,
  CREATE_TABLE_WEBHOOK_DELIVERIES,
  CREATE_INDEXES,
  SEED_CONFIG,
} from './schema';

let db: Database.Database | null = null;

/**
 * 获取数据库单例
 * 优先使用环境变量 DB_PATH，否则使用默认路径 ./data/fluxdhcp.db
 */
export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'fluxdhcp.db');

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
  db.exec(CREATE_TABLE_LOGS);
  db.exec(CREATE_TABLE_CONFIG);
  db.exec(CREATE_TABLE_WEBHOOKS);
  db.exec(CREATE_TABLE_MAC_NOTES);
  db.exec(CREATE_TABLE_DECLINED_IPS);
  db.exec(CREATE_TABLE_WEBHOOK_DELIVERIES);

  // Migration: add body_mode column to webhooks if missing
  try {
    db.exec("ALTER TABLE webhooks ADD COLUMN body_mode TEXT DEFAULT 'json'");
  } catch { /* column already exists */ }

  // Migration: add direction column to logs if missing
  try {
    db.exec("ALTER TABLE logs ADD COLUMN direction TEXT DEFAULT 'recv'");
  } catch { /* column already exists */ }

  // Migration: add yiaddr/siaddr/giaddr columns to logs if missing
  try { db.exec("ALTER TABLE logs ADD COLUMN yiaddr TEXT"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE logs ADD COLUMN siaddr TEXT"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE logs ADD COLUMN giaddr TEXT"); } catch { /* column already exists */ }

  // 执行索引创建
  for (const indexSql of CREATE_INDEXES) {
    db.exec(indexSql);
  }

  // 插入初始配置
  db.exec(SEED_CONFIG);

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
