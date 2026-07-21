import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { dhcpInstance } from '@/lib/dhcp-instance';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.version || !body.config) {
      return NextResponse.json({ error: 'Invalid config file format' }, { status: 400 });
    }

    const db = getDb();
    const clearLeases = body.clearLeases === true;
    const clearLogs = body.clearLogs === true;

    const importTransaction = db.transaction(() => {
      // 0. Optionally clear leases and logs
      if (clearLeases) {
        db.prepare('DELETE FROM leases').run();
        db.prepare('DELETE FROM declined_ips').run();
      }
      if (clearLogs) {
        db.prepare('DELETE FROM logs').run();
      }

      // 1. Config
      const upsertConfig = db.prepare(
        'INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
      );
      for (const row of (body.config || [])) {
        upsertConfig.run(row.key, row.value);
      }

      // 2. Pools
      if (body.pools) {
        db.prepare('DELETE FROM pools').run();
        const insertPool = db.prepare(`
          INSERT INTO pools (id, name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of body.pools) {
          insertPool.run(p.id, p.name, p.subnet, p.netmask, p.start_ip, p.end_ip, p.gateway || null, p.dns_servers || null, p.lease_time || 86400, p.enabled ?? 1, p.created_at || null, p.updated_at || null);
        }
      }

      // 3. Reservations
      if (body.reservations) {
        db.prepare('DELETE FROM reservations').run();
        const insertRes = db.prepare(`
          INSERT INTO reservations (id, mac_address, ip_address, hostname, pool_id, description, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of body.reservations) {
          insertRes.run(r.id, r.mac_address, r.ip_address, r.hostname || null, r.pool_id || null, r.description || null, r.enabled ?? 1, r.created_at || null, r.updated_at || null);
        }
      }

      // 4. Device options
      if (body.device_options) {
        db.prepare('DELETE FROM device_options').run();
        const insertOpt = db.prepare(`
          INSERT INTO device_options (id, mac_address, option_code, option_value, option_name, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const o of body.device_options) {
          insertOpt.run(o.id, o.mac_address, o.option_code, o.option_value, o.option_name || null, o.created_at || null);
        }
      }

      // 5. Webhooks
      if (body.webhooks) {
        db.prepare('DELETE FROM webhooks').run();
        const insertWh = db.prepare(`
          INSERT INTO webhooks (id, name, url, method, events, fields, body_mode, headers, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const w of body.webhooks) {
          insertWh.run(w.id, w.name, w.url, w.method || 'POST', w.events || '[]', w.fields || '[]', w.body_mode || 'json', w.headers || '{}', w.enabled ?? 1, w.created_at || null, w.updated_at || null);
        }
      }

      // 6. MAC notes
      if (body.mac_notes) {
        db.prepare('DELETE FROM mac_notes').run();
        const insertNote = db.prepare(`
          INSERT INTO mac_notes (mac_address, note, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `);
        for (const n of body.mac_notes) {
          insertNote.run(n.mac_address, n.note, n.created_at || null, n.updated_at || null);
        }
      }
    });

    importTransaction();

    // Reload DHCP config in memory
    try {
      dhcpInstance.reloadConfig();
    } catch { /* DHCP may not be initialized */ }

    // Sync the running state of the DHCP service with the imported
    // dhcp_enabled value so the live process matches the imported config
    // (otherwise a restart would be required for them to match).
    try {
      const importedEnabled = (body.config || []).find(
        (c: { key: string; value: string }) => c.key === 'dhcp_enabled',
      );
      const currentStatus = dhcpInstance.getStatus();
      if (importedEnabled?.value === '1' && currentStatus === 'stopped') {
        await dhcpInstance.start();
      } else if (importedEnabled?.value === '0' && currentStatus === 'running') {
        await dhcpInstance.stop();
      }
    } catch (e) {
      console.error('[API] Failed to sync DHCP state after import:', e);
    }

    return NextResponse.json({
      message: 'Config imported successfully',
      tables: {
        config: body.config?.length || 0,
        pools: body.pools?.length || 0,
        reservations: body.reservations?.length || 0,
        device_options: body.device_options?.length || 0,
        webhooks: body.webhooks?.length || 0,
        mac_notes: body.mac_notes?.length || 0,
      },
      cleared: {
        leases: clearLeases,
        logs: clearLogs,
      },
    });
  } catch (error) {
    console.error('[API] Config import error:', error);
    return NextResponse.json({ error: 'Failed to import config' }, { status: 500 });
  }
}
