import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { ipToNum, isValidIPv4, isIPInSubnet, MAX_POOL_SIZE } from '@/lib/ip-utils';
import { apiError, parsePage, pageResult, serializeRow, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams, { defaultPageSize: 50, maxPageSize: 1000 });

    const total = (db.prepare('SELECT COUNT(*) as count FROM pools').get() as { count: number }).count;
    const pools = db.prepare('SELECT * FROM pools ORDER BY id LIMIT ? OFFSET ?')
      .all(page.pageSize, page.offset) as any[];

    // Single aggregated query for all pool usage counts
    const usageMap = new Map<number, number>();
    const leaseCounts = db.prepare(
      "SELECT pool_id, COUNT(DISTINCT ip_address) as count FROM leases WHERE state IN ('OFFERED', 'BOUND') GROUP BY pool_id"
    ).all() as Array<{ pool_id: number; count: number }>;
    leaseCounts.forEach(r => usageMap.set(r.pool_id, r.count));

    const items = pools.map((pool: any) => {
      const startNum = ipToNum(pool.start_ip);
      const endNum = ipToNum(pool.end_ip);
      const size = endNum - startNum + 1;
      const used = usageMap.get(pool.id) || 0;
      const percentage = size > 0 ? Math.round((used / size) * 100) : 0;
      return {
        ...serializeRow(pool),
        dns_servers: pool.dns_servers ? JSON.parse(pool.dns_servers) : [],
        used,
        total: size,
        percentage,
      };
    });

    return NextResponse.json(pageResult(items, page, total));
  } catch (error) {
    return serverError('GET /pools', error, 'Failed to fetch pools');
  }
}

export async function POST(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const body = await request.json();
    const { name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time } = body;

    if (!name || !subnet || !netmask || !start_ip || !end_ip) {
      return apiError('MISSING_REQUIRED_FIELDS', 'Missing required fields', 400, {
        details: { required: ['name', 'subnet', 'netmask', 'start_ip', 'end_ip'] },
        hint: 'Provide name, subnet, netmask, start_ip and end_ip.',
      });
    }

    const ipsToCheck = [subnet, netmask, start_ip, end_ip];
    if (gateway) ipsToCheck.push(gateway);
    for (const ip of ipsToCheck) {
      if (!isValidIPv4(ip)) {
        return apiError('INVALID_IP', `Invalid IP address: ${ip}`, 400, {
          details: { value: ip },
          hint: 'Use dotted-decimal IPv4 notation, e.g. 192.168.1.1.',
        });
      }
    }

    const newStart = ipToNum(start_ip);
    const newEnd = ipToNum(end_ip);
    if (newStart > newEnd) {
      return apiError('POOL_RANGE_INVALID', 'Start IP must be less than or equal to End IP', 400, {
        details: { start_ip, end_ip },
        hint: 'Swap start_ip and end_ip.',
      });
    }

    // 限制单个地址池的地址数量，避免超大池在 IP 列表/分配时耗尽内存
    const poolSize = newEnd - newStart + 1;
    if (poolSize > MAX_POOL_SIZE) {
      return apiError('POOL_RANGE_TOO_LARGE', `Pool range too large: ${poolSize} addresses (max ${MAX_POOL_SIZE})`, 400, {
        details: { size: poolSize, maxSize: MAX_POOL_SIZE },
        hint: `Shrink the range to at most ${MAX_POOL_SIZE} addresses.`,
      });
    }

    if (!isIPInSubnet(start_ip, subnet, netmask) || !isIPInSubnet(end_ip, subnet, netmask)) {
      return apiError('POOL_RANGE_OUT_OF_SUBNET', 'Start/End IP is not within the subnet', 400, {
        details: { subnet, netmask, start_ip, end_ip },
        hint: 'Choose start_ip/end_ip inside the given subnet/netmask.',
      });
    }

    if (gateway && !isIPInSubnet(gateway, subnet, netmask)) {
      return apiError('POOL_GATEWAY_OUT_OF_SUBNET', 'Gateway is not within the subnet', 400, {
        details: { subnet, netmask, gateway },
      });
    }

    const existingPools = db.prepare('SELECT * FROM pools').all() as any[];
    const overlapping = existingPools.find(p => {
      const pStart = ipToNum(p.start_ip);
      const pEnd = ipToNum(p.end_ip);
      return newStart <= pEnd && newEnd >= pStart;
    });

    if (overlapping) {
      return apiError('POOL_RANGE_OVERLAP', `IP range overlaps with pool "${overlapping.name}"`, 409, {
        details: { conflictingPoolId: overlapping.id, conflictingPoolName: overlapping.name },
        hint: 'Adjust start_ip/end_ip, or edit the conflicting pool first.',
      });
    }

    const dnsJson = dns_servers ? JSON.stringify(dns_servers) : null;

    const result = db.prepare(`
      INSERT INTO pools (name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, subnet, netmask, start_ip, end_ip, gateway || null, dnsJson, lease_time || 86400);

    const created = db.prepare('SELECT * FROM pools WHERE id = ?').get(result.lastInsertRowid) as any;
    return NextResponse.json({
      ...serializeRow(created),
      dns_servers: created.dns_servers ? JSON.parse(created.dns_servers) : [],
    }, { status: 201 });
  } catch (error) {
    return serverError('POST /pools', error, 'Failed to create pool');
  }
}
