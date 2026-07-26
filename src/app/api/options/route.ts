import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const mac = searchParams.get('mac');
    const optionCode = searchParams.get('option_code');
    const optionValue = searchParams.get('option_value');

    const conditions: string[] = [];
    const params: any[] = [];

    if (mac) {
      conditions.push('mac_address LIKE ?');
      params.push(`%${mac.toUpperCase()}%`);
    }
    if (optionCode) {
      conditions.push('option_code = ?');
      params.push(Number(optionCode));
    }
    if (optionValue) {
      conditions.push('option_value LIKE ?');
      params.push(`%${optionValue}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const options = db.prepare(`SELECT * FROM device_options ${where} ORDER BY mac_address, option_code`).all(...params);
    return NextResponse.json(options);
  } catch (error) {
    console.error('[API] GET /options:', error);
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

    // Validate option_code range (DHCP option code is 1 byte, 255 is reserved for END)
    const code = Number(option_code);
    if (!Number.isSafeInteger(code) || code < 1 || code > 254) {
      return NextResponse.json({ error: 'Option code must be an integer between 1 and 254' }, { status: 400 });
    }

    // Validate option_value byte length (DHCP option length is 1 byte, max 255)
    const valueStr = String(option_value);
    if (Buffer.byteLength(valueStr, 'utf8') > 255) {
      return NextResponse.json({ error: 'Option value exceeds 255 bytes' }, { status: 400 });
    }

    const mac = normalizeMac(mac_address);
    if (!mac) {
      return NextResponse.json({ error: 'Invalid MAC address format' }, { status: 400 });
    }

    // 校验 mac+code 唯一
    const existing = db.prepare(
      'SELECT id FROM device_options WHERE mac_address = ? AND option_code = ?'
    ).get(mac, code);

    if (existing) {
      return NextResponse.json({ error: 'Option already exists for this MAC address' }, { status: 409 });
    }

    const result = db.prepare(`
      INSERT INTO device_options (mac_address, option_code, option_value, option_name)
      VALUES (?, ?, ?, ?)
    `).run(mac, code, valueStr, option_name || null);

    return NextResponse.json({ id: result.lastInsertRowid, message: 'Option created' }, { status: 201 });
  } catch (error) {
    console.error('[API] POST /options:', error);
    return NextResponse.json({ error: 'Failed to create option' }, { status: 500 });
  }
}
