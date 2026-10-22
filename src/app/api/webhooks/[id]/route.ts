import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { validateWebhookUrl } from '@/lib/url-validate';
import { apiError, serializeRow, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

function serializeWebhook(row: any) {
  const parse = (v: unknown, fallback: any) => {
    if (typeof v !== 'string') return v ?? fallback;
    try { return JSON.parse(v); } catch { return fallback; }
  };
  return {
    ...serializeRow(row),
    events: parse(row.events, []),
    fields: parse(row.fields, []),
    headers: parse(row.headers, {}),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;
    if (!webhook) {
      return apiError('WEBHOOK_NOT_FOUND', 'Webhook not found', 404, { details: { id } });
    }
    return NextResponse.json(serializeWebhook(webhook));
  } catch (error) {
    return serverError('GET /webhooks/:id', error, 'Failed to fetch webhook');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { name, url, method, events, fields, body_mode, headers, enabled } = body;

    const existing = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;
    if (!existing) {
      return apiError('WEBHOOK_NOT_FOUND', 'Webhook not found', 404, { details: { id } });
    }

    if (url) {
      const validation = validateWebhookUrl(url);
      if (!validation.valid) {
        return apiError('INVALID_WEBHOOK_URL', validation.error || 'Invalid webhook URL', 400, {
          details: { url },
          hint: 'Use an http(s) URL that resolves to a public address (SSRF protection).',
        });
      }
    }

    db.prepare(`
      UPDATE webhooks SET
        name = ?, url = ?, method = ?, events = ?, fields = ?,
        body_mode = ?, headers = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name !== undefined ? name : existing.name,
      url !== undefined ? url : existing.url,
      method !== undefined ? method : existing.method,
      events !== undefined ? JSON.stringify(events) : existing.events,
      fields !== undefined ? JSON.stringify(fields) : existing.fields,
      body_mode !== undefined ? body_mode : existing.body_mode,
      headers !== undefined ? JSON.stringify(headers) : existing.headers,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      id,
    );

    const updated = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;
    return NextResponse.json(serializeWebhook(updated));
  } catch (error) {
    return serverError('PUT /webhooks/:id', error, 'Failed to update webhook');
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    if (result.changes === 0) {
      return apiError('WEBHOOK_NOT_FOUND', 'Webhook not found', 404, { details: { id } });
    }
    return NextResponse.json({ deleted: true, id: Number(id) });
  } catch (error) {
    return serverError('DELETE /webhooks/:id', error, 'Failed to delete webhook');
  }
}
