import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { ipToNum } from '@/lib/ip-utils';

export async function GET() {
  try {
    const db = getDb();

    // 活跃租约数
    const activeLeases = db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE state IN ('OFFERED', 'BOUND')"
    ).get() as { count: number };

    // 总可用 IP 数
    const pools = db.prepare('SELECT id, name, start_ip, end_ip FROM pools WHERE enabled = 1 ORDER BY id').all() as any[];
    const totalIPs = pools.reduce((sum, p) => sum + ipToNum(p.end_ip) - ipToNum(p.start_ip) + 1, 0);

    // 地址池数量
    const poolCount = db.prepare('SELECT COUNT(*) as count FROM pools').get() as { count: number };
    const activePoolCount = pools.length;

    // 保留地址数量
    const reservationCount = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE enabled = 1').get() as { count: number };

    // 24小时内请求数
    const requests24h = db.prepare(
      "SELECT COUNT(*) as count FROM dhcp_logs WHERE timestamp >= datetime('now', '-1 day')"
    ).get() as { count: number };

    // 各地址池使用率 — 用单次查询获取所有租约计数 (#11)
    const leaseCountMap = new Map<number, number>();
    const leaseCounts = db.prepare(
      "SELECT pool_id, COUNT(DISTINCT ip_address) as count FROM leases WHERE state IN ('OFFERED', 'BOUND') GROUP BY pool_id"
    ).all() as Array<{ pool_id: number; count: number }>;
    leaseCounts.forEach(r => leaseCountMap.set(r.pool_id, r.count));

    const poolUsage = pools.map(pool => {
      const total = ipToNum(pool.end_ip) - ipToNum(pool.start_ip) + 1;
      const used = leaseCountMap.get(pool.id) || 0; // #12: no double-count
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

    return NextResponse.json({
      activeLeases: activeLeases.count,
      totalIPs,
      poolCount: poolCount.count,
      activePoolCount,
      reservationCount: reservationCount.count,
      requests24h: requests24h.count,
      poolUsage,
      recentEvents,
    });
  } catch (error) {
    console.error('[API] Dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
