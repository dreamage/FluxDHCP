import Database from 'better-sqlite3';

// 地址池数据类型
export interface Pool {
  id: number;
  name: string;
  subnet: string;
  netmask: string;
  start_ip: string;
  end_ip: string;
  gateway: string | null;
  dns_servers: string | null;  // JSON array string
  lease_time: number;
  enabled: number;
}

// 保留地址数据类型
export interface Reservation {
  id: number;
  mac_address: string;
  ip_address: string;
  hostname: string | null;
  pool_id: number;
  description: string | null;
  enabled: number;
}

export class PoolManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * 获取所有已启用的地址池
   */
  getEnabledPools(): Pool[] {
    return this.db.prepare('SELECT * FROM pools WHERE enabled = 1').all() as Pool[];
  }

  /**
   * 获取所有地址池（含禁用的）
   */
  getAllPools(): Pool[] {
    return this.db.prepare('SELECT * FROM pools').all() as Pool[];
  }

  /**
   * 根据 ID 获取地址池
   */
  getPoolById(id: number): Pool | undefined {
    return this.db.prepare('SELECT * FROM pools WHERE id = ?').get(id) as Pool | undefined;
  }

  /**
   * 查找 IP 所属的已启用地址池
   */
  findPoolForIP(ip: string): Pool | undefined {
    const pools = this.getEnabledPools();
    return pools.find(pool => this.isIPInPool(ip, pool));
  }

  /**
   * 查找 IP 所属的任意地址池（含禁用的）
   */
  findPoolForIPAny(ip: string): Pool | undefined {
    const pools = this.getAllPools();
    return pools.find(pool => this.isIPInPool(ip, pool));
  }

  /**
   * 检查 IP 是否在地址池范围内
   */
  isIPInPool(ip: string, pool: Pool): boolean {
    const ipNum = this.ipToNum(ip);
    const startNum = this.ipToNum(pool.start_ip);
    const endNum = this.ipToNum(pool.end_ip);
    return ipNum >= startNum && ipNum <= endNum;
  }

  /**
   * 查找 MAC 地址对应的保留地址
   */
  findReservation(mac: string): Reservation | undefined {
    return this.db.prepare(
      'SELECT * FROM reservations WHERE mac_address = ? AND enabled = 1'
    ).get(mac.toUpperCase()) as Reservation | undefined;
  }

  /**
   * 分配 IP 地址
   * 按优先级：
   * 1. 保留地址匹配（MAC 匹配且地址池已启用）
   * 2. 现有租约匹配（MAC 匹配且地址池已启用）
   * 3. 请求的 IP（在已启用地址池范围内且未占用）
   * 4. 动态分配（遍历已启用地址池找第一个可用 IP，优先匹配客户端所在子网）
   */
  allocateIP(mac: string, requestedIP?: string, clientNetwork?: string): { ip: string; pool: Pool } | null {
    const macUpper = mac.toUpperCase();

    // 1. 检查保留地址
    const reservation = this.findReservation(macUpper);
    if (reservation) {
      const pool = this.getPoolById(reservation.pool_id);
      if (pool && pool.enabled) {
        return { ip: reservation.ip_address, pool };
      }
    }

    // 2. 检查现有租约（通过 LeaseManager 外部处理，这里只检查保留和动态分配）
    // 现有租约检查在 DhcpInstance 中调用 LeaseManager

    // 3. 检查请求的 IP
    if (requestedIP && requestedIP !== '0.0.0.0') {
      const pool = this.findPoolForIP(requestedIP);
      if (pool && !this.isIPOccupied(requestedIP)) {
        return { ip: requestedIP, pool };
      }
    }

    // 4. 动态分配：优先匹配客户端所在子网的地址池
    const pools = this.getEnabledPools();

    // If we know the client's network, try matching pools first
    if (clientNetwork && clientNetwork !== '0.0.0.0') {
      const matchingPools = pools.filter(pool =>
        (this.ipToNum(clientNetwork) & this.ipToNum(pool.netmask)) ===
        (this.ipToNum(pool.subnet) & this.ipToNum(pool.netmask))
      );
      for (const pool of matchingPools) {
        const ip = this.findAvailableIPInPool(pool);
        if (ip) return { ip, pool };
      }
    }

    // Fallback: try all pools
    for (const pool of pools) {
      const ip = this.findAvailableIPInPool(pool);
      if (ip) return { ip, pool };
    }

    return null;
  }

  /**
   * 在指定地址池中查找第一个可用 IP
   */
  findAvailableIPInPool(pool: Pool): string | null {
    const startNum = this.ipToNum(pool.start_ip);
    const endNum = this.ipToNum(pool.end_ip);

    // 获取该地址池中已占用的 IP
    const occupiedIPs = this.getOccupiedIPsInPool(pool.id);

    for (let ipNum = startNum; ipNum <= endNum; ipNum++) {
      const ip = this.numToIP(ipNum);
      if (!occupiedIPs.has(ip)) {
        return ip;
      }
    }

    return null;
  }

  /**
   * 检查 IP 是否已被占用（租约或保留地址）
   */
  isIPOccupied(ip: string): boolean {
    // 检查活跃租约
    const lease = this.db.prepare(
      "SELECT ip_address FROM leases WHERE ip_address = ? AND state IN ('OFFERED', 'BOUND')"
    ).get(ip);
    if (lease) return true;

    // 检查保留地址
    const reservation = this.db.prepare(
      'SELECT ip_address FROM reservations WHERE ip_address = ? AND enabled = 1'
    ).get(ip);
    if (reservation) return true;

    // 检查 DECLINE 黑名单
    const declined = this.db.prepare(
      "SELECT ip_address FROM declined_ips WHERE ip_address = ? AND expires_at > datetime('now')"
    ).get(ip);
    if (declined) return true;

    return false;
  }

  /**
   * 获取地址池中已占用的 IP 集合
   */
  private getOccupiedIPsInPool(poolId: number): Set<string> {
    const ips = new Set<string>();

    // 活跃租约
    const leases = this.db.prepare(
      "SELECT ip_address FROM leases WHERE pool_id = ? AND state IN ('OFFERED', 'BOUND')"
    ).all(poolId) as Array<{ ip_address: string }>;
    leases.forEach(l => ips.add(l.ip_address));

    // 保留地址
    const reservations = this.db.prepare(
      'SELECT ip_address FROM reservations WHERE pool_id = ? AND enabled = 1'
    ).all(poolId) as Array<{ ip_address: string }>;
    reservations.forEach(r => ips.add(r.ip_address));

    // DECLINE 黑名单
    const declined = this.db.prepare(
      "SELECT ip_address FROM declined_ips WHERE expires_at > datetime('now')"
    ).all() as Array<{ ip_address: string }>;
    declined.forEach(d => ips.add(d.ip_address));

    return ips;
  }

  /**
   * 获取地址池的统计信息
   */
  getPoolStats(poolId: number): { total: number; used: number } {
    const pool = this.getPoolById(poolId);
    if (!pool) return { total: 0, used: 0 };

    const startNum = this.ipToNum(pool.start_ip);
    const endNum = this.ipToNum(pool.end_ip);
    const total = endNum - startNum + 1;

    const occupied = this.getOccupiedIPsInPool(poolId);
    return { total, used: occupied.size };
  }

  /**
   * 检查新地址池的 IP 范围是否与现有地址池重叠
   */
  isRangeOverlapping(startIP: string, endIP: string, excludeId?: number): Pool | undefined {
    const newStart = this.ipToNum(startIP);
    const newEnd = this.ipToNum(endIP);

    const pools = this.getAllPools();
    return pools.find(pool => {
      if (excludeId && pool.id === excludeId) return false;
      const poolStart = this.ipToNum(pool.start_ip);
      const poolEnd = this.ipToNum(pool.end_ip);
      return newStart <= poolEnd && newEnd >= poolStart;
    });
  }

  /**
   * 获取地址池的 DNS 服务器列表
   */
  getPoolDNS(pool: Pool): string[] {
    if (!pool.dns_servers) return [];
    try {
      return JSON.parse(pool.dns_servers);
    } catch {
      return [];
    }
  }

  // ===== IP 地址工具函数 =====

  ipToNum(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  numToIP(num: number): string {
    return [
      (num >>> 24) & 0xFF,
      (num >>> 16) & 0xFF,
      (num >>> 8) & 0xFF,
      num & 0xFF,
    ].join('.');
  }
}
