import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { apiError, serializeRow, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const option = db.prepare('SELECT * FROM device_options WHERE id = ?').get(id);
    if (!option) {
      return apiError('OPTION_NOT_FOUND', 'Option not found', 404, { details: { id } });
    }
    return NextResponse.json(serializeRow(option as any));
  } catch (error) {
    return serverError('GET /options/:id', error, 'Failed to fetch option');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { option_value, option_name, enabled } = body;

    const existing = db.prepare('SELECT * FROM device_options WHERE id = ?').get(id) as any;
    if (!existing) {
      return apiError('OPTION_NOT_FOUND', 'Option not found', 404, { details: { id } });
    }

    const newValue = option_value !== undefined ? String(option_value) : existing.option_value;
    // Validate option_value byte length (DHCP option length is 1 byte, max 255)
    if (Buffer.byteLength(newValue, 'utf8') > 255) {
      return apiError('OPTION_VALUE_TOO_LONG', 'Option value exceeds 255 bytes', 400, {
        details: { bytes: Buffer.byteLength(newValue, 'utf8'), maxBytes: 255 },
      });
    }

    db.prepare('UPDATE device_options SET option_value = ?, option_name = ?, enabled = ? WHERE id = ?').run(
      newValue,
      option_name !== undefined ? option_name : existing.option_name,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      id,
    );

    const updated = db.prepare('SELECT * FROM device_options WHERE id = ?').get(id);
    return NextResponse.json(serializeRow(updated as any));
  } catch (error) {
    return serverError('PUT /options/:id', error, 'Failed to update option');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM device_options WHERE id = ?').run(id);
    if (result.changes === 0) {
      return apiError('OPTION_NOT_FOUND', 'Option not found', 404, { details: { id } });
    }
    return NextResponse.json({ deleted: true, id: Number(id) });
  } catch (error) {
    return serverError('DELETE /options/:id', error, 'Failed to delete option');
  }
}
