import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

const ALLOWED_SORT_FIELDS: Record<string, string> = {
  ip_address: 'l.ip_address',
  mac_address: 'l.mac_address',
  hostname: 'l.hostname',
  state: 'l.state',
  lease_start: 'l.lease_start',
  lease_end: 'l.lease_end',
  pool_name: 'p.name',
};

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 500);
    const sortField = searchParams.get('sort') || 'lease_end';
    const sortOrder = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

    let whereClause = '';
    const params: any[] = [];

    if (state && state !== 'ALL') {
      whereClause = 'WHERE l.state = ?';
      params.push(state);
    }

    const orderColumn = ALLOWED_SORT_FIELDS[sortField] || 'l.lease_end';

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM leases l ${whereClause}`
    ).get(...params) as { count: number };

    const leases = db.prepare(`
      SELECT l.*, p.name as pool_name
      FROM leases l
      LEFT JOIN pools p ON l.pool_id = p.id
      ${whereClause}
      ORDER BY ${orderColumn} ${sortOrder}
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
