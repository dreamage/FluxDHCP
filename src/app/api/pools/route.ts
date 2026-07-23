import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { ipToNum, isValidIPv4, isIPInSubnet } from '@/lib/ip-utils';

export async function GET() {
  try {
    const db = getDb();
    const pools = db.prepare('SELECT * FROM pools ORDER BY id').all();

    // Single aggregated query for all pool usage counts
    const usageMap = new Map<number, number>();
    const leaseCounts = db.prepare(
      "SELECT pool_id, COUNT(DISTINCT ip_address) as count FROM leases WHERE state IN ('OFFERED', 'BOUND') GROUP BY pool_id"
    ).all() as Array<{ pool_id: number; count: number }>;
    leaseCounts.forEach(r => usageMap.set(r.pool_id, r.count));

    const result = pools.map((pool: any) => {
      const startNum = ipToNum(pool.start_ip);
      const endNum = ipToNum(pool.end_ip);
      const total = endNum - startNum + 1;
      const used = usageMap.get(pool.id) || 0;
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

    // 校验 IP 格式 (#6)
    const ipsToCheck = [subnet, netmask, start_ip, end_ip];
    if (gateway) ipsToCheck.push(gateway);
    for (const ip of ipsToCheck) {
      if (!isValidIPv4(ip)) {
        return NextResponse.json({ error: `Invalid IP address: ${ip}` }, { status: 400 });
      }
    }

    // 校验 IP 范围重叠
    const newStart = ipToNum(start_ip);
    const newEnd = ipToNum(end_ip);
    if (newStart > newEnd) {
      return NextResponse.json({ error: 'Start IP must be less than or equal to End IP' }, { status: 400 });
    }

    // 校验 start/end IP 在子网范围内
    if (!isIPInSubnet(start_ip, subnet, netmask) || !isIPInSubnet(end_ip, subnet, netmask)) {
      return NextResponse.json({ error: 'Start/End IP is not within the subnet' }, { status: 400 });
    }

    // 校验网关在子网范围内
    if (gateway && !isIPInSubnet(gateway, subnet, netmask)) {
      return NextResponse.json({ error: 'Gateway is not within the subnet' }, { status: 400 });
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
