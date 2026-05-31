import dgram from 'dgram';
import os from 'os';
import { EventEmitter } from 'events';
import { parseDhcpPacket, DhcpPacket } from '../dhcp/protocol/parser';
import { buildDhcpPacket, DhcpPacketBuildOptions } from '../dhcp/protocol/serializer';
import {
  DhcpMessageType, DhcpOptionCode, OP_BOOTREPLY, BROADCAST_FLAG,
  DHCP_SERVER_PORT, DHCP_CLIENT_PORT,
} from '../dhcp/protocol/constants';
import { PoolManager, Pool } from '../dhcp/pool-manager';
import { LeaseManager } from '../dhcp/lease-manager';
import { OptionManager } from '../dhcp/option-manager';
import { PacketLogger } from '../dhcp/packet-logger';
import Database from 'better-sqlite3';
import { getDb } from './db-instance';

export type DhcpServerStatus = 'running' | 'stopped';

class DhcpInstance extends EventEmitter {
  private status: DhcpServerStatus = 'stopped';
  private socket: dgram.Socket | null = null;
  private poolManager!: PoolManager;
  private leaseManager!: LeaseManager;
  private optionManager!: OptionManager;
  private packetLogger!: PacketLogger;
  private db!: Database.Database;
  private serverIP: string = '0.0.0.0';
  private bindAddress: string = '0.0.0.0';
  private t1Ratio: number = 0.5;
  private t2Ratio: number = 0.875;
  private defaultLeaseTime: number = 86400;

  constructor() {
    super();
  }

  getStatus(): DhcpServerStatus {
    return this.status;
  }

  /**
   * Check if UDP port 67 is actually in use (for cross-instance sync)
   */
  async isPortInUse(): Promise<boolean> {
    return new Promise((resolve) => {
      const testSocket = dgram.createSocket('udp4');
      let settled = false;
      const done = (result: boolean) => {
        if (settled) return;
        settled = true;
        testSocket.close(() => resolve(result));
      };
      testSocket.on('error', (err: NodeJS.ErrnoException) => {
        done(err.code === 'EADDRINUSE');
      });
      testSocket.bind(DHCP_SERVER_PORT, () => {
        done(false);
      });
    });
  }

  /**
   * 初始化依赖
   * API 路由运行在独立的模块作用域中，需要自行获取数据库连接
   */
  init(db?: Database.Database): void {
    if (this.db) return;
    const resolved = db || getDb();
    this.db = resolved;
    this.poolManager = new PoolManager(resolved);
    this.leaseManager = new LeaseManager(resolved);
    this.optionManager = new OptionManager(resolved);
    this.packetLogger = new PacketLogger(resolved);
  }

  startLogCleanup(): void {
    this.init();
    this.leaseManager.startLogCleanupTimer();
  }

  /**
   * 重新加载配置（导入配置后调用，无需重启服务）
   */
  reloadConfig(): void {
    this.init();
    this.loadConfig();
    console.log('[DHCP] Config reloaded');
  }

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.init();

    // 读取配置
    this.loadConfig();

    // 恢复租约
    this.leaseManager.recoverLeases();

