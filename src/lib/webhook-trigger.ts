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

// Available template variables
function buildTemplateVars(data: Record<string, any>, eventName: string): Record<string, string> {
  // Look up MAC note from database
  let macNote = '';
  const macAddr = data.mac_address || data.client_mac || '';
  if (macAddr) {
    try {
      const db = getDb();
      const row = db.prepare('SELECT note FROM mac_notes WHERE mac_address = ?').get(macAddr) as any;
      if (row) macNote = row.note;
    } catch { /* ignore */ }
  }

  return {
    mac_address: macAddr,
    ip_address: data.ip_address || data.client_ip || '',
    hostname: data.hostname || '',
    message_type: eventName,
    pool_name: data.pool_name || '',
    mac_note: macNote,
    timestamp: new Date().toISOString(),
  };
}

function resolveValue(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export async function triggerWebhooks(eventType: number, data: Record<string, any>): Promise<void> {
  try {
    const db = getDb();
    const eventName = EVENT_MAP[eventType];
    if (!eventName) return;

    const webhooks = db.prepare(
      'SELECT * FROM webhooks WHERE enabled = 1'
    ).all() as any[];

    const vars = buildTemplateVars(data, eventName);

    for (const webhook of webhooks) {
      const events: string[] = JSON.parse(webhook.events);
      if (!events.includes(eventName)) continue;

      if (!validateWebhookUrl(webhook.url).valid) continue;

      const fields: Array<{ name: string; value: string }> = JSON.parse(webhook.fields || '[]');
      let headers: Record<string, string> = {};
      try { headers = JSON.parse(webhook.headers || '{}'); } catch { /* ignore */ }

      const reqHeaders: Record<string, string> = { ...headers };
      if (webhook.secret) {
        reqHeaders['X-Webhook-Secret'] = webhook.secret;
      }

      const fetchOptions: RequestInit = {
        method: webhook.method,
        headers: reqHeaders,
        signal: AbortSignal.timeout(10000),
      };

      // Resolve field name-value pairs with template variables
      const resolvedFields: Record<string, string> = {};
      for (const f of fields) {
        resolvedFields[resolveValue(f.name, vars)] = resolveValue(f.value, vars);
      }

      if (webhook.method === 'GET') {
        // Append as query params
        const url = new URL(webhook.url);
        for (const [k, v] of Object.entries(resolvedFields)) {
          url.searchParams.set(k, v);
        }
        fetch(webhook.url + (fields.length > 0 ? '?' + url.searchParams.toString() : ''), fetchOptions)
          .catch(err => console.error(`[Webhook] Failed: ${webhook.name}`, err));
      } else {
        // POST
        const bodyMode = webhook.body_mode || 'json';
        if (bodyMode === 'form') {
          reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
          fetchOptions.headers = reqHeaders;
          fetchOptions.body = new URLSearchParams(resolvedFields).toString();
        } else {
          reqHeaders['Content-Type'] = 'application/json';
          fetchOptions.headers = reqHeaders;
          fetchOptions.body = JSON.stringify(resolvedFields);
        }
        fetch(webhook.url, fetchOptions)
          .catch(err => console.error(`[Webhook] Failed: ${webhook.name}`, err));
      }
    }
  } catch (err) {
    console.error('[Webhook] Error triggering webhooks:', err);
  }
}
