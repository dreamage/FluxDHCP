import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { validateWebhookUrl } from '@/lib/url-validate';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }
    return NextResponse.json(webhook);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch webhook' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { name, url, method, events, fields, body_mode, headers, secret, enabled } = body;

    const existing = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    if (url) {
      const validation = validateWebhookUrl(url);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    db.prepare(`
      UPDATE webhooks SET
        name = ?, url = ?, method = ?, events = ?, fields = ?,
        body_mode = ?, headers = ?, secret = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name !== undefined ? name : existing.name,
      url !== undefined ? url : existing.url,
      method !== undefined ? method : existing.method,
      events !== undefined ? JSON.stringify(events) : existing.events,
      fields !== undefined ? JSON.stringify(fields) : existing.fields,
      body_mode !== undefined ? body_mode : existing.body_mode,
      headers !== undefined ? JSON.stringify(headers) : existing.headers,
      secret !== undefined ? secret : existing.secret,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      id,
    );

    return NextResponse.json({ message: 'Webhook updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    return NextResponse.json({ message: 'Webhook deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
