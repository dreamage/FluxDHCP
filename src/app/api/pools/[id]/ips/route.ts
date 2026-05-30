import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(id) as any;
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    const startNum = ipToNum(pool.start_ip);
    const endNum = ipToNum(pool.end_ip);

    // Get all reservations for this pool
    const reservations = db.prepare(
      'SELECT ip_address FROM reservations WHERE pool_id = ? AND enabled = 1'
    ).all(pool.id) as { ip_address: string }[];
    const reservedIPs = new Set(reservations.map(r => r.ip_address));

    // Get all active leases for this pool
    const leases = db.prepare(
      "SELECT ip_address, state, mac_address FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
    ).all(pool.id) as { ip_address: string; state: string; mac_address: string }[];
    const leaseMap = new Map(leases.map(l => [l.ip_address, l]));

    // Get mac notes for display
    const macNoteRows = db.prepare('SELECT mac_address, note FROM mac_notes').all() as { mac_address: string; note: string }[];
    const macNotes = new Map(macNoteRows.map(r => [r.mac_address, r.note]));

    // Build IP list with status
    const ips: Array<{ ip: string; status: string; mac?: string; note?: string }> = [];
    const stats = { free: 0, reserved: 0, bound: 0, offered: 0 };

    for (let num = startNum; num <= endNum; num++) {
      const ip = numToIp(num);
      let status = 'free';
      let mac: string | undefined;

      const lease = leaseMap.get(ip);
      if (lease) {
        status = lease.state === 'BOUND' ? 'bound' : 'offered';
        mac = lease.mac_address;
      } else if (reservedIPs.has(ip)) {
        status = 'reserved';
      }

      stats[status as keyof typeof stats]++;
      ips.push({ ip, status, mac, note: mac ? macNotes.get(mac) : undefined });
    }

    return NextResponse.json({ ips, stats });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pool IPs' }, { status: 500 });
  }
}

function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function numToIp(num: number): string {
  return `${(num >>> 24) & 0xFF}.${(num >>> 16) & 0xFF}.${(num >>> 8) & 0xFF}.${num & 0xFF}`;
}
