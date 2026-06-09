import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET() {
  try {
    const db = getDb();

    const config = db.prepare('SELECT key, value FROM config').all();
    const pools = db.prepare('SELECT * FROM pools').all();
    const reservations = db.prepare('SELECT * FROM reservations').all();
    const deviceOptions = db.prepare('SELECT * FROM device_options').all();
    const webhooks = db.prepare('SELECT id, name, url, method, events, fields, body_mode, headers, enabled FROM webhooks').all();
    const macNotes = db.prepare('SELECT * FROM mac_notes').all();

    const data = {
      version: 1,
      exported_at: new Date().toISOString(),
      config,
      pools,
      reservations,
      device_options: deviceOptions,
      webhooks,
      mac_notes: macNotes,
    };

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="fluxdhcp-config-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to export config' }, { status: 500 });
  }
}
