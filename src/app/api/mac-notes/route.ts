import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM mac_notes ORDER BY updated_at DESC').all() as any[];
    // Return as object keyed by MAC for easy frontend lookup
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.mac_address] = row.note;
    }
    return NextResponse.json(map);
  } catch (error) {
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
    return NextResponse.json({ error: 'Failed to save MAC note' }, { status: 500 });
  }
}
