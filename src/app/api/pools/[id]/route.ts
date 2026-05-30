import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(id);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    return NextResponse.json({ ...(pool as any), dns_servers: (pool as any).dns_servers ? JSON.parse((pool as any).dns_servers) : [] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pool' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time, enabled } = body;

    const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(id);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    const dnsJson = dns_servers ? JSON.stringify(dns_servers) : null;

    db.prepare(`
      UPDATE pools SET name = ?, subnet = ?, netmask = ?, start_ip = ?, end_ip = ?, gateway = ?, dns_servers = ?, lease_time = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name || (pool as any).name,
      subnet || (pool as any).subnet,
      netmask || (pool as any).netmask,
      start_ip || (pool as any).start_ip,
      end_ip || (pool as any).end_ip,
      gateway !== undefined ? gateway : (pool as any).gateway,
      dnsJson !== undefined ? dnsJson : (pool as any).dns_servers,
      lease_time !== undefined ? lease_time : (pool as any).lease_time,
      enabled !== undefined ? (enabled ? 1 : 0) : (pool as any).enabled,
      id,
    );

    return NextResponse.json({ message: 'Pool updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update pool' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    // 检查是否有活跃租约
    const activeLeases = db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
    ).get(id) as { count: number };

    if (activeLeases.count > 0) {
      return NextResponse.json({ error: `Pool has ${activeLeases.count} active lease(s). Release them first.` }, { status: 409 });
    }

    // 删除关联的保留地址
    db.prepare('DELETE FROM reservations WHERE pool_id = ?').run(id);
    // 删除关联的租约
    db.prepare('DELETE FROM leases WHERE pool_id = ?').run(id);
    // 删除地址池
    db.prepare('DELETE FROM pools WHERE id = ?').run(id);

    return NextResponse.json({ message: 'Pool deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete pool' }, { status: 500 });
  }
}
