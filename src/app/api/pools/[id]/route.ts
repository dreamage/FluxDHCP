import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { ipToNum, isValidIPv4, isIPInSubnet, MAX_POOL_SIZE } from '@/lib/ip-utils';
import { apiError, serializeRow, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

function serializePool(pool: any) {
  return {
    ...serializeRow(pool),
    dns_servers: pool.dns_servers ? JSON.parse(pool.dns_servers) : [],
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(id);
    if (!pool) {
      return apiError('POOL_NOT_FOUND', 'Pool not found', 404, { details: { id } });
    }
    return NextResponse.json(serializePool(pool));
  } catch (error) {
    return serverError('GET /pools/:id', error, 'Failed to fetch pool');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time, enabled } = body;

    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(id) as any;
    if (!pool) {
      return apiError('POOL_NOT_FOUND', 'Pool not found', 404, { details: { id } });
    }

    // 合并最终值（未传字段用原值）
    const finalSubnet = subnet || pool.subnet;
    const finalNetmask = netmask || pool.netmask;
    const finalStartIp = start_ip || pool.start_ip;
    const finalEndIp = end_ip || pool.end_ip;
    const finalGateway = gateway !== undefined ? gateway : pool.gateway;

    // 校验 IP 格式
    const ipsToCheck = [finalSubnet, finalNetmask, finalStartIp, finalEndIp];
    if (finalGateway) ipsToCheck.push(finalGateway);
    for (const ip of ipsToCheck) {
      if (!isValidIPv4(ip)) {
        return apiError('INVALID_IP', `Invalid IP address: ${ip}`, 400, {
          details: { value: ip },
          hint: 'Use dotted-decimal IPv4 notation, e.g. 192.168.1.1.',
        });
      }
    }

    // 校验起始IP <= 结束IP
    const newStart = ipToNum(finalStartIp);
    const newEnd = ipToNum(finalEndIp);
    if (newStart > newEnd) {
      return apiError('POOL_RANGE_INVALID', 'Start IP must be less than or equal to End IP', 400, {
        details: { start_ip: finalStartIp, end_ip: finalEndIp },
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

    // 校验 start/end IP 在子网范围内
    if (!isIPInSubnet(finalStartIp, finalSubnet, finalNetmask) || !isIPInSubnet(finalEndIp, finalSubnet, finalNetmask)) {
      return apiError('POOL_RANGE_OUT_OF_SUBNET', 'Start/End IP is not within the subnet', 400, {
        details: { subnet: finalSubnet, netmask: finalNetmask, start_ip: finalStartIp, end_ip: finalEndIp },
      });
    }

    // 校验网关在子网范围内
    if (finalGateway && !isIPInSubnet(finalGateway, finalSubnet, finalNetmask)) {
      return apiError('POOL_GATEWAY_OUT_OF_SUBNET', 'Gateway is not within the subnet', 400, {
        details: { subnet: finalSubnet, netmask: finalNetmask, gateway: finalGateway },
      });
    }

    // 校验 IP 范围重叠（排除自身）
    const existingPools = db.prepare('SELECT * FROM pools WHERE id != ?').all(id) as any[];
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

    const dnsJson = dns_servers !== undefined ? JSON.stringify(dns_servers) : undefined;

    db.prepare(`
      UPDATE pools SET name = ?, subnet = ?, netmask = ?, start_ip = ?, end_ip = ?, gateway = ?, dns_servers = ?, lease_time = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || pool.name,
      subnet || pool.subnet,
      netmask || pool.netmask,
      start_ip || pool.start_ip,
      end_ip || pool.end_ip,
      gateway !== undefined ? gateway : pool.gateway,
      dnsJson !== undefined ? dnsJson : pool.dns_servers,
      lease_time !== undefined ? lease_time : pool.lease_time,
      enabled !== undefined ? (enabled ? 1 : 0) : pool.enabled,
      id,
    );

    const updated = db.prepare('SELECT * FROM pools WHERE id = ?').get(id);
    return NextResponse.json(serializePool(updated));
  } catch (error) {
    return serverError('PUT /pools/:id', error, 'Failed to update pool');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM pools WHERE id = ?').get(id);
    if (!existing) {
      return apiError('POOL_NOT_FOUND', 'Pool not found', 404, { details: { id } });
    }

    // 检查是否有活跃租约
    const activeLeases = db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
    ).get(id) as { count: number };

    if (activeLeases.count > 0) {
      return apiError('POOL_HAS_ACTIVE_LEASES', `Pool has ${activeLeases.count} active lease(s). Release them first.`, 409, {
        details: { activeLeases: activeLeases.count },
        hint: 'Release the active leases before deleting the pool.',
      });
    }

    // 删除关联的保留地址
    db.prepare('DELETE FROM reservations WHERE pool_id = ?').run(id);
    // 删除关联的租约
    db.prepare('DELETE FROM leases WHERE pool_id = ?').run(id);
    // 删除该 IP 范围内的 DECLINE 黑名单（用 ip2num 数值比较）
    const pool = db.prepare('SELECT start_ip, end_ip FROM pools WHERE id = ?').get(id) as any;
    if (pool) {
      db.prepare(
        "DELETE FROM declined_ips WHERE ip2num(ip_address) BETWEEN ? AND ?"
      ).run(ipToNum(pool.start_ip), ipToNum(pool.end_ip));
    }
    // 删除地址池
    db.prepare('DELETE FROM pools WHERE id = ?').run(id);

    return NextResponse.json({ deleted: true, id: Number(id) });
  } catch (error) {
    return serverError('DELETE /pools/:id', error, 'Failed to delete pool');
  }
}
