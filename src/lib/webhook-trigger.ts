import { getDb } from './db-instance';
import { validateWebhookUrl } from './url-validate';

const EVENT_MAP: Record<number, string> = {
  1: 'dhcp_discover',
  2: 'dhcp_offer',
  3: 'dhcp_request',
  4: 'dhcp_decline',
  5: 'dhcp_ack',
  6: 'dhcp_nak',
  7: 'dhcp_release',
  8: 'dhcp_inform',
};

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s exponential backoff

function getWebhookTimeout(): number {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM config WHERE key = 'webhook_timeout'").get() as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 10000;
  } catch {
    return 10000;
  }
}

function buildTemplateVars(data: Record<string, any>, eventName: string): Record<string, string> {
  let macNote = '';
  const macAddr = data.mac_address || data.client_mac || '';
  if (macAddr) {
    try {
      const db = getDb();
      const row = db.prepare('SELECT note FROM mac_notes WHERE mac_address = ?').get(macAddr) as any;
      if (row) macNote = row.note;
    } catch { /* ignore */ }
  }

  // Resolve pool_name from pool_id if not directly provided
  let poolName = data.pool_name || '';
  if (!poolName && data.pool_id) {
    try {
      const db = getDb();
      const pool = db.prepare('SELECT name FROM pools WHERE id = ?').get(data.pool_id) as any;
      if (pool) poolName = pool.name;
    } catch { /* ignore */ }
  }

  return {
    mac_address: macAddr,
    ip_address: data.ip_address || data.client_ip || '',
    hostname: data.hostname || '',
    message_type: eventName,
    pool_name: poolName,
    mac_note: macNote,
    timestamp: new Date().toISOString(),
  };
}

function resolveValue(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function logDelivery(
  webhookId: number,
  webhookName: string,
  eventType: string,
  url: string,
  method: string,
  status: string,
  attempt: number,
  httpStatus?: number,
  response?: string,
  error?: string,
): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, webhook_name, event_type, url, method, status, http_status, response, error, attempt, max_attempts, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(webhookId, webhookName, eventType, url, method, status, httpStatus || null, response || null, error || null, attempt, MAX_ATTEMPTS);
  } catch (err) {
    console.error('[Webhook] Failed to log delivery:', err);
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  webhookId: number,
  webhookName: string,
  eventType: string,
  method: string,
): Promise<void> {
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, options);
      const body = await res.text().catch(() => '');

      if (res.ok) {
        logDelivery(webhookId, webhookName, eventType, url, method, 'success', attempt, res.status, body.slice(0, 500));
        return;
      }

      // HTTP error (4xx/5xx) — retry on 5xx only
      lastError = `HTTP ${res.status}: ${body.slice(0, 200)}`;
      logDelivery(webhookId, webhookName, eventType, url, method, 'failed', attempt, res.status, body.slice(0, 500), lastError);

      if (res.status < 500) return; // Don't retry client errors

    } catch (err: any) {
      lastError = err?.message || String(err);
      logDelivery(webhookId, webhookName, eventType, url, method, 'failed', attempt, undefined, undefined, lastError);
    }

    // Wait before retry (exponential backoff)
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
    }
  }

  // All attempts failed
  logDelivery(webhookId, webhookName, eventType, url, method, 'error', MAX_ATTEMPTS, undefined, undefined, `All ${MAX_ATTEMPTS} attempts failed. Last: ${lastError}`);
  console.error(`[Webhook] Failed after ${MAX_ATTEMPTS} attempts: ${webhookName} (${url}) - ${lastError}`);
}

export async function triggerWebhooks(eventType: number, data: Record<string, any>): Promise<void> {
  try {
    const db = getDb();
    const eventName = EVENT_MAP[eventType];
    if (!eventName) return;

    const webhooks = db.prepare(
      'SELECT * FROM webhooks WHERE enabled = 1'
    ).all() as any[];

    if (webhooks.length === 0) return;

    const vars = buildTemplateVars(data, eventName);
    const timeout = getWebhookTimeout();

    for (const webhook of webhooks) {
      const events: string[] = JSON.parse(webhook.events);
      if (!events.includes(eventName)) continue;

      if (!validateWebhookUrl(webhook.url).valid) {
        console.warn(`[Webhook] Skipping invalid URL: ${webhook.name}`);
        continue;
      }

      const fields: Array<{ name: string; value: string }> = JSON.parse(webhook.fields || '[]');
      let headers: Record<string, string> = {};
      try { headers = JSON.parse(webhook.headers || '{}'); } catch { /* ignore */ }

      const reqHeaders: Record<string, string> = { ...headers };
      if (webhook.secret) {
        reqHeaders['X-Webhook-Secret'] = webhook.secret;
      }

      // Resolve field name-value pairs with template variables
      const resolvedFields: Record<string, string> = {};
      for (const f of fields) {
        resolvedFields[resolveValue(f.name, vars)] = resolveValue(f.value, vars);
      }

      let targetUrl = webhook.url;
      const fetchOptions: RequestInit = {
        method: webhook.method,
        headers: reqHeaders,
        signal: AbortSignal.timeout(timeout),
      };

      if (webhook.method === 'GET') {
        const urlObj = new URL(webhook.url);
        for (const [k, v] of Object.entries(resolvedFields)) {
          urlObj.searchParams.set(k, v);
        }
        targetUrl = urlObj.toString();
      } else {
        const bodyMode = webhook.body_mode || 'json';
        if (bodyMode === 'form') {
          reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
          fetchOptions.body = new URLSearchParams(resolvedFields).toString();
        } else {
          reqHeaders['Content-Type'] = 'application/json';
          fetchOptions.body = JSON.stringify(resolvedFields);
        }
        fetchOptions.headers = reqHeaders;
      }

      // Fire with retry (non-blocking — don't await in the caller)
      fetchWithRetry(targetUrl, fetchOptions, webhook.id, webhook.name, eventName, webhook.method)
        .catch(err => console.error(`[Webhook] Unexpected error: ${webhook.name}`, err));
    }
  } catch (err) {
    console.error('[Webhook] Error triggering webhooks:', err);
  }
}
