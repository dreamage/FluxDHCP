import Database from 'better-sqlite3';
import { Pool } from './pool-manager';
import { DhcpOptionCode } from './protocol/constants';

// Per-device DHCP 选项
export interface DeviceOption {
  id: number;
  mac_address: string;
  option_code: number;
  option_value: string;
  option_name: string | null;
}

export class OptionManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * 获取指定 MAC 地址的 per-device DHCP 选项
   */
  getDeviceOptions(mac: string): DeviceOption[] {
    return this.db.prepare(
      'SELECT * FROM device_options WHERE mac_address = ?'
    ).all(mac.toUpperCase()) as DeviceOption[];
  }

  /**
   * 构建 DHCP 响应的选项集合
   * 合并地址池默认选项和 per-device 自定义选项（per-device 优先）
   */
  buildResponseOptions(
    pool: Pool,
    mac: string,
    leaseTime: number,
    serverIP: string,
    t1Ratio: number,
    t2Ratio: number,
  ): Map<number, unknown> {
    const options = new Map<number, unknown>();

    // 1. 地址池默认选项
    if (pool.netmask) {
      options.set(DhcpOptionCode.SUBNET_MASK, pool.netmask);
    }
    if (pool.gateway) {
      options.set(DhcpOptionCode.ROUTER, [pool.gateway]);
    }
    const dns = this.parseDNS(pool.dns_servers);
    if (dns.length > 0) {
      options.set(DhcpOptionCode.DNS_SERVER, dns);
    }

    // 2. 租约时间选项
    options.set(DhcpOptionCode.LEASE_TIME, leaseTime);
    options.set(DhcpOptionCode.RENEWAL_TIME, Math.floor(leaseTime * t1Ratio));
    options.set(DhcpOptionCode.REBINDING_TIME, Math.floor(leaseTime * t2Ratio));

    // 3. 服务器标识
    options.set(DhcpOptionCode.SERVER_IDENTIFIER, serverIP);

    // 4. 广播地址（从子网和掩码计算）
    const broadcastAddr = this.calculateBroadcast(pool.subnet, pool.netmask);
    if (broadcastAddr) {
      options.set(DhcpOptionCode.BROADCAST_ADDRESS, broadcastAddr);
    }

    // 5. Per-device 自定义选项（覆盖默认值）
    const deviceOptions = this.getDeviceOptions(mac);
    for (const opt of deviceOptions) {
      options.set(opt.option_code, this.parseOptionValue(opt.option_code, opt.option_value));
    }

    return options;
  }

  /**
   * 为 DHCPINFORM 构建选项（不含租约时间，仅配置选项）
   */
  buildInformResponseOptions(
    pool: Pool,
    mac: string,
    serverIP: string,
  ): Map<number, unknown> {
    const options = new Map<number, unknown>();

    if (pool.netmask) {
      options.set(DhcpOptionCode.SUBNET_MASK, pool.netmask);
    }
    if (pool.gateway) {
      options.set(DhcpOptionCode.ROUTER, [pool.gateway]);
    }
    const dns = this.parseDNS(pool.dns_servers);
    if (dns.length > 0) {
      options.set(DhcpOptionCode.DNS_SERVER, dns);
    }

    options.set(DhcpOptionCode.SERVER_IDENTIFIER, serverIP);

    const broadcastAddr = this.calculateBroadcast(pool.subnet, pool.netmask);
    if (broadcastAddr) {
      options.set(DhcpOptionCode.BROADCAST_ADDRESS, broadcastAddr);
    }

    // Per-device 自定义选项
    const deviceOptions = this.getDeviceOptions(mac);
    for (const opt of deviceOptions) {
      options.set(opt.option_code, this.parseOptionValue(opt.option_code, opt.option_value));
    }

    return options;
  }

  /**
   * 解析 DNS 服务器 JSON 字符串
   */
  private parseDNS(dnsJson: string | null): string[] {
    if (!dnsJson) return [];
    try {
      return JSON.parse(dnsJson);
    } catch {
      return [];
    }
  }

  /**
   * 根据选项码解析选项值字符串为正确的 JS 类型
   */
  private parseOptionValue(code: number, value: string): unknown {
    // 根据选项码确定值类型
    switch (code) {
      case DhcpOptionCode.SUBNET_MASK:
      case DhcpOptionCode.BROADCAST_ADDRESS:
      case DhcpOptionCode.REQUESTED_IP:
      case DhcpOptionCode.SERVER_IDENTIFIER:
        return value; // IP 字符串

      case DhcpOptionCode.ROUTER:
      case DhcpOptionCode.DNS_SERVER:
        // 可能是逗号分隔的 IP 列表
        return value.split(',').map(s => s.trim());

      case DhcpOptionCode.LEASE_TIME:
      case DhcpOptionCode.RENEWAL_TIME:
      case DhcpOptionCode.REBINDING_TIME:
        return parseInt(value, 10);

      case DhcpOptionCode.MESSAGE_TYPE:
        return parseInt(value, 10);

      case DhcpOptionCode.HOST_NAME:
      case DhcpOptionCode.DOMAIN_NAME:
      case DhcpOptionCode.VENDOR_CLASS_ID:
        return value; // ASCII 字符串

      case DhcpOptionCode.PARAMETER_REQUEST_LIST:
      case DhcpOptionCode.CLIENT_IDENTIFIER:
        // 逗号分隔的字节数组
        return Uint8Array.from(value.split(',').map(s => parseInt(s.trim(), 10)));

      default:
        // 未知选项，尝试作为字符串
        return value;
    }
  }

  /**
   * 计算广播地址
   */
  private calculateBroadcast(subnet: string, netmask: string): string | null {
    try {
      const subnetParts = subnet.split('.').map(Number);
      const maskParts = netmask.split('.').map(Number);
      const broadcast = subnetParts.map((s, i) => (s | (~maskParts[i] & 0xFF)) & 0xFF);
      return broadcast.join('.');
    } catch {
      return null;
    }
  }
}
