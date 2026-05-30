import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    let whereClause = '';
    const params: any[] = [];

    if (state && state !== 'ALL') {
      whereClause = 'WHERE l.state = ?';
      params.push(state);
    }

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM leases l ${whereClause}`
    ).get(...params) as { count: number };

    const leases = db.prepare(`
      SELECT l.*, p.name as pool_name
      FROM leases l
      LEFT JOIN pools p ON l.pool_id = p.id
      ${whereClause}
      ORDER BY l.lease_end DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);

    return NextResponse.json({
      total: total.count,
      page,
      pageSize,
      data: leases,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch leases' }, { status: 500 });
  }
}
