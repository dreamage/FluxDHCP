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
    const note = searchParams.get('note')?.trim();
    const page = parsePage(searchParams, { defaultPageSize: 50, maxPageSize: 1000 });

    const conditions: string[] = [];
    const params: any[] = [];

    if (mac) {
      conditions.push('mac_address LIKE ?');
      params.push(`%${mac.toUpperCase()}%`);
    }
    if (note) {
      conditions.push('note LIKE ?');
      params.push(`%${note}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) as count FROM mac_notes ${where}`).get(...params) as { count: number };
    const rows = db.prepare(
      `SELECT * FROM mac_notes ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    ).all(...params, page.pageSize, page.offset) as any[];

    return NextResponse.json(pageResult(serializeRows(rows), page, total.count));
  } catch (error) {
    return serverError('GET /mac-notes', error, 'Failed to fetch MAC notes');
  }
}

export async function POST(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const body = await request.json();
    const { mac_address, note } = body;

    if (!mac_address || !note?.trim()) {
      return apiError('MISSING_REQUIRED_FIELDS', 'MAC address and note are required', 400, {
        details: { required: ['mac_address', 'note'] },
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
      INSERT INTO mac_notes (mac_address, note, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(mac_address) DO UPDATE SET note = excluded.note, updated_at = datetime('now')
    `).run(mac, note.trim());

    const row = db.prepare('SELECT * FROM mac_notes WHERE mac_address = ?').get(mac) as any;
    return NextResponse.json(serializeRow(row));
  } catch (error) {
    return serverError('POST /mac-notes', error, 'Failed to save MAC note');
  }
}
