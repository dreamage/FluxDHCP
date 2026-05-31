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
    const row = db.prepare('SELECT * FROM mac_notes WHERE mac_address = ?').get(mac);
    return NextResponse.json(row || null);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch MAC note' }, { status: 500 });
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
    const { note } = body;

    if (!note?.trim()) {
      return NextResponse.json({ error: 'Note is required' }, { status: 400 });
    }

    const result = db.prepare(
      'UPDATE mac_notes SET note = ?, updated_at = datetime(\'now\') WHERE mac_address = ?'
    ).run(note.trim(), mac);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'MAC note not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Note updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update MAC note' }, { status: 500 });
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
    db.prepare('DELETE FROM mac_notes WHERE mac_address = ?').run(mac);
    return NextResponse.json({ message: 'Note deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete MAC note' }, { status: 500 });
  }
}
