import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function DELETE(request: Request, { params }: { params: Promise<{ ip: string }> }) {
  try {
    const { ip } = await params;
    const url = new URL(request.url);
    const purge = url.searchParams.get('purge') === 'true';
    const db = getDb();

    if (purge) {
      // Actually delete the lease row (for released/expired leases)
      const result = db.prepare(`
        DELETE FROM leases WHERE ip_address = ? AND state IN ('RELEASED', 'EXPIRED')
      `).run(ip);

      if (result.changes === 0) {
        return NextResponse.json({ error: 'No released/expired lease found for this IP' }, { status: 404 });
      }

      return NextResponse.json({ message: 'Lease deleted' });
    }

    // Default: release (change state to RELEASED)
    const result = db.prepare(`
      UPDATE leases SET state = 'RELEASED'
      WHERE ip_address = ? AND state IN ('BOUND', 'OFFERED')
    `).run(ip);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'No active lease found for this IP' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Lease released' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process lease' }, { status: 500 });
  }
}
