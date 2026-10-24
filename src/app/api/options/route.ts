import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { apiError, isUniqueViolation, parsePage, pageResult, serializeRow, serializeRows, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const mac = searchParams.get('mac');
    const optionCode = searchParams.get('option_code');
    const optionValue = searchParams.get('option_value');
    const page = parsePage(searchParams, { defaultPageSize: 50, maxPageSize: 1000 });

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

    const total = db.prepare(`SELECT COUNT(*) as count FROM device_options ${where}`).get(...params) as { count: number };
    const options = db.prepare(
      `SELECT * FROM device_options ${where} ORDER BY mac_address, option_code LIMIT ? OFFSET ?`
    ).all(...params, page.pageSize, page.offset) as any[];

    return NextResponse.json(pageResult(serializeRows(options), page, total.count));
  } catch (error) {
    return serverError('GET /options', error, 'Failed to fetch options');
  }
}

export async function POST(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const body = await request.json();
    const { mac_address, option_code, option_value, option_name, enabled } = body;

    if (!mac_address || option_code === undefined || !option_value) {
      return apiError('MISSING_REQUIRED_FIELDS', 'Missing required fields', 400, {
        details: { required: ['mac_address', 'option_code', 'option_value'] },
      });
    }

    // Validate option_code range (DHCP option code is 1 byte, 255 is reserved for END)
    const code = Number(option_code);
    if (!Number.isSafeInteger(code) || code < 1 || code > 254) {
      return apiError('OPTION_CODE_OUT_OF_RANGE', 'Option code must be an integer between 1 and 254', 400, {
        details: { option_code, min: 1, max: 254 },
      });
    }

    // Validate option_value byte length (DHCP option length is 1 byte, max 255)
    const valueStr = String(option_value);
    if (Buffer.byteLength(valueStr, 'utf8') > 255) {
      return apiError('OPTION_VALUE_TOO_LONG', 'Option value exceeds 255 bytes', 400, {
        details: { bytes: Buffer.byteLength(valueStr, 'utf8'), maxBytes: 255 },
      });
    }

    const mac = normalizeMac(mac_address);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, {
        details: { value: mac_address },
        hint: 'Use colon-separated hex, e.g. AA:BB:CC:DD:EE:FF.',
      });
    }

    // 校验 mac+code 唯一
    const existing = db.prepare(
      'SELECT id FROM device_options WHERE mac_address = ? AND option_code = ?'
    ).get(mac, code) as { id: number } | undefined;

    if (existing) {
      return apiError('OPTION_ALREADY_EXISTS', 'Option already exists for this MAC address', 409, {
        details: { optionId: existing.id, mac_address: mac, option_code: code },
        hint: 'Update the existing option instead of creating a duplicate.',
      });
    }

    const result = db.prepare(`
      INSERT INTO device_options (mac_address, option_code, option_value, option_name, enabled)
      VALUES (?, ?, ?, ?, ?)
    `).run(mac, code, valueStr, option_name || null, enabled !== undefined ? (enabled ? 1 : 0) : 1);

    const created = db.prepare('SELECT * FROM device_options WHERE id = ?').get(result.lastInsertRowid) as any;
    return NextResponse.json(serializeRow(created), { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return apiError('OPTION_ALREADY_EXISTS', 'Option already exists for this MAC address', 409);
    }
    return serverError('POST /options', error, 'Failed to create option');
  }
}
