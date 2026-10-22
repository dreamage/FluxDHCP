import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { validateWebhookUrl } from '@/lib/url-validate';
import { apiError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function POST(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id } = body;

    const db = getDb();
    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as any;
    if (!webhook) {
      return apiError('WEBHOOK_NOT_FOUND', 'Webhook not found', 404, { details: { id } });
    }

    const urlValidation = validateWebhookUrl(webhook.url);
    if (!urlValidation.valid) {
      return apiError('INVALID_WEBHOOK_URL', urlValidation.error || 'Invalid webhook URL', 400, {
        details: { url: webhook.url },
        hint: 'Fix the webhook URL before testing.',
      });
    }

    // Read configurable timeout
    const timeoutRow = db.prepare("SELECT value FROM config WHERE key = 'webhook_timeout'").get() as { value: string } | undefined;
    const timeout = (timeoutRow ? parseInt(timeoutRow.value, 10) : 10) * 1000;

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

    const fetchOptions: RequestInit = {
      method: webhook.method,
      headers,
      signal: AbortSignal.timeout(timeout),
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
    // 投递失败属于业务结果而非 API 故障：返回 200 + success=false，便于调用方区分
    console.error('[API] POST /webhooks/test:', error);
    const message = error instanceof Error ? error.message : 'Test failed';
    return NextResponse.json({
      success: false,
      status: 0,
      statusText: '',
      message,
    });
  }
}
