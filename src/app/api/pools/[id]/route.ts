import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { ipToNum, isValidIPv4, isIPInSubnet } from '@/lib/ip-utils';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(id);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    return NextResponse.json({ ...(pool as any), dns_servers: (pool as any).dns_servers ? JSON.parse((pool as any).dns_servers) : [] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pool' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time, enabled } = body;

    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(id);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    // 合并最终值（未传字段用原值）
    const finalSubnet = subnet || (pool as any).subnet;
    const finalNetmask = netmask || (pool as any).netmask;
    const finalStartIp = start_ip || (pool as any).start_ip;
    const finalEndIp = end_ip || (pool as any).end_ip;
    const finalGateway = gateway !== undefined ? gateway : (pool as any).gateway;

    // 校验 IP 格式
    const ipsToCheck = [finalSubnet, finalNetmask, finalStartIp, finalEndIp];
    if (finalGateway) ipsToCheck.push(finalGateway);
    for (const ip of ipsToCheck) {
      if (!isValidIPv4(ip)) {
        return NextResponse.json({ error: `Invalid IP address: ${ip}` }, { status: 400 });
      }
    }

    // 校验起始IP <= 结束IP
    const newStart = ipToNum(finalStartIp);
    const newEnd = ipToNum(finalEndIp);
    if (newStart > newEnd) {
      return NextResponse.json({ error: 'Start IP must be less than or equal to End IP' }, { status: 400 });
    }

    // 校验 start/end IP 在子网范围内
    if (!isIPInSubnet(finalStartIp, finalSubnet, finalNetmask) || !isIPInSubnet(finalEndIp, finalSubnet, finalNetmask)) {
      return NextResponse.json({ error: 'Start/End IP is not within the subnet' }, { status: 400 });
    }

    // 校验 IP 范围重叠（排除自身）
    const existingPools = db.prepare('SELECT * FROM pools WHERE id != ?').all(id) as any[];
    const overlapping = existingPools.find(p => {
      const pStart = ipToNum(p.start_ip);
      const pEnd = ipToNum(p.end_ip);
      return newStart <= pEnd && newEnd >= pStart;
    });
    if (overlapping) {
      return NextResponse.json({ error: `IP range overlaps with pool "${overlapping.name}"` }, { status: 400 });
    }

    const dnsJson = dns_servers ? JSON.stringify(dns_servers) : null;

    db.prepare(`
      UPDATE pools SET name = ?, subnet = ?, netmask = ?, start_ip = ?, end_ip = ?, gateway = ?, dns_servers = ?, lease_time = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || (pool as any).name,
      subnet || (pool as any).subnet,
      netmask || (pool as any).netmask,
      start_ip || (pool as any).start_ip,
      end_ip || (pool as any).end_ip,
      gateway !== undefined ? gateway : (pool as any).gateway,
      dnsJson !== undefined ? dnsJson : (pool as any).dns_servers,
      lease_time !== undefined ? lease_time : (pool as any).lease_time,
      enabled !== undefined ? (enabled ? 1 : 0) : (pool as any).enabled,
      id,
    );

    return NextResponse.json({ message: 'Pool updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update pool' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    // 检查是否有活跃租约
    const activeLeases = db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
    ).get(id) as { count: number };

    if (activeLeases.count > 0) {
      return NextResponse.json({ error: `Pool has ${activeLeases.count} active lease(s). Release them first.` }, { status: 409 });
    }

    // 删除关联的保留地址
    db.prepare('DELETE FROM reservations WHERE pool_id = ?').run(id);
    // 删除关联的租约
    db.prepare('DELETE FROM leases WHERE pool_id = ?').run(id);
    // 删除该 IP 范围内的 DECLINE 黑名单 (#5)
    const pool = db.prepare('SELECT start_ip, end_ip FROM pools WHERE id = ?').get(id) as any;
    if (pool) {
      const startNum = ipToNum(pool.start_ip);
      const endNum = ipToNum(pool.end_ip);
      db.prepare(
        "DELETE FROM declined_ips WHERE ip_address BETWEEN ? AND ?"
      ).run(
        `${(startNum >>> 24) & 0xFF}.${(startNum >>> 16) & 0xFF}.${(startNum >>> 8) & 0xFF}.${startNum & 0xFF}`,
        `${(endNum >>> 24) & 0xFF}.${(endNum >>> 16) & 0xFF}.${(endNum >>> 8) & 0xFF}.${endNum & 0xFF}`
      );
    }
    // 删除地址池
    db.prepare('DELETE FROM pools WHERE id = ?').run(id);

    return NextResponse.json({ message: 'Pool deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete pool' }, { status: 500 });
  }
}
