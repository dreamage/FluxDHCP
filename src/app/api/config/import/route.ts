import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { dhcpInstance } from '@/lib/dhcp-instance';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.version) {
      return NextResponse.json({ error: 'Invalid config file format' }, { status: 400 });
    }

    const db = getDb();
    // 选中的类别;未提供则默认全部文件中包含的类别
    const fileCats = Object.keys(body).filter(k => k !== 'version' && k !== 'exported_at');
    const categories: string[] = Array.isArray(body.categories) && body.categories.length > 0
      ? body.categories.filter((c: string) => fileCats.includes(c))
      : fileCats;

    const imported: Record<string, number> = {};

    const importTransaction = db.transaction(() => {
      // 1. Config
      if (categories.includes('config') && Array.isArray(body.config)) {
        const upsertConfig = db.prepare(
          'INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
        );
        for (const row of body.config) {
          // Skip deprecated language config key
          if (row.key === 'language') continue;
          // Backward compat: rename old log_retention_days → dhcp_log_retention_days
          const key = row.key === 'log_retention_days' ? 'dhcp_log_retention_days' : row.key;
          upsertConfig.run(key, row.value);
        }
        imported.config = body.config.length;
      }

      // 2. Pools
      if (categories.includes('pools') && Array.isArray(body.pools)) {
        db.prepare('DELETE FROM pools').run();
        const ins = db.prepare(`INSERT INTO pools (id, name, subnet, netmask, start_ip, end_ip, gateway, dns_servers, lease_time, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const p of body.pools) {
          ins.run(p.id, p.name, p.subnet, p.netmask, p.start_ip, p.end_ip, p.gateway || null, p.dns_servers || null, p.lease_time || 86400, p.enabled ?? 1, p.created_at || null, p.updated_at || null);
        }
        imported.pools = body.pools.length;
      }

      // 3. Reservations
      if (categories.includes('reservations') && Array.isArray(body.reservations)) {
        db.prepare('DELETE FROM reservations').run();
        const ins = db.prepare(`INSERT INTO reservations (id, mac_address, ip_address, hostname, pool_id, description, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const r of body.reservations) {
          ins.run(r.id, r.mac_address, r.ip_address, r.hostname || null, r.pool_id || null, r.description || null, r.enabled ?? 1, r.created_at || null, r.updated_at || null);
        }
        imported.reservations = body.reservations.length;
      }

      // 4. Device options
      if (categories.includes('device_options') && Array.isArray(body.device_options)) {
        db.prepare('DELETE FROM device_options').run();
        const ins = db.prepare(`INSERT INTO device_options (id, mac_address, option_code, option_value, option_name, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const o of body.device_options) {
          ins.run(o.id, o.mac_address, o.option_code, o.option_value, o.option_name || null, o.created_at || null);
        }
        imported.device_options = body.device_options.length;
      }

      // 5. MAC blacklist
      if (categories.includes('mac_blacklist') && Array.isArray(body.mac_blacklist)) {
        db.prepare('DELETE FROM mac_blacklist').run();
        const ins = db.prepare(`INSERT INTO mac_blacklist (mac_address, reason, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
        for (const m of body.mac_blacklist) {
          ins.run(m.mac_address, m.reason || '', m.enabled ?? 1, m.created_at || null, m.updated_at || null);
        }
        imported.mac_blacklist = body.mac_blacklist.length;
      }

      // 6. MAC notes
      if (categories.includes('mac_notes') && Array.isArray(body.mac_notes)) {
        db.prepare('DELETE FROM mac_notes').run();
        const ins = db.prepare(`INSERT INTO mac_notes (mac_address, note, created_at, updated_at) VALUES (?, ?, ?, ?)`);
        for (const n of body.mac_notes) {
          ins.run(n.mac_address, n.note, n.created_at || null, n.updated_at || null);
        }
        imported.mac_notes = body.mac_notes.length;
      }

      // 7. Webhooks
      if (categories.includes('webhooks') && Array.isArray(body.webhooks)) {
        db.prepare('DELETE FROM webhooks').run();
        const ins = db.prepare(`INSERT INTO webhooks (id, name, url, method, events, fields, body_mode, headers, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const w of body.webhooks) {
          ins.run(w.id, w.name, w.url, w.method || 'POST', w.events || '[]', w.fields || '[]', w.body_mode || 'json', w.headers || '{}', w.enabled ?? 1, w.created_at || null, w.updated_at || null);
        }
        imported.webhooks = body.webhooks.length;
      }

      // 8. Leases
      if (categories.includes('leases') && Array.isArray(body.leases)) {
        db.prepare('DELETE FROM leases').run();
        db.prepare('DELETE FROM declined_ips').run();
        const ins = db.prepare(`INSERT INTO leases (ip_address, mac_address, hostname, state, pool_id, lease_start, lease_end, client_id, vendor_class, requested_ip, xid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const l of body.leases) {
          ins.run(l.ip_address, l.mac_address, l.hostname || null, l.state, l.pool_id || null, l.lease_start || null, l.lease_end || null, l.client_id || null, l.vendor_class || null, l.requested_ip || null, l.xid || null);
        }
        imported.leases = body.leases.length;
      }

      // 9. DHCP logs
      if (categories.includes('dhcp_logs') && Array.isArray(body.dhcp_logs)) {
        db.prepare('DELETE FROM dhcp_logs').run();
        const ins = db.prepare(`INSERT INTO dhcp_logs (timestamp, message_type, client_mac, client_ip, yiaddr, siaddr, giaddr, requested_ip, hostname, client_id, vendor_class, xid, raw_options, pool_id, server_response, direction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const log of body.dhcp_logs) {
          ins.run(log.timestamp || null, log.message_type, log.client_mac, log.client_ip || null, log.yiaddr || null, log.siaddr || null, log.giaddr || null, log.requested_ip || null, log.hostname || null, log.client_id || null, log.vendor_class || null, log.xid || null, log.raw_options || null, log.pool_id || null, log.server_response || null, log.direction || 'recv');
        }
        imported.dhcp_logs = body.dhcp_logs.length;
      }
    });

    try {
      db.pragma('foreign_keys = OFF');
      importTransaction();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    // Reload DHCP config in memory
    try {
      dhcpInstance.reloadConfig();
    } catch { /* DHCP may not be initialized */ }

    // Sync the running state of the DHCP service with the imported dhcp_enabled value
    try {
      if (categories.includes('config')) {
        const importedEnabled = (body.config || []).find(
          (c: { key: string; value: string }) => c.key === 'dhcp_enabled',
        );
        const currentStatus = dhcpInstance.getStatus();
        if (importedEnabled?.value === '1' && currentStatus === 'stopped') {
          await dhcpInstance.start();
        } else if (importedEnabled?.value === '0' && currentStatus === 'running') {
          await dhcpInstance.stop();
        }
      }
    } catch (e) {
      console.error('[API] Failed to sync DHCP state after import:', e);
    }

    return NextResponse.json({
      message: 'Config imported successfully',
      imported,
    });
  } catch (error) {
    console.error('[API] Config import error:', error);
    return NextResponse.json({ error: 'Failed to import config' }, { status: 500 });
  }
}
