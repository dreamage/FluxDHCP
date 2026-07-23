import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET() {
  try {
    const db = getDb();
    const config = db.prepare('SELECT key, value FROM config').all() as Array<{ key: string; value: string }>;
    return NextResponse.json(Object.fromEntries(config.map(c => [c.key, c.value])));
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

const ALLOWED_KEYS = new Set([
  'server_ip', 'listen_interface', 'default_lease_time',
  't1_ratio', 't2_ratio', 'dhcp_enabled', 'web_port',
  'dhcp_log_retention_days', 'decline_blacklist_duration',
  'webhook_timeout', 'ip_allocation_order', 'honor_requested_ip',
]);

export async function PUT(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();

    const entries = Object.entries(body) as Array<[string, string]>;
    const filtered = entries.filter(([key]) => ALLOWED_KEYS.has(key));
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

    transaction(filtered);

    return NextResponse.json({ message: 'Config updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
