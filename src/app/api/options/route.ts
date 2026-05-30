import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const mac = searchParams.get('mac');

    let options;
    if (mac) {
      options = db.prepare('SELECT * FROM device_options WHERE mac_address = ? ORDER BY option_code').get(mac.toUpperCase());
    } else {
      options = db.prepare('SELECT * FROM device_options ORDER BY mac_address, option_code').all();
    }
    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch options' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { mac_address, option_code, option_value, option_name } = body;

    if (!mac_address || option_code === undefined || !option_value) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const mac = normalizeMac(mac_address);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
    }

    // 校验 mac+code 唯一
    const existing = db.prepare(
      'SELECT id FROM device_options WHERE mac_address = ? AND option_code = ?'
    ).get(mac, option_code);

    if (existing) {
      return NextResponse.json({ error: 'Option already exists for this MAC address' }, { status: 409 });
    }

    const result = db.prepare(`
      INSERT INTO device_options (mac_address, option_code, option_value, option_name)
      VALUES (?, ?, ?, ?)
    `).run(mac, option_code, option_value, option_name || null);

    return NextResponse.json({ id: result.lastInsertRowid, message: 'Option created' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create option' }, { status: 500 });
  }
}
