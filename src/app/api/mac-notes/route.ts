import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const mac = searchParams.get('mac')?.trim();
    const note = searchParams.get('note')?.trim();

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
    const rows = db.prepare(`SELECT * FROM mac_notes ${where} ORDER BY updated_at DESC`).all(...params) as any[];

    // ?format=full returns complete rows including timestamps (for management page)
    if (searchParams.get('format') === 'full') {
      return NextResponse.json(rows);
    }

    // Default: return as object keyed by MAC for easy frontend lookup (backward compat)
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.mac_address] = row.note;
    }
    return NextResponse.json(map);
  } catch (error) {
    console.error('[API] GET /mac-notes:', error);
    return NextResponse.json({ error: 'Failed to fetch MAC notes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { mac_address, note } = body;

    if (!mac_address || !note?.trim()) {
      return NextResponse.json({ error: 'MAC address and note are required' }, { status: 400 });
    }

    const mac = normalizeMac(mac_address);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO mac_notes (mac_address, note, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(mac_address) DO UPDATE SET note = excluded.note, updated_at = datetime('now')
    `).run(mac, note.trim());

    return NextResponse.json({ message: 'Note saved' });
  } catch (error) {
    console.error('[API] POST /mac-notes:', error);
    return NextResponse.json({ error: 'Failed to save MAC note' }, { status: 500 });
  }
}
