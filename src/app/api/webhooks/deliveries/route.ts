import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { parsePage, pageResult, serializeRows, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get('webhook_id');
    const status = searchParams.get('status');
    const page = parsePage(searchParams, { defaultPageSize: 50, maxPageSize: 200 });

    const conditions: string[] = [];
    const params: any[] = [];

    if (webhookId) {
      conditions.push('webhook_id = ?');
      params.push(parseInt(webhookId, 10));
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM webhook_deliveries ${whereClause}`
    ).get(...params) as { count: number };

    const deliveries = db.prepare(`
      SELECT * FROM webhook_deliveries
      ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, page.pageSize, page.offset) as any[];

    return NextResponse.json(pageResult(serializeRows(deliveries), page, total.count));
  } catch (error) {
    return serverError('GET /webhooks/deliveries', error, 'Failed to fetch webhook deliveries');
  }
}

export async function DELETE(request: Request) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM webhook_deliveries').run();
    return NextResponse.json({ deleted: true, deletedCount: result.changes });
  } catch (error) {
    return serverError('DELETE /webhooks/deliveries', error, 'Failed to clear webhook deliveries');
  }
}
