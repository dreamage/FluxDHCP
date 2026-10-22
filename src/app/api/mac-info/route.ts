import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { apiError, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const rawMac = searchParams.get('mac');
    if (!rawMac) {
      return apiError('MISSING_REQUIRED_FIELDS', 'MAC address is required', 400, {
        details: { required: ['mac'] },
      });
    }

    const mac = normalizeMac(rawMac);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, { details: { value: rawMac } });
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
    return serverError('GET /mac-info', error, 'Failed to fetch MAC info');
  }
}
