import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { validateWebhookUrl } from '@/lib/url-validate';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    const db = getDb();
    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const urlValidation = validateWebhookUrl(webhook.url);
    if (!urlValidation.valid) {
      return NextResponse.json({ error: urlValidation.error }, { status: 400 });
    }

    const fields: Array<{ name: string; value: string }> = JSON.parse(webhook.fields || '[]');
    let customHeaders: Record<string, string> = {};
    try { customHeaders = JSON.parse(webhook.headers || '{}'); } catch { /* ignore */ }

    const testVars: Record<string, string> = {
      mac_address: 'AA:BB:CC:DD:EE:FF',
      ip_address: '192.168.1.100',
      hostname: 'test-host',
      message_type: 'dhcp_ack',
      pool_name: 'test-pool',
      mac_note: 'test-note',
      timestamp: new Date().toISOString(),
    };

    function resolveValue(template: string): string {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => testVars[key] ?? '');
    }

    const resolvedFields: Record<string, string> = {};
    for (const f of fields) {
      resolvedFields[resolveValue(f.name)] = resolveValue(f.value);
    }

    const headers: Record<string, string> = { ...customHeaders };
    if (webhook.secret) {
      headers['X-Webhook-Secret'] = webhook.secret;
    }

    const fetchOptions: RequestInit = {
      method: webhook.method,
      headers,
      signal: AbortSignal.timeout(10000),
    };

    let targetUrl = webhook.url;

    if (webhook.method === 'GET') {
      if (fields.length > 0) {
        const url = new URL(webhook.url);
        for (const [k, v] of Object.entries(resolvedFields)) {
          url.searchParams.set(k, v);
        }
        targetUrl = url.toString();
      }
    } else {
      const bodyMode = webhook.body_mode || 'json';
      if (bodyMode === 'form') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        fetchOptions.body = new URLSearchParams(resolvedFields).toString();
      } else {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(resolvedFields);
      }
      fetchOptions.headers = headers;
    }

    const res = await fetch(targetUrl, fetchOptions);
    return NextResponse.json({
      success: res.ok,
      status: res.status,
      statusText: res.statusText,
      message: res.ok ? 'Test sent successfully' : `HTTP ${res.status}: ${res.statusText}`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Test failed',
    }, { status: 500 });
  }
}
