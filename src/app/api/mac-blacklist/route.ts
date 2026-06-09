import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM mac_blacklist ORDER BY created_at DESC').all();
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch MAC blacklist' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { mac_address, reason } = body;

    if (!mac_address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const mac = normalizeMac(mac_address);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO mac_blacklist (mac_address, reason, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(mac_address) DO UPDATE SET reason = excluded.reason, updated_at = datetime('now')
    `).run(mac, reason?.trim() || '');

    return NextResponse.json({ message: 'Blacklist entry saved' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save MAC blacklist entry' }, { status: 500 });
  }
}
