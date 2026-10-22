import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { CATEGORY_TABLES } from '@/lib/config-categories';
import { serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const db = getDb();
    const counts: Record<string, number> = {};
    for (const [cat, table] of Object.entries(CATEGORY_TABLES)) {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      counts[cat] = row.count;
    }
    return NextResponse.json(counts);
  } catch (error) {
    return serverError('GET /config/stats', error, 'Failed to fetch config stats');
  }
}
