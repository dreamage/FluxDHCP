import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { ipToNum, numToIp, MAX_POOL_SIZE } from '@/lib/ip-utils';
import { apiError, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

const DEFAULT_PAGE_SIZE = 1024;

/**
 * 地址池 IP 使用情况。
 * 超大地址池（历史数据或手工写入的 /8 级别范围）不能一次性展开，
 * 因此按 page/pageSize 分页返回，统计值走 SQL 计数（与池大小无关）。
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(id) as any;
    if (!pool) {
      return apiError('POOL_NOT_FOUND', 'Pool not found', 404, { details: { id } });
    }

    // 分页参数（pageSize 上限与地址池上限一致，避免单次响应过大）
    const { searchParams } = new URL(request.url);
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const rawPageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, MAX_POOL_SIZE)
      : DEFAULT_PAGE_SIZE;

    const startNum = ipToNum(pool.start_ip);
    const endNum = ipToNum(pool.end_ip);
    const total = endNum - startNum + 1;

    // 统计用 SQL 计数，不随池大小线性增长
    const countActive = (state: 'BOUND' | 'OFFERED') => (db.prepare(
      'SELECT COUNT(*) as count FROM leases WHERE pool_id = ? AND state = ?'
    ).get(pool.id, state) as { count: number }).count;

    const bound = countActive('BOUND');
    const offered = countActive('OFFERED');
    // 仅被保留、且当前没有活跃租约的 IP 数
    const reserved = (db.prepare(`
      SELECT COUNT(*) as count FROM reservations r
      WHERE r.pool_id = ? AND r.enabled = 1
        AND NOT EXISTS (
          SELECT 1 FROM leases l
          WHERE l.ip_address = r.ip_address AND l.state IN ('OFFERED', 'BOUND')
        )
    `).get(pool.id) as { count: number }).count;

    const stats = {
      free: Math.max(total - bound - offered - reserved, 0),
      reserved,
      bound,
      offered,
    };

    const offset = (page - 1) * pageSize;
    const ips: Array<{
      ip: string; status: string; mac?: string; hostname?: string;
      note?: string; isReserved: boolean; reservationNote?: string | null;
    }> = [];

    if (offset < total) {
      const windowStart = startNum + offset;
      const windowEnd = Math.min(endNum, windowStart + pageSize - 1);

      // 只取与当前窗口相关的租约/保留记录
      const reservations = db.prepare(
        `SELECT ip_address, mac_address, hostname, description FROM reservations
         WHERE pool_id = ? AND enabled = 1
           AND ip2num(ip_address) BETWEEN ? AND ?`
      ).all(pool.id, windowStart, windowEnd) as Array<{
        ip_address: string; mac_address: string; hostname: string | null; description: string | null;
      }>;
      const reservedIPs = new Map(reservations.map(r => [r.ip_address, {
        mac: r.mac_address, hostname: r.hostname, description: r.description,
      }]));

      const leases = db.prepare(
        `SELECT ip_address, state, mac_address, hostname FROM leases
         WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')
           AND ip2num(ip_address) BETWEEN ? AND ?`
      ).all(pool.id, windowStart, windowEnd) as Array<{
        ip_address: string; state: string; mac_address: string; hostname: string | null;
      }>;
      const leaseMap = new Map(leases.map(l => [l.ip_address, l]));

      const macs = new Set<string>();
      leases.forEach(l => macs.add(l.mac_address));
      reservations.forEach(r => macs.add(r.mac_address));
      const macNotes = new Map<string, string>();
      if (macs.size > 0) {
        const noteRows = db.prepare(
          `SELECT mac_address, note FROM mac_notes WHERE mac_address IN (${Array.from(macs).map(() => '?').join(',')})`
        ).all(...macs) as Array<{ mac_address: string; note: string }>;
        noteRows.forEach(r => macNotes.set(r.mac_address, r.note));
      }

      for (let num = windowStart; num <= windowEnd; num++) {
        const ip = numToIp(num);
        let status = 'free';
        let mac: string | undefined;
        let hostname: string | undefined;

        const lease = leaseMap.get(ip);
        const reservation = reservedIPs.get(ip);

        if (lease) {
          status = lease.state === 'BOUND' ? 'bound' : 'offered';
          mac = lease.mac_address;
          hostname = lease.hostname || undefined;
        } else if (reservation) {
          status = 'reserved';
          mac = reservation.mac;
          hostname = reservation.hostname || undefined;
        }

        const macNote = mac ? macNotes.get(mac) : undefined;
        const reservationNote = reservation ? reservation.description : undefined;
        ips.push({
          ip, status, mac, hostname, note: macNote,
          isReserved: !!reservation, reservationNote,
        });
      }
    }

    return NextResponse.json({
      ips,
      stats,
      total,
      page,
      pageSize,
      hasMore: offset + ips.length < total,
    });
  } catch (error) {
    return serverError('GET /pools/:id/ips', error, 'Failed to fetch pool IPs');
  }
}
