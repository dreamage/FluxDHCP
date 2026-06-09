import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';

export async function GET(_request: Request, { params }: { params: Promise<{ mac: string }> }) {
  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM mac_blacklist WHERE mac_address = ?').get(mac);
    return NextResponse.json(row || null);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch MAC blacklist entry' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ mac: string }> }) {
  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
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
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    sets.push("updated_at = datetime('now')");
    values.push(mac);

    const result = db.prepare(
      `UPDATE mac_blacklist SET ${sets.join(', ')} WHERE mac_address = ?`
    ).run(...values);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'MAC blacklist entry not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Blacklist entry updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update MAC blacklist entry' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ mac: string }> }) {
  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
    }
    const db = getDb();
    db.prepare('DELETE FROM mac_blacklist WHERE mac_address = ?').run(mac);
    return NextResponse.json({ message: 'Blacklist entry deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete MAC blacklist entry' }, { status: 500 });
  }
}
