import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { resolveDbPath } from '@/db';
import { dhcpInstance } from '@/lib/dhcp-instance';
import { apiError, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

function readConfig(db: ReturnType<typeof getDb>) {
  const rows = db.prepare('SELECT key, value FROM config').all() as Array<{ key: string; value: string }>;
  const result = Object.fromEntries(rows.map(c => [c.key, c.value]));
  (result as any).db_path = resolveDbPath();
  return result;
}

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    return NextResponse.json(readConfig(getDb()));
  } catch (error) {
    return serverError('GET /config', error, 'Failed to fetch config');
  }
}

const ALLOWED_KEYS = new Set([
  'server_ip', 'listen_interface', 'default_lease_time',
  't1_ratio', 't2_ratio', 'dhcp_enabled', 'web_port',
  'dhcp_log_retention_days', 'decline_blacklist_duration',
  'webhook_timeout', 'ip_allocation_order', 'honor_requested_ip',
]);

function isPositiveInt(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n === Math.floor(n);
}

function isFiniteRatio(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 1;
}

const VALIDATORS: Record<string, { allow: (v: unknown) => boolean; msg: string }> = {
  server_ip:                 { allow: (v) => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(v)), msg: 'Invalid IPv4 address' },
  listen_interface:          { allow: (v) => String(v).trim().length > 0, msg: 'Listen interface must not be empty' },
  default_lease_time:        { allow: (v) => isPositiveInt(v) && Number(v) >= 60, msg: 'Must be an integer >= 60' },
  t1_ratio:                  { allow: isFiniteRatio, msg: 'Must be a number between 0 (exclusive) and 1' },
  t2_ratio:                  { allow: isFiniteRatio, msg: 'Must be a number between 0 (exclusive) and 1' },
  dhcp_enabled:              { allow: (v) => String(v) === '0' || String(v) === '1', msg: 'Must be 0 or 1' },
  web_port:                  { allow: (v) => isPositiveInt(v) && Number(v) <= 65535, msg: 'Must be a port number (1–65535)' },
  dhcp_log_retention_days:   { allow: isPositiveInt, msg: 'Must be a positive integer' },
  decline_blacklist_duration:{ allow: isPositiveInt, msg: 'Must be a positive integer' },
  webhook_timeout:           { allow: isPositiveInt, msg: 'Must be a positive integer' },
  ip_allocation_order:       { allow: (v) => String(v) === 'sequential' || String(v) === 'random', msg: 'Must be sequential or random' },
  honor_requested_ip:        { allow: (v) => String(v) === '0' || String(v) === '1', msg: 'Must be 0 or 1' },
};

export async function PUT(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const body = await request.json();

    const entries = Object.entries(body) as Array<[string, unknown]>;
    const filtered = entries.filter(([key]) => ALLOWED_KEYS.has(key));

    // Validate values
    for (const [key, value] of filtered) {
      const validator = VALIDATORS[key];
      if (validator && !validator.allow(value)) {
        return apiError('CONFIG_INVALID_VALUE', 'Invalid config value', 400, {
          details: { key, value: String(value), reason: validator.msg },
          hint: `Fix "${key}": ${validator.msg}.`,
        });
      }
    }

    if (filtered.length === 0) {
      return apiError('CONFIG_NO_VALID_KEYS', 'No valid config keys provided', 400, {
        details: { allowedKeys: Array.from(ALLOWED_KEYS) },
      });
    }

    const updateStmt = db.prepare(`
      UPDATE config SET value = ?, updated_at = datetime('now') WHERE key = ?
    `);

    const transaction = db.transaction((items: Array<[string, string]>) => {
      for (const [key, value] of items) {
        updateStmt.run(String(value), key);
      }
    });

    transaction(filtered.map(([k, v]) => [k, String(v)] as [string, string]));

    const config = readConfig(db);

    // 立即生效：重载内存参数；server_ip 变更会重新 bind，dhcp_enabled 变更会启停服务
    try {
      await dhcpInstance.applyConfigChange();
    } catch (err) {
      console.error('[API] PUT /config: DHCP apply failed:', err);
      return NextResponse.json({
        ...config,
        warning: `Config saved but DHCP server did not apply it: ${err instanceof Error ? err.message : String(err)}`,
        dhcpStatus: dhcpInstance.getStatus(),
      }, { status: 200 });
    }

    return NextResponse.json({ ...config, dhcpStatus: dhcpInstance.getStatus() });
  } catch (error) {
    return serverError('PUT /config', error, 'Failed to update config');
  }
}