    // 创建 UDP Socket
    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo);
    });

    this.socket.on('error', (err) => {
      console.error('[DHCP] Socket error:', err);
    });

    return new Promise((resolve, reject) => {
      this.socket!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port already in use - likely from another module instance.
          // Treat as already running and sync status.
          console.warn('[DHCP] Port 67 already in use, assuming server is already running');
          this.socket = null;
          this.status = 'running';
          this.emit('status-change', this.status);
          resolve();
        } else if (this.status !== 'running') {
          reject(err);
        }
      });

      this.socket!.bind(DHCP_SERVER_PORT, this.bindAddress === '0.0.0.0' ? undefined : this.bindAddress, () => {
        this.socket!.setBroadcast(true);
        this.status = 'running';
        this.leaseManager.startCleanupTimer();
        this.leaseManager.startLogCleanupTimer();
        this.emit('status-change', this.status);
        console.log(`[DHCP] Server listening on ${this.serverIP}:${DHCP_SERVER_PORT}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped') return;

    this.leaseManager.stopCleanupTimer();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.status = 'stopped';
    this.emit('status-change', this.status);
    console.log('[DHCP] Server stopped');
  }

  /**
   * 从数据库加载配置
   */
  private loadConfig(): void {
    try {
      const getConfig = this.db.prepare('SELECT value FROM config WHERE key = ?');

      const serverIP = getConfig.get('server_ip') as { value: string } | undefined;
      if (serverIP) {
        this.bindAddress = serverIP.value;
        this.serverIP = serverIP.value;
        // Auto-detect actual IP for Server Identifier (Option 54)
        // 0.0.0.0 means "listen on all interfaces" but can't be used as Server Identifier
        if (this.serverIP === '0.0.0.0') {
          this.serverIP = this.detectLocalIP();
          console.log(`[DHCP] Auto-detected server IP: ${this.serverIP}`);
        }
      }

      const t1Ratio = getConfig.get('t1_ratio') as { value: string } | undefined;
      if (t1Ratio) this.t1Ratio = parseFloat(t1Ratio.value);

      const t2Ratio = getConfig.get('t2_ratio') as { value: string } | undefined;
      if (t2Ratio) this.t2Ratio = parseFloat(t2Ratio.value);

      const leaseTime = getConfig.get('default_lease_time') as { value: string } | undefined;
      if (leaseTime) this.defaultLeaseTime = parseInt(leaseTime.value, 10);
    } catch (err) {
      console.error('[DHCP] Failed to load config:', err);
    }
  }

  /**
   * Auto-detect the host's primary non-internal IPv4 address.
   * Works in Docker, VMs, and bare metal.
   */
  private detectLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const [, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
    return '0.0.0.0';
  }

  /**
   * 处理接收到的 DHCP 消息
   */
  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const packet = parseDhcpPacket(msg);

      // 只处理客户端请求（op = 1 BOOTREQUEST）
      if (packet.op !== 1) return;

      // 必须有消息类型
      if (!packet.messageType) {
        console.warn('[DHCP] Received packet without message type from', packet.chaddr);
        return;
      }

      this.packetLogger.logPacket(packet);

      switch (packet.messageType) {
        case DhcpMessageType.DISCOVER:
          this.handleDiscover(packet);
          break;
        case DhcpMessageType.REQUEST:
          this.handleRequest(packet);
          break;
        case DhcpMessageType.DECLINE:
          this.handleDecline(packet);
          break;
        case DhcpMessageType.RELEASE:
          this.handleRelease(packet);
          break;
        case DhcpMessageType.INFORM:
          this.handleInform(packet);
          break;
        default:
          console.warn('[DHCP] Unsupported message type:', packet.messageType);
      }
    } catch (err) {
      console.error('[DHCP] Failed to parse packet:', err);
    }
  }

  /**
   * 处理 DHCPDISCOVER
   * 查找匹配地址池，分配 IP，回复 DHCPOFFER
   */
  private handleDiscover(packet: DhcpPacket): void {
    const mac = packet.chaddr;

    // 优先检查保留地址（优先级最高）
    const reservation = this.poolManager.findReservation(mac);
    if (reservation) {
      const pool = this.poolManager.getPoolById(reservation.pool_id);
      if (pool && pool.enabled) {
        this.sendOffer(packet, reservation.ip_address, pool);
        return;
      }
    }

    // 检查现有租约
    const existingLease = this.leaseManager.findLeaseByMAC(mac);
    if (existingLease) {
      const pool = this.poolManager.getPoolById(existingLease.pool_id);
      if (pool && pool.enabled) {
        this.sendOffer(packet, existingLease.ip_address, pool);
        return;
      }
    }

    // 分配新 IP — 使用原子操作防竞态 (#1)
    const requestedIP = packet.options.get(50) as string | undefined;
    const clientNetwork = packet.giaddr !== '0.0.0.0' ? packet.giaddr : this.serverIP;

    // 先用 allocateIP 找到合适的地址池（保留地址检查等已排除）
    const allocResult = this.poolManager.allocateIP(mac, requestedIP, clientNetwork);
    if (!allocResult) {
      console.log(`[DHCP] No available IP for DISCOVER from ${mac}`);
      return;
    }

    // 原子操作：在事务内查找可用 IP + 创建租约，防止并发分配同一 IP
    const hostname = packet.options.get(12) as string | undefined;
    const clientId = this.serializeClientId(packet.options.get(61));
    const vendorClass = packet.options.get(60) as string | undefined;

    const assignedIP = this.leaseManager.atomicAllocateAndOffer(
      allocResult.pool.id, mac, allocResult.pool.lease_time || this.defaultLeaseTime,
      packet.xid.toString(16), allocResult.pool.start_ip, allocResult.pool.end_ip,
      hostname, clientId, vendorClass, requestedIP,
    );

    if (!assignedIP) {
      console.log(`[DHCP] No available IP for DISCOVER from ${mac}`);
      return;
    }

    this.sendOffer(packet, assignedIP, allocResult.pool);
  }

  /**
   * 处理 DHCPREQUEST
   * 验证请求，回复 ACK 或 NAK
   */
  private handleRequest(packet: DhcpPacket): void {
    const mac = packet.chaddr;
    const requestedIP = packet.options.get(50) as string | undefined;
    const serverIdentifier = packet.options.get(54) as string | undefined;

    // 如果有 Server Identifier，说明客户端在选择服务器
    if (serverIdentifier && serverIdentifier !== this.serverIP && this.serverIP !== '0.0.0.0') {
      return; // 不是发给我们的，忽略
    }

    // 确定请求的 IP
    let targetIP: string | undefined;
    if (requestedIP) {
      targetIP = requestedIP;
    } else if (packet.ciaddr !== '0.0.0.0') {
      targetIP = packet.ciaddr;
    }

    if (!targetIP) {
      this.sendNak(packet, 'SR|NAK|NO_REQUESTED_IP');
      return;
    }

    // 优先检查保留地址（优先级最高）
    const reservation = this.poolManager.findReservation(mac);
    if (reservation) {
      const reservedPool = this.poolManager.getPoolById(reservation.pool_id);
      if (!reservedPool || !reservedPool.enabled) {
        this.sendNak(packet, `SR|NAK|POOL_DISABLED|${reservation.ip_address}`);
        return;
      }
      if (reservation.ip_address !== targetIP) {
        // 客户端请求的不是保留 IP，强制 NAK 并在 ACK 中使用保留 IP
        this.sendNak(packet, `SR|NAK|RESERVED_MISMATCH|${reservation.ip_address}|${targetIP}`);
        return;
      }
      // 请求的就是保留 IP，继续后续校验
    }

    // 检查 IP 是否在已启用的地址池范围内
    const pool = this.poolManager.findPoolForIP(targetIP);
    if (!pool) {
      this.sendNak(packet, `SR|NAK|NOT_IN_POOL|${targetIP}`);
      return;
    }

    // 检查 IP 是否已被其他客户端占用
    const existingLease = this.leaseManager.findLeaseByIP(targetIP);
    if (existingLease && existingLease.mac_address !== mac.toUpperCase()) {
      this.sendNak(packet, `SR|NAK|IP_LEASED|${targetIP}|${existingLease.mac_address}`);
      return;
    }

    // 分配成功，发送 ACK
    this.sendAck(packet, targetIP, pool);
  }

  /**
   * 处理 DHCPDECLINE
   * 标记 IP 冲突，释放租约
   */
  private handleDecline(packet: DhcpPacket): void {
    const mac = packet.chaddr;
    const requestedIP = packet.options.get(50) as string | undefined;

    if (requestedIP) {
      this.leaseManager.declineLease(requestedIP, mac);
      this.packetLogger.logServerResponse(
        DhcpMessageType.DECLINE, mac, requestedIP, packet.xid,
        undefined, `SR|DECLINE|${requestedIP}`,
        undefined, undefined, this.serverIP, packet.giaddr,
      );
      console.log(`[DHCP] DECLINE: ${mac} declined IP ${requestedIP}`);
    }
  }

  /**
   * 处理 DHCPRELEASE
   * 释放租约
   */
  private handleRelease(packet: DhcpPacket): void {
    const mac = packet.chaddr;
    const clientIP = packet.ciaddr;

    if (clientIP && clientIP !== '0.0.0.0') {
      this.leaseManager.releaseLease(clientIP, mac);
      this.packetLogger.logServerResponse(
        DhcpMessageType.RELEASE, mac, clientIP, packet.xid,
        undefined, `SR|RELEASE|${clientIP}`,
        undefined, undefined, this.serverIP, packet.giaddr,
      );
      console.log(`[DHCP] RELEASE: ${mac} released IP ${clientIP}`);
    }
  }

  /**
   * 处理 DHCPINFORM
   * 客户端已有 IP，仅请求配置选项
   */
  private handleInform(packet: DhcpPacket): void {
    const mac = packet.chaddr;
    const clientIP = packet.ciaddr;

    if (!clientIP || clientIP === '0.0.0.0') {
      return; // INFORM 必须有 ciaddr
    }

    const pool = this.poolManager.findPoolForIP(clientIP);
    if (!pool) {
      return; // IP 不在任何已启用地址池中，不回复
    }

    // 构建响应选项（不含租约时间）
    const options = this.optionManager.buildInformResponseOptions(pool, mac, this.serverIP);

    const buildOpts: DhcpPacketBuildOptions = {
      op: OP_BOOTREPLY,
      xid: packet.xid,
      flags: packet.flags,
      ciaddr: clientIP,
      yiaddr: '0.0.0.0',
      siaddr: this.serverIP,
      giaddr: packet.giaddr,
      chaddr: packet.chaddr,
      options,
      messageType: DhcpMessageType.ACK,
    };

    const responseBuf = buildDhcpPacket(buildOpts);
    this.sendResponse(responseBuf, packet);
    this.packetLogger.logServerResponse(
      DhcpMessageType.ACK, mac, clientIP, packet.xid,
      pool.id, `SR|INFORM`,
      undefined, options, this.serverIP, packet.giaddr,
    );
  }

  /**
   * 发送 DHCPOFFER
   */
  private sendOffer(packet: DhcpPacket, ip: string, pool: Pool): void {
    const mac = packet.chaddr;
    const leaseTime = pool.lease_time || this.defaultLeaseTime;

    // 创建 OFFERED 租约
    const hostname = packet.options.get(12) as string | undefined;
    const clientId = this.serializeClientId(packet.options.get(61));
    const vendorClass = packet.options.get(60) as string | undefined;
    const requestedIP = packet.options.get(50) as string | undefined;

    this.leaseManager.createOfferedLease(
      ip, mac, pool.id, leaseTime, packet.xid.toString(16),
      hostname, clientId, vendorClass, requestedIP,
    );

    // 构建响应选项
    const options = this.optionManager.buildResponseOptions(
      pool, mac, leaseTime, this.serverIP, this.t1Ratio, this.t2Ratio,
    );

    const buildOpts: DhcpPacketBuildOptions = {
      op: OP_BOOTREPLY,
      xid: packet.xid,
      flags: packet.flags,
      ciaddr: '0.0.0.0',
      yiaddr: ip,
      siaddr: this.serverIP,
      giaddr: packet.giaddr,
      chaddr: packet.chaddr,
      options,
      messageType: DhcpMessageType.OFFER,
    };

    const responseBuf = buildDhcpPacket(buildOpts);
    this.sendResponse(responseBuf, packet);

    this.packetLogger.logServerResponse(
      DhcpMessageType.OFFER, mac, ip, packet.xid,
      pool.id, `SR|OFFER|${ip}|${pool.name}`,
      undefined, options, this.serverIP, packet.giaddr,
    );
    console.log(`[DHCP] OFFER: ${mac} → ${ip} (pool: ${pool.name})`);
  }

  /**
   * 发送 DHCPACK
   */
  private sendAck(packet: DhcpPacket, ip: string, pool: Pool): void {
    const mac = packet.chaddr;
    const leaseTime = pool.lease_time || this.defaultLeaseTime;
    const hostname = packet.options.get(12) as string | undefined;

    // 确认租约
    this.leaseManager.confirmLease(ip, mac, leaseTime, hostname, pool.id);

    // 构建响应选项
    const options = this.optionManager.buildResponseOptions(
      pool, mac, leaseTime, this.serverIP, this.t1Ratio, this.t2Ratio,
    );

    const buildOpts: DhcpPacketBuildOptions = {
      op: OP_BOOTREPLY,
      xid: packet.xid,
      flags: packet.flags,
      ciaddr: packet.ciaddr,
      yiaddr: ip,
      siaddr: this.serverIP,
      giaddr: packet.giaddr,
      chaddr: packet.chaddr,
      options,
      messageType: DhcpMessageType.ACK,
    };

    const responseBuf = buildDhcpPacket(buildOpts);
    this.sendResponse(responseBuf, packet);

    this.packetLogger.logServerResponse(
      DhcpMessageType.ACK, mac, ip, packet.xid,
      pool.id, `SR|ASSIGN|${ip}|${pool.name}`,
      hostname, options, this.serverIP, packet.giaddr,
    );
    console.log(`[DHCP] ACK: ${mac} → ${ip} (pool: ${pool.name})`);
  }

  /**
   * 发送 DHCPNAK
   */
  private sendNak(packet: DhcpPacket, reason: string): void {
    const mac = packet.chaddr;

    const buildOpts: DhcpPacketBuildOptions = {
      op: OP_BOOTREPLY,
      xid: packet.xid,
      flags: 0,
      ciaddr: '0.0.0.0',
      yiaddr: '0.0.0.0',
      siaddr: this.serverIP,
      giaddr: packet.giaddr,
      chaddr: packet.chaddr,
      messageType: DhcpMessageType.NAK,
    };

    const responseBuf = buildDhcpPacket(buildOpts);
    this.sendResponse(responseBuf, packet);

    this.packetLogger.logServerResponse(
      DhcpMessageType.NAK, mac, '0.0.0.0', packet.xid,
      undefined, `SR|NAK|${reason}`,
      undefined, undefined, this.serverIP, packet.giaddr,
    );
    console.log(`[DHCP] NAK: ${mac} - ${reason}`);
  }

  /**
   * 发送响应（根据 RFC 2131 广播/单播规则）
   */
  private sendResponse(buf: Buffer, packet: DhcpPacket): void {
    if (!this.socket) return;

    let targetIP: string;
    let targetPort: number;

    if (packet.giaddr !== '0.0.0.0') {
      // 中继代理：单播给 giaddr:67
      targetIP = packet.giaddr;
      targetPort = DHCP_SERVER_PORT;
    } else if (packet.flags & BROADCAST_FLAG) {
      // 广播标志：广播给 255.255.255.255:68
      targetIP = '255.255.255.255';
      targetPort = DHCP_CLIENT_PORT;
    } else if (packet.ciaddr !== '0.0.0.0') {
      // 客户端已有 IP：单播给 ciaddr:68
      targetIP = packet.ciaddr;
      targetPort = DHCP_CLIENT_PORT;
    } else {
      // 默认广播
      targetIP = '255.255.255.255';
      targetPort = DHCP_CLIENT_PORT;
    }

    this.socket.send(buf, targetPort, targetIP, (err) => {
      if (err) {
        console.error(`[DHCP] Failed to send response to ${targetIP}:${targetPort}:`, err);
      }
    });
  }

  /**
   * 序列化 Client ID 选项值
   */
  private serializeClientId(clientId: unknown): string | undefined {
    if (!clientId) return undefined;
    if (clientId instanceof Uint8Array) {
      return Array.from(clientId).map(b => b.toString(16).padStart(2, '0')).join(':');
    }
    return String(clientId);
  }
}

export const dhcpInstance = new DhcpInstance();
