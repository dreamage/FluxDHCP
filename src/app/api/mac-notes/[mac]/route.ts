import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { normalizeMac } from '@/lib/mac-utils';
import { apiError, serializeRow, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request, { params }: { params: Promise<{ mac: string }> }) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, { details: { value: rawMac } });
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM mac_notes WHERE mac_address = ?').get(mac) as any;
    if (!row) {
      return apiError('MAC_NOTE_NOT_FOUND', 'MAC note not found', 404, { details: { mac_address: mac } });
    }
    return NextResponse.json(serializeRow(row));
  } catch (error) {
    return serverError('GET /mac-notes/:mac', error, 'Failed to fetch MAC note');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ mac: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, { details: { value: rawMac } });
    }
    const db = getDb();
    const body = await request.json();
    const { note } = body;

    if (!note?.trim()) {
      return apiError('NOTE_REQUIRED', 'Note is required', 400, { details: { mac_address: mac } });
    }

    const result = db.prepare(
      'UPDATE mac_notes SET note = ?, updated_at = datetime(\'now\') WHERE mac_address = ?'
    ).run(note.trim(), mac);

    if (result.changes === 0) {
      return apiError('MAC_NOTE_NOT_FOUND', 'MAC note not found', 404, { details: { mac_address: mac } });
    }

    const row = db.prepare('SELECT * FROM mac_notes WHERE mac_address = ?').get(mac) as any;
    return NextResponse.json(serializeRow(row));
  } catch (error) {
    return serverError('PUT /mac-notes/:mac', error, 'Failed to update MAC note');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ mac: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { mac: rawMac } = await params;
    const mac = normalizeMac(rawMac);
    if (!mac) {
      return apiError('INVALID_MAC', 'Invalid MAC address format', 400, { details: { value: rawMac } });
    }
    const db = getDb();
    const result = db.prepare('DELETE FROM mac_notes WHERE mac_address = ?').run(mac);
    if (result.changes === 0) {
      return apiError('MAC_NOTE_NOT_FOUND', 'MAC note not found', 404, { details: { mac_address: mac } });
    }
    return NextResponse.json({ deleted: true, mac_address: mac });
  } catch (error) {
    return serverError('DELETE /mac-notes/:mac', error, 'Failed to delete MAC note');
  }
}
