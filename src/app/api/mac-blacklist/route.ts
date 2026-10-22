import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { apiError, parsePage, pageResult, serializeRow, serializeRows, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const mac = searchParams.get('mac')?.trim();
    const reason = searchParams.get('reason')?.trim();
    const enabled = searchParams.get('enabled')?.trim();
    const page = parsePage(searchParams, { defaultPageSize: 50, maxPageSize: 1000 });

    const conditions: string[] = [];
    const params: any[] = [];

    if (mac) {
      conditions.push('mac_address LIKE ?');
      params.push(`%${mac.toUpperCase()}%`);
    }
    if (reason) {
      conditions.push('reason LIKE ?');
      params.push(`%${reason}%`);
    }
    if (enabled === '1' || enabled === '0') {
      conditions.push('enabled = ?');
      params.push(Number(enabled));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) as count FROM mac_blacklist ${where}`).get(...params) as { count: number };
    const rows = db.prepare(
      `SELECT * FROM mac_blacklist ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, page.pageSize, page.offset) as any[];

    return NextResponse.json(pageResult(serializeRows(rows), page, total.count));
  } catch (error) {
    return serverError('GET /mac-blacklist', error, 'Failed to fetch MAC blacklist');
  }
}

export async function POST(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const body = await request.json();
    const { mac_address, reason, enabled } = body;

    if (!mac_address) {
      return apiError('MISSING_REQUIRED_FIELDS', 'Missing required fields', 400, {
        details: { required: ['mac_address'] },
      });
    }

    const mac = normalizeMac(mac_address);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, {
        details: { value: mac_address },
        hint: 'Use colon-separated hex, e.g. AA:BB:CC:DD:EE:FF.',
      });
    }

    db.prepare(`
      INSERT INTO mac_blacklist (mac_address, reason, enabled, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(mac_address) DO UPDATE SET reason = excluded.reason, enabled = excluded.enabled, updated_at = datetime('now')
    `).run(mac, reason?.trim() || '', enabled !== undefined ? (enabled ? 1 : 0) : 1);

    const row = db.prepare('SELECT * FROM mac_blacklist WHERE mac_address = ?').get(mac) as any;
    return NextResponse.json(serializeRow(row));
  } catch (error) {
    return serverError('POST /mac-blacklist', error, 'Failed to save MAC blacklist entry');
  }
}
