import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get('webhook_id');
    const status = searchParams.get('status');
    const page = Math.min(parseInt(searchParams.get('page') || '1', 10), 1000);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);

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
    `).all(...params, pageSize, (page - 1) * pageSize);

    return NextResponse.json({
      total: total.count,
      page,
      pageSize,
      data: deliveries,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch webhook deliveries' }, { status: 500 });
  }
}
