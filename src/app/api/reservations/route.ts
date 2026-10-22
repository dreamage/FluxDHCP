import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { isValidIPv4, isIPInSubnet, ipToNum } from '@/lib/ip-utils';
import { apiError, isUniqueViolation, parsePage, pageResult, serializeRow, serializeRows, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

const SELECT_WITH_POOL = `
  SELECT r.*, p.name as pool_name
  FROM reservations r
  LEFT JOIN pools p ON r.pool_id = p.id
`;

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const poolId = searchParams.get('pool_id');
    const enabled = searchParams.get('enabled');
    const ipStart = searchParams.get('ip_start');
    const ipEnd = searchParams.get('ip_end');
    const mac = searchParams.get('mac');
    const hostname = searchParams.get('hostname');
    const page = parsePage(searchParams, { defaultPageSize: 50, maxPageSize: 1000 });

    const conditions: string[] = [];
    const params: any[] = [];

    if (poolId && poolId !== 'ALL') {
      conditions.push('r.pool_id = ?');
      params.push(Number(poolId));
    }
    if (enabled && enabled !== 'ALL') {
      conditions.push('r.enabled = ?');
      params.push(Number(enabled));
    }
    if (ipStart && ipEnd) {
      conditions.push('ip2num(r.ip_address) BETWEEN ? AND ?');
      params.push(ipToNum(ipStart), ipToNum(ipEnd));
    }
    if (mac) {
      conditions.push('r.mac_address LIKE ?');
      params.push(`%${mac}%`);
    }
    if (hostname) {
      conditions.push('r.hostname LIKE ?');
      params.push(`%${hostname}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM reservations r ${whereClause}`
    ).get(...params) as { count: number };

    const reservations = db.prepare(`
      ${SELECT_WITH_POOL}
      ${whereClause}
      ORDER BY r.id
      LIMIT ? OFFSET ?
    `).all(...params, page.pageSize, page.offset) as any[];

    return NextResponse.json(pageResult(serializeRows(reservations), page, total.count));
  } catch (error) {
    return serverError('GET /reservations', error, 'Failed to fetch reservations');
  }
}

export async function POST(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const body = await request.json();
    const { mac_address, ip_address, hostname, pool_id, description } = body;

    if (!mac_address || !ip_address || !pool_id) {
      return apiError('MISSING_REQUIRED_FIELDS', 'Missing required fields', 400, {
        details: { required: ['mac_address', 'ip_address', 'pool_id'] },
      });
    }

    // 校验 MAC 格式
    const mac = normalizeMac(mac_address);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format. Use AA:BB:CC:DD:EE:FF', 400, {
        details: { value: mac_address },
        hint: 'Use colon-separated hex, e.g. AA:BB:CC:DD:EE:FF.',
      });
    }

    // 校验 IP 格式
    if (!isValidIPv4(ip_address)) {
      return apiError('INVALID_IP', 'Invalid IP address format', 400, {
        details: { value: ip_address },
        hint: 'Use dotted-decimal IPv4 notation, e.g. 192.168.1.100.',
      });
    }

    // 校验 IP 在子网范围内
    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(pool_id) as any;
    if (!pool) {
      return apiError('POOL_NOT_FOUND', 'Pool not found', 404, { details: { pool_id } });
    }
    if (!isIPInSubnet(ip_address, pool.subnet, pool.netmask)) {
      return apiError('IP_OUT_OF_SUBNET', 'IP address is not within the subnet', 400, {
        details: { ip_address, subnet: pool.subnet, netmask: pool.netmask },
        hint: 'Pick an IP inside the selected pool subnet.',
      });
    }

    // 校验 MAC 唯一
    const existingMAC = db.prepare('SELECT id FROM reservations WHERE mac_address = ?').get(mac) as { id: number } | undefined;
    if (existingMAC) {
      return apiError('RESERVATION_MAC_EXISTS', 'MAC address already reserved', 409, {
        details: { reservationId: existingMAC.id, mac_address: mac },
      });
    }

    // 校验 IP 唯一
    const existingIP = db.prepare('SELECT id FROM reservations WHERE ip_address = ?').get(ip_address) as { id: number } | undefined;
    if (existingIP) {
      return apiError('RESERVATION_IP_EXISTS', 'IP address already reserved', 409, {
        details: { reservationId: existingIP.id, ip_address },
      });
    }

    // 校验 IP 是否被其他设备活跃占用
    const activeLease = db.prepare(
      "SELECT mac_address FROM leases WHERE ip_address = ? AND state IN ('BOUND', 'OFFERED')"
    ).get(ip_address) as { mac_address: string } | undefined;
    if (activeLease && activeLease.mac_address !== mac) {
      return apiError('IP_LEASED_TO_OTHER', 'IP address is currently leased to another device', 409, {
        details: { ip_address, leasedTo: activeLease.mac_address },
        hint: 'Release the lease first, so the reservation does not fight an active client.',
      });
    }

    const result = db.prepare(`
      INSERT INTO reservations (mac_address, ip_address, hostname, pool_id, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(mac, ip_address, hostname || null, pool_id, description || null);

    const created = db.prepare(`${SELECT_WITH_POOL} WHERE r.id = ?`).get(result.lastInsertRowid) as any;
    return NextResponse.json(serializeRow(created), { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return apiError('RESERVATION_CONFLICT', 'MAC address or IP address already reserved', 409, {
        hint: 'Check existing reservations for this MAC/IP.',
      });
    }
    return serverError('POST /reservations', error, 'Failed to create reservation');
  }
}
