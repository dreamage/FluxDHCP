import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET() {
  try {
    const db = getDb();

    // 活跃租约数
    const activeLeases = db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE state IN ('OFFERED', 'BOUND')"
    ).get() as { count: number };

    // 总可用 IP 数
    const pools = db.prepare('SELECT start_ip, end_ip FROM pools WHERE enabled = 1').all() as Array<{ start_ip: string; end_ip: string }>;
    const totalIPs = pools.reduce((sum, p) => sum + ipToNum(p.end_ip) - ipToNum(p.start_ip) + 1, 0);

    // 地址池数量
    const poolCount = db.prepare('SELECT COUNT(*) as count FROM pools').get() as { count: number };
    const activePoolCount = db.prepare('SELECT COUNT(*) as count FROM pools WHERE enabled = 1').get() as { count: number };

    // 保留地址数量
    const reservationCount = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE enabled = 1').get() as { count: number };

    // 24小时内请求数
    const requests24h = db.prepare(
      "SELECT COUNT(*) as count FROM logs WHERE timestamp >= datetime('now', '-1 day')"
    ).get() as { count: number };

    // 各地址池使用率
    const allPools = db.prepare('SELECT * FROM pools WHERE enabled = 1 ORDER BY id').all() as any[];
    const poolUsage = allPools.map(pool => {
      const total = ipToNum(pool.end_ip) - ipToNum(pool.start_ip) + 1;
      const leaseCount = db.prepare(
        "SELECT COUNT(*) as count FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
      ).get(pool.id) as { count: number };
      const reservationCount = db.prepare(
        'SELECT COUNT(*) as count FROM reservations WHERE pool_id = ? AND enabled = 1'
      ).get(pool.id) as { count: number };
      const used = leaseCount.count + reservationCount.count;
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
      FROM logs ORDER BY id DESC LIMIT 10
    `).all();

    return NextResponse.json({
      activeLeases: activeLeases.count,
      totalIPs,
      poolCount: poolCount.count,
      activePoolCount: activePoolCount.count,
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

function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
