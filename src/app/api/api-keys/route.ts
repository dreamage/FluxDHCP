import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { apiError, parsePage, pageResult, serializeRow, serializeRows, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';
import { generateApiKey } from '@/lib/api-keys';

/** 密钥管理只能从 Web UI 操作，使用 API Key 调用会被拒绝，避免自我提权。 */
const GUARD = { allowApiKey: false } as const;

export async function GET(request: Request) {
  const denied = authorize(request, 'write', GUARD);
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams, { defaultPageSize: 50, maxPageSize: 500 });

    const total = (db.prepare('SELECT COUNT(*) as count FROM api_keys').get() as { count: number }).count;
    // 只返回前缀，明文与摘要都不出库
    const rows = db.prepare(
      'SELECT id, name, key_prefix, scope, enabled, last_used_at, created_at FROM api_keys ORDER BY id LIMIT ? OFFSET ?'
    ).all(page.pageSize, page.offset) as any[];

    return NextResponse.json(pageResult(serializeRows(rows), page, total));
  } catch (error) {
    return serverError('GET /api-keys', error, 'Failed to fetch API keys');
  }
}

export async function POST(request: Request) {
  const denied = authorize(request, 'write', GUARD);
  if (denied) return denied;

  try {
    const db = getDb();
    const body = await request.json();
    const { name, scope } = body;

    if (!name || !String(name).trim()) {
      return apiError('MISSING_REQUIRED_FIELDS', 'Missing required fields', 400, {
        details: { required: ['name'] },
      });
    }

    const finalScope = scope === 'write' ? 'write' : scope === 'read' ? 'read' : null;
    if (!finalScope) {
      return apiError('INVALID_SCOPE', 'Scope must be "read" or "write"', 400, {
        details: { scope, allowed: ['read', 'write'] },
      });
    }

    const { plaintext, prefix, hash } = generateApiKey();

    const result = db.prepare(`
      INSERT INTO api_keys (name, key_prefix, key_hash, scope) VALUES (?, ?, ?, ?)
    `).run(String(name).trim(), prefix, hash, finalScope);

    const created = db.prepare(
      'SELECT id, name, key_prefix, scope, enabled, last_used_at, created_at FROM api_keys WHERE id = ?'
    ).get(result.lastInsertRowid) as any;

    // 明文仅在此处返回一次，之后无法再获取
    return NextResponse.json({ ...serializeRow(created), key: plaintext }, { status: 201 });
  } catch (error) {
    return serverError('POST /api-keys', error, 'Failed to create API key');
  }
}
