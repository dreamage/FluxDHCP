import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { ipToNum, numToIp } from '@/lib/ip-utils';

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
      'SELECT ip_address, mac_address, hostname, description FROM reservations WHERE pool_id = ? AND enabled = 1'
    ).all(pool.id) as { ip_address: string; mac_address: string; hostname: string | null; description: string | null }[];
    const reservedIPs = new Map(reservations.map(r => [r.ip_address, { mac: r.mac_address, hostname: r.hostname, description: r.description }]));

    // Get all active leases for this pool
    const leases = db.prepare(
      "SELECT ip_address, state, mac_address, hostname FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
    ).all(pool.id) as { ip_address: string; state: string; mac_address: string; hostname: string | null }[];
    const leaseMap = new Map(leases.map(l => [l.ip_address, l]));

    // Get mac notes for display
    const macNoteRows = db.prepare('SELECT mac_address, note FROM mac_notes').all() as { mac_address: string; note: string }[];
    const macNotes = new Map(macNoteRows.map(r => [r.mac_address, r.note]));

    // Build IP list with status
    const ips: Array<{ ip: string; status: string; mac?: string; hostname?: string; note?: string; isReserved: boolean; reservationNote?: string | null }> = [];
    const stats = { free: 0, reserved: 0, bound: 0, offered: 0 };

    for (let num = startNum; num <= endNum; num++) {
      const ip = numToIp(num);
      let status = 'free';
      let mac: string | undefined;
      let hostname: string | undefined;
      let isReserved = false;

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

      // A reservation exists for this IP even when it's bound/offered
      if (reservation) {
        isReserved = true;
      }

      stats[status as keyof typeof stats]++;
      const macNote = mac ? macNotes.get(mac) : undefined;
      const reservationNote = reservation ? reservation.description : undefined;
      ips.push({ ip, status, mac, hostname, note: macNote, isReserved, reservationNote });
    }

    return NextResponse.json({ ips, stats });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pool IPs' }, { status: 500 });
  }
}
