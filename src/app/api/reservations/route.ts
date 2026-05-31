import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { isValidIPv4, isIPInSubnet } from '@/lib/ip-utils';

export async function GET() {
  try {
    const db = getDb();
    const reservations = db.prepare(`
      SELECT r.*, p.name as pool_name
      FROM reservations r
      LEFT JOIN pools p ON r.pool_id = p.id
      ORDER BY r.id
    `).all();
    return NextResponse.json(reservations);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch reservations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { mac_address, ip_address, hostname, pool_id, description } = body;

    if (!mac_address || !ip_address || !pool_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 校验 MAC 格式
    const mac = normalizeMac(mac_address);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format. Use AA:BB:CC:DD:EE:FF' }, { status: 400 });
    }

    // 校验 IP 格式
    if (!isValidIPv4(ip_address)) {
      return NextResponse.json({ error: 'Invalid IP address format' }, { status: 400 });
    }

    // 校验 IP 在子网范围内
    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(pool_id) as any;
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    if (!isIPInSubnet(ip_address, pool.subnet, pool.netmask)) {
      return NextResponse.json({ error: 'IP address is not within the subnet' }, { status: 400 });
    }

    // 校验 MAC 唯一
    const existingMAC = db.prepare('SELECT id FROM reservations WHERE mac_address = ?').get(mac);
    if (existingMAC) {
      return NextResponse.json({ error: 'MAC address already reserved' }, { status: 409 });
    }

    // 校验 IP 唯一
    const existingIP = db.prepare('SELECT id FROM reservations WHERE ip_address = ?').get(ip_address);
    if (existingIP) {
      return NextResponse.json({ error: 'IP address already reserved' }, { status: 409 });
    }

    // 校验 IP 是否被其他设备活跃占用
    const activeLease = db.prepare(
      "SELECT mac_address FROM leases WHERE ip_address = ? AND state IN ('BOUND', 'OFFERED')"
    ).get(ip_address) as { mac_address: string } | undefined;
    if (activeLease && activeLease.mac_address !== mac) {
      return NextResponse.json({ error: 'IP address is currently leased to another device' }, { status: 409 });
    }

    const result = db.prepare(`
      INSERT INTO reservations (mac_address, ip_address, hostname, pool_id, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(mac, ip_address, hostname || null, pool_id, description || null);

    return NextResponse.json({ id: result.lastInsertRowid, message: 'Reservation created' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 });
  }
}
