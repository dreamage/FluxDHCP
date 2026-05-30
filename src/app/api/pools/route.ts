import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET() {
  try {
    const db = getDb();
    const pools = db.prepare('SELECT * FROM pools ORDER BY id').all();

    // 为每个地址池计算使用率
    const result = pools.map((pool: any) => {
      const startNum = ipToNum(pool.start_ip);
      const endNum = ipToNum(pool.end_ip);
      const total = endNum - startNum + 1;

      const leaseCount = db.prepare(
        "SELECT COUNT(*) as count FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
      ).get(pool.id) as { count: number };

      const reservationCount = db.prepare(
        'SELECT COUNT(*) as count FROM reservations WHERE pool_id = ? AND enabled = 1'
      ).get(pool.id) as { count: number };

      const used = leaseCount.count + reservationCount.count;
      const percentage = total > 0 ? Math.round((used / total) * 100) : 0;

      return { ...pool, dns_servers: pool.dns_servers ? JSON.parse(pool.dns_servers) : [], used, total, percentage };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pools' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time } = body;

    // 校验必填字段
    if (!name || !subnet || !netmask || !start_ip || !end_ip) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 校验 IP 范围重叠
    const newStart = ipToNum(start_ip);
    const newEnd = ipToNum(end_ip);
    if (newStart > newEnd) {
      return NextResponse.json({ error: 'Start IP must be less than or equal to End IP' }, { status: 400 });
    }

    const existingPools = db.prepare('SELECT * FROM pools').all() as any[];
    const overlapping = existingPools.find(p => {
      const pStart = ipToNum(p.start_ip);
      const pEnd = ipToNum(p.end_ip);
      return newStart <= pEnd && newEnd >= pStart;
    });

    if (overlapping) {
      return NextResponse.json({ error: `IP range overlaps with pool "${overlapping.name}"` }, { status: 400 });
    }

    const dnsJson = dns_servers ? JSON.stringify(dns_servers) : null;

    const result = db.prepare(`
      INSERT INTO pools (name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, subnet, netmask, start_ip, end_ip, gateway || null, dnsJson, lease_time || 86400);

    return NextResponse.json({ id: result.lastInsertRowid, message: 'Pool created' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create pool' }, { status: 500 });
  }
}

function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
