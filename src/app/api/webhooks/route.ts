import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { validateWebhookUrl } from '@/lib/url-validate';

export async function GET() {
  try {
    const db = getDb();
    const webhooks = db.prepare('SELECT * FROM webhooks ORDER BY id').all();
    return NextResponse.json(webhooks);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, url, method, events, fields, body_mode, headers, secret } = body;

    if (!name || !url || !method || !events || events.length === 0) {
      return NextResponse.json({ error: 'Missing required fields: name, url, method, events' }, { status: 400 });
    }

    const validation = validateWebhookUrl(url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO webhooks (name, url, method, events, fields, body_mode, headers, secret)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, url, method,
      JSON.stringify(events),
      JSON.stringify(fields || []),
      body_mode || 'json',
      JSON.stringify(headers || {}),
      secret || null,
    );

    return NextResponse.json({ id: result.lastInsertRowid, message: 'Webhook created' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}
