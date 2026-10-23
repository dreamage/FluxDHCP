import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { DEFAULT_EXPORT_KEYS, CATEGORY_TABLES } from '@/lib/config-categories';
import { serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

// 各类别对应的查询 SQL(部分表排除敏感字段)
const QUERY_SQL: Record<string, string> = {
  pools: 'SELECT * FROM pools',
  reservations: 'SELECT * FROM reservations',
  device_options: 'SELECT * FROM device_options',
  mac_blacklist: 'SELECT * FROM mac_blacklist',
  mac_notes: 'SELECT * FROM mac_notes',
  webhooks: 'SELECT id, name, url, method, events, fields, body_mode, headers, enabled, created_at, updated_at FROM webhooks',
  config: 'SELECT key, value FROM config',
  api_keys: 'SELECT id, name, key_prefix, key_hash, scope, enabled, last_used_at, created_at FROM api_keys',
  leases: 'SELECT * FROM leases',
  dhcp_logs: 'SELECT * FROM dhcp_logs',
};

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const catsParam = searchParams.get('categories');
    const categories = catsParam
      ? catsParam.split(',').filter(c => CATEGORY_TABLES[c])
      : DEFAULT_EXPORT_KEYS;

    const data: Record<string, any> = {
      version: 1,
      exported_at: new Date().toISOString(),
    };

    for (const cat of categories) {
      data[cat] = db.prepare(QUERY_SQL[cat]).all();
    }

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="fluxdhcp-config-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return serverError('GET /config/export', error, 'Failed to export config');
  }
}
