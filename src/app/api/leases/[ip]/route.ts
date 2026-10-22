import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { apiError, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';

export async function DELETE(request: Request, { params }: { params: Promise<{ ip: string }> }) {
  const denied = authorize(request, 'write');
  if (denied) return denied;

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
        return apiError('LEASE_NOT_PURGEABLE', 'No released/expired lease found for this IP', 404, {
          details: { ip_address: ip },
          hint: 'Only leases in RELEASED or EXPIRED state can be purged.',
        });
      }

      return NextResponse.json({ deleted: true, ip_address: ip });
    }

    // Default: release (change state to RELEASED)
    const result = db.prepare(`
      UPDATE leases SET state = 'RELEASED'
      WHERE ip_address = ? AND state IN ('BOUND', 'OFFERED')
    `).run(ip);

    if (result.changes === 0) {
      return apiError('LEASE_NOT_ACTIVE', 'No active lease found for this IP', 404, {
        details: { ip_address: ip },
        hint: 'Only leases in BOUND or OFFERED state can be released.',
      });
    }

    return NextResponse.json({ released: true, ip_address: ip, state: 'RELEASED' });
  } catch (error) {
    return serverError('DELETE /leases/:ip', error, 'Failed to process lease');
  }
}
