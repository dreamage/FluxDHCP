import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { ipToNum } from '@/lib/ip-utils';
import { dhcpInstance } from '@/lib/dhcp-instance';

type TrendUnit = 'hour' | 'day';

interface TrendPoint {
  /** 桶起始时间 (ISO 8601 UTC，前端转本地时区显示) */
  t: string;
  /** 该桶事件总数 */
  count: number;
  /** 各 DHCP 消息类型数量 (message_type -> count)，供悬停明细展示 */
  byType: Record<number, number>;
}

/**
 * 生成连续时间桶键 (UTC)。
 * dhcp_logs.timestamp 为 ISO 8601 (含 'T')，故按前 13/10 字符切分即可。
 */
function buildBucketKeys(count: number, unit: TrendUnit): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    if (unit === 'hour') {
      d.setUTCHours(d.getUTCHours() - i, 0, 0, 0);
      keys.push(d.toISOString().slice(0, 13)); // YYYY-MM-DDTHH
    } else {
      d.setUTCDate(d.getUTCDate() - i);
      keys.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    }
  }
  return keys;
}

/**
 * 查询事件趋势并按连续桶补零，保证折线图曲线连续、无断点。
 */
function queryTrend(db: ReturnType<typeof getDb>, unit: TrendUnit, count: number): TrendPoint[] {
  const sliceLen = unit === 'hour' ? 13 : 10;
  const keys = buildBucketKeys(count, unit);

  // 起始时间精确取第一个桶的起点，避免漏掉首桶前段数据
  const firstKey = keys[0];
  const since = unit === 'hour' ? `${firstKey}:00:00.000Z` : `${firstKey}T00:00:00.000Z`;

  // 一次查询按 桶 + 消息类型 分组，既得总数也能得各类型明细
  const rows = db.prepare(
    `SELECT substr(timestamp, 1, ${sliceLen}) AS bucket, message_type AS type, COUNT(*) AS count
     FROM dhcp_logs
     WHERE timestamp >= ?
     GROUP BY bucket, type`
  ).all(since) as Array<{ bucket: string; type: number; count: number }>;

  const agg = new Map<string, { total: number; byType: Record<number, number> }>();
  for (const r of rows) {
    let entry = agg.get(r.bucket);
    if (!entry) {
      entry = { total: 0, byType: {} };
      agg.set(r.bucket, entry);
    }
    entry.total += r.count;
    entry.byType[r.type] = (entry.byType[r.type] || 0) + r.count;
  }

  return keys.map(k => {
    const entry = agg.get(k);
    return {
      t: unit === 'hour' ? `${k}:00:00.000Z` : `${k}T00:00:00.000Z`,
      count: entry?.total || 0,
      byType: entry?.byType || {},
    };
  });
}

