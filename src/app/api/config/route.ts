import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { resolveDbPath } from '@/db';

export async function GET() {
  try {
    const db = getDb();
    const config = db.prepare('SELECT key, value FROM config').all() as Array<{ key: string; value: string }>;
    const result = Object.fromEntries(config.map(c => [c.key, c.value]));
    (result as any).db_path = resolveDbPath();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] GET /config:', error);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
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
  try {
    const db = getDb();
    const body = await request.json();

    const entries = Object.entries(body) as Array<[string, unknown]>;
    const filtered = entries.filter(([key]) => ALLOWED_KEYS.has(key));

    // Validate values
    for (const [key, value] of filtered) {
      const validator = VALIDATORS[key];
      if (validator && !validator.allow(value)) {
        return NextResponse.json({ error: 'Invalid config value' }, { status: 400 });
      }
    }

    if (filtered.length === 0) {
      return NextResponse.json({ error: 'No valid config keys provided' }, { status: 400 });
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

    return NextResponse.json({ message: 'Config updated' });
  } catch (error) {
    console.error('[API] PUT /config:', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
