import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawMac = searchParams.get('mac');
    if (!rawMac) {
      return NextResponse.json({ error: 'MAC address is required' }, { status: 400 });
    }

    const mac = normalizeMac(rawMac);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
    }

    const db = getDb();

    // Check existing reservation
    const reservation = db.prepare(`
      SELECT r.*, p.name as pool_name FROM reservations r
      LEFT JOIN pools p ON r.pool_id = p.id
      WHERE r.mac_address = ?
    `).get(mac) as any;

    // Check latest active lease
    const lease = db.prepare(`
      SELECT l.*, p.name as pool_name FROM leases l
      LEFT JOIN pools p ON l.pool_id = p.id
      WHERE l.mac_address = ? AND l.state IN ('BOUND', 'OFFERED')
      ORDER BY l.lease_end DESC LIMIT 1
    `).get(mac) as any;

    // Check MAC note
    const note = db.prepare('SELECT note FROM mac_notes WHERE mac_address = ?').get(mac) as any;

    return NextResponse.json({
      mac_address: mac,
      ip_address: reservation?.ip_address || lease?.ip_address || null,
      pool_id: reservation?.pool_id || lease?.pool_id || null,
      hostname: reservation?.hostname || lease?.hostname || null,
      description: reservation?.description || null,
      note: note?.note || null,
      source: reservation ? 'reservation' : lease ? 'lease' : null,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch MAC info' }, { status: 500 });
  }
}