export async function GET() {
  try {
    const db = getDb();

    // ===== 基础统计（保留原有字段，向后兼容）=====
    const activeLeases = db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE state IN ('OFFERED', 'BOUND')"
    ).get() as { count: number };

    const pools = db.prepare('SELECT id, name, start_ip, end_ip FROM pools WHERE enabled = 1 ORDER BY id').all() as any[];
    const totalIPs = pools.reduce((sum, p) => sum + ipToNum(p.end_ip) - ipToNum(p.start_ip) + 1, 0);

    const poolCount = db.prepare('SELECT COUNT(*) as count FROM pools').get() as { count: number };
    const activePoolCount = pools.length;

    const reservationCount = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE enabled = 1').get() as { count: number };

    const requests24h = db.prepare(
      "SELECT COUNT(*) as count FROM dhcp_logs WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '-1 day')"
    ).get() as { count: number };

    // 各地址池使用率 — 单次查询获取所有租约计数
    const leaseCountMap = new Map<number, number>();
    const leaseCounts = db.prepare(
      "SELECT pool_id, COUNT(DISTINCT ip_address) as count FROM leases WHERE state IN ('OFFERED', 'BOUND') GROUP BY pool_id"
    ).all() as Array<{ pool_id: number; count: number }>;
    leaseCounts.forEach(r => leaseCountMap.set(r.pool_id, r.count));

    const poolUsage = pools.map(pool => {
      const total = ipToNum(pool.end_ip) - ipToNum(pool.start_ip) + 1;
      const used = leaseCountMap.get(pool.id) || 0;
      return {
        poolId: pool.id,
        name: pool.name,
        used,
        total,
        percentage: total > 0 ? Math.round((used / total) * 100) : 0,
      };
    });

    // 最近 10 条事件
    const recentEvents = db.prepare(`
      SELECT timestamp, message_type, client_mac, hostname, server_response, direction
      FROM dhcp_logs ORDER BY id DESC LIMIT 10
    `).all();

    // ===== 新增：DHCP 服务运行状态 =====
    // 单例状态 + 端口 67 交叉验证（Next.js 模块打包可能产生多实例）
    let dhcpStatus: 'running' | 'stopped' = 'stopped';
    try {
      dhcpStatus = dhcpInstance.getStatus();
      if (dhcpStatus === 'stopped' && await dhcpInstance.isPortInUse()) {
        dhcpStatus = 'running';
      }
    } catch { /* 状态探测失败时保持 stopped */ }

    // ===== 新增：租约状态分布 =====
    const leaseStateRows = db.prepare(
      'SELECT state, COUNT(*) as count FROM leases GROUP BY state'
    ).all() as Array<{ state: string; count: number }>;
    const leaseStates = { bound: 0, offered: 0, expired: 0, released: 0 };
    leaseStateRows.forEach(r => {
      const key = r.state.toLowerCase() as keyof typeof leaseStates;
      if (key in leaseStates) leaseStates[key] = r.count;
    });

    // ===== 新增：即将过期租约预警 =====
    // lease_end 为 ISO 8601，用 JS 生成同格式边界比较
    const nowIso = new Date().toISOString();
    const in1hIso = new Date(Date.now() + 3_600_000).toISOString();
    const in24hIso = new Date(Date.now() + 86_400_000).toISOString();
    const expiringStmt = db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE state = 'BOUND' AND lease_end IS NOT NULL AND lease_end > ? AND lease_end <= ?"
    );
    const expiringLeases = {
      within1h: (expiringStmt.get(nowIso, in1hIso) as { count: number }).count,
      within24h: (expiringStmt.get(nowIso, in24hIso) as { count: number }).count,
    };

    // ===== 新增：消息类型分布（近 24h）=====
    const msgTypeDistribution = (db.prepare(
      `SELECT message_type as type, COUNT(*) as count FROM dhcp_logs
       WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '-1 day')
       GROUP BY message_type ORDER BY message_type`
    ).all() as Array<{ type: number; count: number }>);

    // ===== 新增：事件趋势（24h/7d/30d，一次返回）=====
    const trends = {
      h24: queryTrend(db, 'hour', 24),
      d7: queryTrend(db, 'day', 7),
      d30: queryTrend(db, 'day', 30),
    };

    // ===== 新增：Webhook 投递健康度（近 24h）=====
    // created_at 为 datetime('now') 格式（空格分隔），故用 datetime() 比较
    const webhookRows = db.prepare(
      "SELECT status, COUNT(*) as count FROM webhook_deliveries WHERE created_at >= datetime('now', '-1 day') GROUP BY status"
    ).all() as Array<{ status: string; count: number }>;
    const webhookHealth = { success: 0, failed: 0 };
    webhookRows.forEach(r => {
      if (r.status === 'success') webhookHealth.success = r.count;
      else if (r.status === 'failed') webhookHealth.failed = r.count;
    });

    // ===== 新增：安全概览 =====
    const security = {
      macBlacklist: (db.prepare('SELECT COUNT(*) as c FROM mac_blacklist WHERE enabled = 1').get() as { c: number }).c,
      activeDeclines: (db.prepare("SELECT COUNT(*) as c FROM declined_ips WHERE expires_at > datetime('now')").get() as { c: number }).c,
    };

    // ===== 新增：资产计数 =====
    const assets = {
      deviceOptions: (db.prepare('SELECT COUNT(*) as c FROM device_options').get() as { c: number }).c,
      macNotes: (db.prepare('SELECT COUNT(*) as c FROM mac_notes').get() as { c: number }).c,
      disabledPools: (db.prepare('SELECT COUNT(*) as c FROM pools WHERE enabled = 0').get() as { c: number }).c,
    };

    // ===== 新增：Top 活跃客户端（近 24h，接收方向）=====
    const topClients = db.prepare(
      `SELECT client_mac as mac, MAX(hostname) as hostname, COUNT(*) as count
       FROM dhcp_logs
       WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '-1 day')
         AND direction = 'recv' AND client_mac IS NOT NULL
       GROUP BY client_mac ORDER BY count DESC LIMIT 5`
    ).all() as Array<{ mac: string; hostname: string | null; count: number }>;

    return NextResponse.json({
      // 兼容字段
      activeLeases: activeLeases.count,
      totalIPs,
      poolCount: poolCount.count,
      activePoolCount,
      reservationCount: reservationCount.count,
      requests24h: requests24h.count,
      poolUsage,
      recentEvents,
      // 新增字段
      dhcpStatus,
      leaseStates,
      expiringLeases,
      msgTypeDistribution,
      trends,
      webhookHealth,
      security,
      assets,
      topClients,
    });
  } catch (error) {
    console.error('[API] Dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
