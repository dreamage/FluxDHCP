import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { apiError, serializeRow, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request, { params }: { params: Promise<{ mac: string }> }) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, { details: { value: rawMac } });
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM mac_blacklist WHERE mac_address = ?').get(mac) as any;
    if (!row) {
      return apiError('MAC_BLACKLIST_NOT_FOUND', 'MAC blacklist entry not found', 404, { details: { mac_address: mac } });
    }
    return NextResponse.json(serializeRow(row));
  } catch (error) {
    return serverError('GET /mac-blacklist/:mac', error, 'Failed to fetch MAC blacklist entry');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ mac: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, { details: { value: rawMac } });
    }
    const db = getDb();
    const body = await request.json();
    const { reason, enabled } = body;

    const sets: string[] = [];
    const values: any[] = [];

    if (reason !== undefined) {
      sets.push('reason = ?');
      values.push(reason?.trim() || '');
    }
    if (enabled !== undefined) {
      sets.push('enabled = ?');
      values.push(enabled ? 1 : 0);
    }

    if (sets.length === 0) {
      return apiError('MISSING_REQUIRED_FIELDS', 'Missing required fields', 400, {
        details: { required: ['reason', 'enabled'] },
      });
    }

    sets.push("updated_at = datetime('now')");
    values.push(mac);

    const result = db.prepare(
      `UPDATE mac_blacklist SET ${sets.join(', ')} WHERE mac_address = ?`
    ).run(...values);

    if (result.changes === 0) {
      return apiError('MAC_BLACKLIST_NOT_FOUND', 'MAC blacklist entry not found', 404, { details: { mac_address: mac } });
    }

    const row = db.prepare('SELECT * FROM mac_blacklist WHERE mac_address = ?').get(mac) as any;
    return NextResponse.json(serializeRow(row));
  } catch (error) {
    return serverError('PUT /mac-blacklist/:mac', error, 'Failed to update MAC blacklist entry');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ mac: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, { details: { value: rawMac } });
    }
    const db = getDb();
    const result = db.prepare('DELETE FROM mac_blacklist WHERE mac_address = ?').run(mac);
    if (result.changes === 0) {
      return apiError('MAC_BLACKLIST_NOT_FOUND', 'MAC blacklist entry not found', 404, { details: { mac_address: mac } });
    }
    return NextResponse.json({ deleted: true, mac_address: mac });
  } catch (error) {
    return serverError('DELETE /mac-blacklist/:mac', error, 'Failed to delete MAC blacklist entry');
  }
}
