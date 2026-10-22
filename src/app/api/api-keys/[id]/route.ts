import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { apiError, serializeRow, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

/** 密钥管理只能从 Web UI 操作，使用 API Key 调用会被拒绝，避免自我提权。 */
const GUARD = { allowApiKey: false } as const;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write', GUARD);
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { name, scope, enabled } = body;

    const existing = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as any;
    if (!existing) {
      return apiError('API_KEY_NOT_FOUND', 'API key not found', 404, { details: { id } });
    }

    if (scope !== undefined && scope !== 'read' && scope !== 'write') {
      return apiError('INVALID_SCOPE', 'Scope must be "read" or "write"', 400, {
        details: { scope, allowed: ['read', 'write'] },
      });
    }

    db.prepare('UPDATE api_keys SET name = ?, scope = ?, enabled = ? WHERE id = ?').run(
      name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
      scope !== undefined ? scope : existing.scope,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      id,
    );

    const updated = db.prepare(
      'SELECT id, name, key_prefix, scope, enabled, last_used_at, created_at FROM api_keys WHERE id = ?'
    ).get(id) as any;

    return NextResponse.json(serializeRow(updated));
  } catch (error) {
    return serverError('PUT /api-keys/:id', error, 'Failed to update API key');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write', GUARD);
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    if (result.changes === 0) {
      return apiError('API_KEY_NOT_FOUND', 'API key not found', 404, { details: { id } });
    }
    return NextResponse.json({ deleted: true, id: Number(id) });
  } catch (error) {
    return serverError('DELETE /api-keys/:id', error, 'Failed to delete API key');
  }
}
