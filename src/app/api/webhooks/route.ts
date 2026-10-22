import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { validateWebhookUrl } from '@/lib/url-validate';
import { apiError, parsePage, pageResult, serializeRow, serverError } from '@/lib/api-response';
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

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams, { defaultPageSize: 50, maxPageSize: 1000 });

    const total = (db.prepare('SELECT COUNT(*) as count FROM webhooks').get() as { count: number }).count;
    const webhooks = db.prepare('SELECT * FROM webhooks ORDER BY id LIMIT ? OFFSET ?')
      .all(page.pageSize, page.offset) as any[];

    return NextResponse.json(pageResult(webhooks.map(serializeWebhook), page, total));
  } catch (error) {
    return serverError('GET /webhooks', error, 'Failed to fetch webhooks');
  }
}

export async function POST(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const body = await request.json();
    const { name, url, method, events, fields, body_mode, headers } = body;

    if (!name || !url || !method || !events || events.length === 0) {
      return apiError('MISSING_REQUIRED_FIELDS', 'Missing required fields: name, url, method, events', 400, {
        details: { required: ['name', 'url', 'method', 'events'] },
      });
    }

    const validation = validateWebhookUrl(url);
    if (!validation.valid) {
      return apiError('INVALID_WEBHOOK_URL', validation.error || 'Invalid webhook URL', 400, {
        details: { url },
        hint: 'Use an http(s) URL that resolves to a public address (SSRF protection).',
      });
    }

    const result = db.prepare(`
      INSERT INTO webhooks (name, url, method, events, fields, body_mode, headers)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, url, method,
      JSON.stringify(events),
      JSON.stringify(fields || []),
      body_mode || 'json',
      JSON.stringify(headers || {}),
    );

    const created = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(result.lastInsertRowid) as any;
    return NextResponse.json(serializeWebhook(created), { status: 201 });
  } catch (error) {
    return serverError('POST /webhooks', error, 'Failed to create webhook');
  }
}
