import Database from 'better-sqlite3';

// 租约数据类型
export interface Lease {
  ip_address: string;
  mac_address: string;
  hostname: string | null;
  state: 'OFFERED' | 'BOUND' | 'RELEASED' | 'EXPIRED';
  pool_id: number;
  lease_start: string | null;
  lease_end: string | null;
  client_id: string | null;
  vendor_class: string | null;
  requested_ip: string | null;
  xid: string | null;
}

export class LeaseManager {
  private db: Database.Database;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private logCleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * 启动过期租约清理定时器（每60秒扫描一次）
   */
  startCleanupTimer(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanExpiredLeases();
    }, 60_000);
  }

  /**
   * 启动过期日志清理定时器（每小时清理一次）
   */
  startLogCleanupTimer(): void {
    if (this.logCleanupTimer) return;
    this.logCleanupTimer = setInterval(() => {
      this.cleanExpiredLogs();
    }, 3600_000); // 1 hour
    // Run once on startup
    this.cleanExpiredLogs();
  }

  /**
   * 停止过期租约清理定时器
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.logCleanupTimer) {
      clearInterval(this.logCleanupTimer);
      this.logCleanupTimer = null;
    }
  }

  /**
   * 清理过期租约：将过期的 OFFERED/BOUND 租约更新为 EXPIRED
   */
  cleanExpiredLeases(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      `UPDATE leases SET state = 'EXPIRED' WHERE state IN ('OFFERED', 'BOUND') AND lease_end IS NOT NULL AND lease_end < ?`
    ).run(now);
    if (result.changes > 0) {
      console.log(`[LeaseManager] Expired ${result.changes} lease(s)`);
    }
    // Clean expired blacklist entries
    this.db.prepare("DELETE FROM declined_ips WHERE expires_at < datetime('now')").run();
    return result.changes;
  }

  /**
   * 清理过期日志：删除超过保留天数的日志记录
   */
  cleanExpiredLogs(): number {
    try {
      const row = this.db.prepare("SELECT value FROM config WHERE key = 'log_retention_days'").get() as { value: string } | undefined;
      const days = row ? parseInt(row.value, 10) : 90;
      if (isNaN(days) || days < 1) return 0;
      const result = this.db.prepare(
        `DELETE FROM logs WHERE timestamp < datetime('now', '-' || ? || ' days')`
      ).run(days);
      if (result.changes > 0) {
        console.log(`[LeaseManager] Cleaned ${result.changes} expired log(s) (retention: ${days} days)`);
      }
      return result.changes;
    } catch (err) {
      console.error('[LeaseManager] Failed to clean expired logs:', err);
      return 0;
    }
  }

  /**
   * 原子操作：查找可用 IP 并创建 OFFERED 租约（防竞态）
   */
  atomicAllocateAndOffer(
    poolId: number,
    mac: string,
    leaseTime: number,
    xid: string,
    startIp: string,
    endIp: string,
    hostname?: string,
    clientId?: string,
    vendorClass?: string,
    requestedIp?: string,
  ): string | null {
    const tx = this.db.transaction(() => {
      // 在事务内查找可用 IP（此时持有写锁，其他并发分配被阻塞）
      const occupied = new Set<string>();
      const leases = this.db.prepare(
        "SELECT ip_address FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
      ).all(poolId) as Array<{ ip_address: string }>;
      leases.forEach(l => occupied.add(l.ip_address));
      const reservations = this.db.prepare(
        'SELECT ip_address FROM reservations WHERE pool_id = ? AND enabled = 1'
      ).all(poolId) as Array<{ ip_address: string }>;
      reservations.forEach(r => occupied.add(r.ip_address));

      // DECLINE 黑名单
      const pool = this.db.prepare('SELECT start_ip, end_ip FROM pools WHERE id = ?').get(poolId) as any;
      if (pool) {
        const declined = this.db.prepare(
          "SELECT ip_address FROM declined_ips WHERE expires_at > datetime('now')"
        ).all() as Array<{ ip_address: string }>;
        declined.forEach(d => occupied.add(d.ip_address));
      }

      // 读取分配配置
      let order = 'sequential';
      let honorRequested = true;
      try {
        const orderRow = this.db.prepare("SELECT value FROM config WHERE key = 'ip_allocation_order'").get() as { value: string } | undefined;
        if (orderRow) order = orderRow.value;
        const honorRow = this.db.prepare("SELECT value FROM config WHERE key = 'honor_requested_ip'").get() as { value: string } | undefined;
        if (honorRow) honorRequested = honorRow.value !== '0';
      } catch { /* ignore */ }

      // Convert IPs to numbers
      const ipToNumLocal = (ip: string) => {
        const parts = ip.split('.').map(Number);
        return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
      };
      const numToIpLocal = (num: number) =>
        `${(num >>> 24) & 0xFF}.${(num >>> 16) & 0xFF}.${(num >>> 8) & 0xFF}.${num & 0xFF}`;

      // 如果遵循客户端请求IP 且 客户端有请求 且 IP 可用，直接分配
      if (honorRequested && requestedIp && requestedIp !== '0.0.0.0' && !occupied.has(requestedIp)) {
        const ipNum = ipToNumLocal(requestedIp);
        const startNum = ipToNumLocal(startIp);
        const endNum = ipToNumLocal(endIp);
        if (ipNum >= startNum && ipNum <= endNum) {
          // 请求的 IP 在池范围内且未被占用，直接使用
          const now = new Date();
          const leaseEnd = new Date(now.getTime() + leaseTime * 1000);
          this.db.prepare('DELETE FROM leases WHERE ip_address = ?').run(requestedIp);
          this.db.prepare(`
            INSERT INTO leases (ip_address, mac_address, hostname, state, pool_id, lease_start, lease_end, client_id, vendor_class, requested_ip, xid)
            VALUES (?, ?, ?, 'OFFERED', ?, ?, ?, ?, ?, ?, ?)
          `).run(requestedIp, mac.toUpperCase(), hostname || null, poolId, now.toISOString(), leaseEnd.toISOString(), clientId || null, vendorClass || null, requestedIp, xid);
          return requestedIp;
        }
      }

      // 顺序/随机分配
      let ip: string | null = null;
      const startNum = ipToNumLocal(startIp);
      const endNum = ipToNumLocal(endIp);
      const count = endNum - startNum + 1;

      if (order === 'random') {
        // 随机分配：Fisher-Yates 洗牌
        const offsets: number[] = Array.from({ length: count }, (_, i) => i);
        for (let i = offsets.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
        }
        for (const offset of offsets) {
          const candidate = numToIpLocal(startNum + offset);
          if (!occupied.has(candidate)) {
            ip = candidate;
            break;
          }
        }
      } else {
        // 顺序分配
        for (let num = startNum; num <= endNum; num++) {
          const candidate = numToIpLocal(num);
          if (!occupied.has(candidate)) {
            ip = candidate;
            break;
          }
        }
      }

      if (!ip) return null;

      // 事务内直接创建租约
      const now = new Date();
      const leaseEnd = new Date(now.getTime() + leaseTime * 1000);
      this.db.prepare('DELETE FROM leases WHERE ip_address = ?').run(ip);
      this.db.prepare(`
        INSERT INTO leases (ip_address, mac_address, hostname, state, pool_id, lease_start, lease_end, client_id, vendor_class, requested_ip, xid)
        VALUES (?, ?, ?, 'OFFERED', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ip, mac.toUpperCase(), hostname || null,
        poolId,
        now.toISOString(), leaseEnd.toISOString(),
        clientId || null, vendorClass || null, requestedIp || null,
        xid,
      );

      return ip;
    });

    return tx();
  }

  /**
   * 创建 OFFERED 租约（DHCPOFFER 时使用）
   */
  createOfferedLease(
    ip: string,
    mac: string,
    poolId: number,
    leaseTime: number,
    xid: string,
    hostname?: string,
    clientId?: string,
    vendorClass?: string,
    requestedIp?: string,
  ): void {
    const now = new Date();
    const leaseEnd = new Date(now.getTime() + leaseTime * 1000);

    // 先删除同一 IP 的旧租约（如果存在）
    this.db.prepare('DELETE FROM leases WHERE ip_address = ?').run(ip);

    this.db.prepare(`
      INSERT INTO leases (ip_address, mac_address, hostname, state, pool_id, lease_start, lease_end, client_id, vendor_class, requested_ip, xid)
      VALUES (?, ?, ?, 'OFFERED', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ip, mac.toUpperCase(), hostname || null,
      poolId,
      now.toISOString(), leaseEnd.toISOString(),
      clientId || null, vendorClass || null, requestedIp || null,
      xid,
    );
  }

  /**
   * 确认租约：OFFERED → BOUND（DHCPACK 时使用）
   * 使用 upsert：如果已有 OFFERED 租约则更新，没有则直接创建 BOUND
   * （客户端可能跳过 DISCOVER 直接 REQUEST，此时没有 OFFERED 记录）
   */
  confirmLease(ip: string, mac: string, leaseTime: number, hostname?: string, poolId?: number): void {
    const now = new Date();
    const leaseEnd = new Date(now.getTime() + leaseTime * 1000);
    const startStr = now.toISOString();
    const endStr = leaseEnd.toISOString();
    const macUpper = mac.toUpperCase();

    const result = this.db.prepare(`
      UPDATE leases SET state = 'BOUND', lease_start = ?, lease_end = ?, hostname = ?
      WHERE ip_address = ? AND mac_address = ?
    `).run(startStr, endStr, hostname || null, ip, macUpper);

    // No existing lease found (client skipped DISCOVER), create directly
    if (result.changes === 0) {
      this.db.prepare(`
        INSERT INTO leases (ip_address, mac_address, hostname, state, pool_id, lease_start, lease_end)
        VALUES (?, ?, ?, 'BOUND', ?, ?, ?)
      `).run(ip, macUpper, hostname || null, poolId || null, startStr, endStr);
    }
  }

  /**
   * 释放租约（DHCPRELEASE 时使用）
   */
  releaseLease(ip: string, mac: string): boolean {
    const result = this.db.prepare(`
      UPDATE leases SET state = 'RELEASED'
      WHERE ip_address = ? AND mac_address = ? AND state IN ('BOUND', 'OFFERED')
    `).run(ip, mac.toUpperCase());
    return result.changes > 0;
  }

  /**
   * 处理 DHCPDECLINE：标记 IP 冲突并释放租约
   */
  declineLease(ip: string, mac: string): void {
    this.db.prepare(`
      UPDATE leases SET state = 'RELEASED'
      WHERE ip_address = ? AND mac_address = ?
    `).run(ip, mac.toUpperCase());

    // Add to blacklist: don't reassign this IP for configured duration
    try {
      const row = this.db.prepare("SELECT value FROM config WHERE key = 'decline_blacklist_duration'").get() as { value: string } | undefined;
      const duration = row ? parseInt(row.value, 10) : 3600;
      if (duration > 0) {
        const expiresAt = new Date(Date.now() + duration * 1000).toISOString();
        this.db.prepare(
          'INSERT OR REPLACE INTO declined_ips (ip_address, mac_address, declined_at, expires_at) VALUES (?, ?, datetime(\'now\'), ?)'
        ).run(ip, mac.toUpperCase(), expiresAt);
        console.log(`[LeaseManager] Blacklisted IP ${ip} until ${expiresAt} (DECLINE from ${mac})`);
      }
    } catch (err) {
      console.error('[LeaseManager] Failed to blacklist declined IP:', err);
    }
  }

  /**
   * 根据 MAC 地址查找活跃租约
   */
  findLeaseByMAC(mac: string): Lease | undefined {
    return this.db.prepare(
      "SELECT * FROM leases WHERE mac_address = ? AND state IN ('OFFERED', 'BOUND')"
    ).get(mac.toUpperCase()) as Lease | undefined;
  }

  /**
   * 根据 IP 地址查找活跃租约
   */
  findLeaseByIP(ip: string): Lease | undefined {
    return this.db.prepare(
      "SELECT * FROM leases WHERE ip_address = ? AND state IN ('OFFERED', 'BOUND')"
    ).get(ip) as Lease | undefined;
  }

  /**
   * 检查 IP 是否有活跃租约
   */
  isIPLeased(ip: string): boolean {
    const lease = this.db.prepare(
      "SELECT 1 FROM leases WHERE ip_address = ? AND state IN ('OFFERED', 'BOUND')"
    ).get(ip);
    return !!lease;
  }

  /**
   * 从数据库恢复 BOUND 状态的租约（服务重启时）
   * OFFERED 状态的租约视为过期，不恢复
   */
  recoverLeases(): void {
    // 将所有 OFFERED 租约标记为 EXPIRED（未完成的 DORA）
    this.db.prepare("UPDATE leases SET state = 'EXPIRED' WHERE state = 'OFFERED'").run();

    // 将过期的 BOUND 租约标记为 EXPIRED
    const now = new Date().toISOString();
    this.db.prepare(
      "UPDATE leases SET state = 'EXPIRED' WHERE state = 'BOUND' AND lease_end IS NOT NULL AND lease_end < ?"
    ).run(now);

    const boundCount = this.db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE state = 'BOUND'"
    ).get() as { count: number };
    console.log(`[LeaseManager] Recovered ${boundCount.count} active lease(s)`);
  }

  /**
   * 获取所有活跃租约
   */
  getActiveLeases(): Lease[] {
    return this.db.prepare(
      "SELECT * FROM leases WHERE state IN ('OFFERED', 'BOUND') ORDER BY lease_end DESC"
    ).all() as Lease[];
  }

  /**
   * 获取活跃租约数量
   */
  getActiveLeaseCount(): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM leases WHERE state IN ('OFFERED', 'BOUND')"
    ).get() as { count: number };
    return row.count;
  }
}
