import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { isIPInSubnet, isValidIPv4 } from '@/lib/ip-utils';
import { apiError, isUniqueViolation, serializeRow, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

const SELECT_WITH_POOL = `
  SELECT r.*, p.name as pool_name
  FROM reservations r
  LEFT JOIN pools p ON r.pool_id = p.id
`;

function loadReservation(db: ReturnType<typeof getDb>, id: string) {
  return db.prepare(`${SELECT_WITH_POOL} WHERE r.id = ?`).get(id) as any;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const reservation = loadReservation(db, id);
    if (!reservation) {
      return apiError('RESERVATION_NOT_FOUND', 'Reservation not found', 404, { details: { id } });
    }
    return NextResponse.json(serializeRow(reservation));
  } catch (error) {
    return serverError('GET /reservations/:id', error, 'Failed to fetch reservation');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { mac_address, ip_address, hostname, pool_id, description, enabled } = body;

    const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
    if (!existing) {
      return apiError('RESERVATION_NOT_FOUND', 'Reservation not found', 404, { details: { id } });
    }

    const mac = mac_address ? normalizeMac(mac_address) : existing.mac_address.toUpperCase();
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format. Use AA:BB:CC:DD:EE:FF', 400, {
        details: { value: mac_address },
      });
    }

    // 校验 MAC 唯一（排除自身）
    const dupMAC = db.prepare('SELECT id FROM reservations WHERE mac_address = ? AND id != ?').get(mac, id) as { id: number } | undefined;
    if (dupMAC) {
      return apiError('RESERVATION_MAC_EXISTS', 'MAC address already reserved', 409, {
        details: { reservationId: dupMAC.id, mac_address: mac },
      });
    }

    // 校验 IP 格式
    const ip = ip_address || existing.ip_address;
    if (ip_address && !isValidIPv4(ip_address)) {
      return apiError('INVALID_IP', 'Invalid IP address format', 400, { details: { value: ip_address } });
    }

    // 校验 IP 唯一（排除自身）
    const dupIP = db.prepare('SELECT id FROM reservations WHERE ip_address = ? AND id != ?').get(ip, id) as { id: number } | undefined;
    if (dupIP) {
      return apiError('RESERVATION_IP_EXISTS', 'IP address already reserved', 409, {
        details: { reservationId: dupIP.id, ip_address: ip },
      });
    }

    // 校验 IP 是否被其他设备活跃占用
    const activeLease = db.prepare(
      "SELECT mac_address FROM leases WHERE ip_address = ? AND state IN ('BOUND', 'OFFERED')"
    ).get(ip) as { mac_address: string } | undefined;
    if (activeLease && activeLease.mac_address !== mac) {
      return apiError('IP_LEASED_TO_OTHER', 'IP address is currently leased to another device', 409, {
        details: { ip_address: ip, leasedTo: activeLease.mac_address },
      });
    }

    // 校验 IP 在子网范围内
    const finalPoolId = pool_id || existing.pool_id;
    if (ip_address || pool_id) {
      const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(finalPoolId) as any;
      if (!pool) {
        return apiError('POOL_NOT_FOUND', 'Pool not found', 404, { details: { pool_id: finalPoolId } });
      }
      if (!isIPInSubnet(ip, pool.subnet, pool.netmask)) {
        return apiError('IP_OUT_OF_SUBNET', 'IP address is not within the subnet', 400, {
          details: { ip_address: ip, subnet: pool.subnet, netmask: pool.netmask },
        });
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

    return NextResponse.json(serializeRow(loadReservation(db, id)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return apiError('RESERVATION_CONFLICT', 'MAC address or IP address already reserved', 409);
    }
    return serverError('PUT /reservations/:id', error, 'Failed to update reservation');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
    if (result.changes === 0) {
      return apiError('RESERVATION_NOT_FOUND', 'Reservation not found', 404, { details: { id } });
    }
    return NextResponse.json({ deleted: true, id: Number(id) });
  } catch (error) {
    return serverError('DELETE /reservations/:id', error, 'Failed to delete reservation');
  }
}
