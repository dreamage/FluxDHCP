import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { isIPInSubnet, isValidIPv4 } from '@/lib/ip-utils';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const reservation = db.prepare(`
      SELECT r.*, p.name as pool_name
      FROM reservations r
      LEFT JOIN pools p ON r.pool_id = p.id
      WHERE r.id = ?
    `).get(id);
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }
    return NextResponse.json(reservation);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch reservation' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { mac_address, ip_address, hostname, pool_id, description, enabled } = body;

    const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    const mac = mac_address ? normalizeMac(mac_address) : existing.mac_address.toUpperCase();
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format. Use AA:BB:CC:DD:EE:FF' }, { status: 400 });
    }

    // 校验 MAC 唯一（排除自身）
    const dupMAC = db.prepare('SELECT id FROM reservations WHERE mac_address = ? AND id != ?').get(mac, id);
    if (dupMAC) {
      return NextResponse.json({ error: 'MAC address already reserved' }, { status: 409 });
    }

    // 校验 IP 格式
    const ip = ip_address || existing.ip_address;
    if (ip_address && !isValidIPv4(ip_address)) {
      return NextResponse.json({ error: 'Invalid IP address format' }, { status: 400 });
    }

    // 校验 IP 唯一（排除自身）
    const dupIP = db.prepare('SELECT id FROM reservations WHERE ip_address = ? AND id != ?').get(ip, id);
    if (dupIP) {
      return NextResponse.json({ error: 'IP address already reserved' }, { status: 409 });
    }

    // 校验 IP 是否被其他设备活跃占用
    const activeLease = db.prepare(
      "SELECT mac_address FROM leases WHERE ip_address = ? AND state IN ('BOUND', 'OFFERED')"
    ).get(ip) as { mac_address: string } | undefined;
    if (activeLease && activeLease.mac_address !== mac) {
      return NextResponse.json({ error: 'IP address is currently leased to another device' }, { status: 409 });
    }

    // 校验 IP 在子网范围内
    const finalPoolId = pool_id || existing.pool_id;
    if (ip_address || pool_id) {
      const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(finalPoolId) as any;
      if (pool && !isIPInSubnet(ip, pool.subnet, pool.netmask)) {
        return NextResponse.json({ error: 'IP address is not within the subnet' }, { status: 400 });
      }
    }

    db.prepare(`
      UPDATE reservations SET mac_address = ?, ip_address = ?, hostname = ?, pool_id = ?, description = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      mac, ip,
      hostname !== undefined ? hostname : existing.hostname,
      pool_id || existing.pool_id,
      description !== undefined ? description : existing.description,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      id,
    );

    return NextResponse.json({ message: 'Reservation updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Reservation deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete reservation' }, { status: 500 });
  }
}
