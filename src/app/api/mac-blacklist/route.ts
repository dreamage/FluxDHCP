import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const mac = searchParams.get('mac')?.trim();
    const reason = searchParams.get('reason')?.trim();
    const enabled = searchParams.get('enabled')?.trim();

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
    const rows = db.prepare(`SELECT * FROM mac_blacklist ${where} ORDER BY created_at DESC`).all(...params);
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
