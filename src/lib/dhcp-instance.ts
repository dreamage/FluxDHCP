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

export type DhcpServerStatus = 'stopped' | 'starting' | 'running' | 'error';

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
  /** 最近一次启动失败的原因（供 UI 展示，不再伪装成 running） */
  private lastError: string | null = null;
  /** 当前 socket 实际绑定的地址，用于判断 server_ip 变更后是否需要重新 bind */
  private boundAddress: string | null = null;
  /** 最近一次从数据库读到的 dhcp_enabled，用于判断启停开关是否发生变化 */
  private enabledInConfig = false;

  constructor() {
    super();
  }

  getStatus(): DhcpServerStatus {
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
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

  /**
   * 应用配置变更：重载内存参数，并在必要时重启 socket 或启停服务。
   * 供 PUT /api/config 与配置导入使用，避免"界面保存成功但运行时不生效"。
   */
  async applyConfigChange(): Promise<void> {
    this.init();

    const wasEnabled = this.enabledInConfig;
    this.loadConfig();

    // 1. 启停开关变化 → 启停服务
    if (this.enabledInConfig !== wasEnabled) {
      if (this.enabledInConfig) {
        if (this.status !== 'running' && this.status !== 'starting') await this.start();
      } else if (this.status === 'running' || this.status === 'starting') {
        await this.stop();
      }
      return;
    }

    // 2. 监听地址变化 → 必须重新 bind，仅改内存变量无效
    if (this.status === 'running' && this.boundAddress !== this.bindAddress) {
      console.log(`[DHCP] Bind address changed (${this.boundAddress} → ${this.bindAddress}), restarting socket`);
      await this.stop();
      await this.start();
    }
  }

  async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') return;
    this.init();

    // 读取配置
    this.loadConfig();

    // 恢复租约
    this.leaseManager.recoverLeases();

    this.status = 'starting';
    this.lastError = null;

    const socket = dgram.createSocket('udp4');
    const bindAddress = this.bindAddress;

    try {
      await new Promise<void>((resolve, reject) => {
        const onBindError = (err: NodeJS.ErrnoException) => {
          socket.removeListener('error', onBindError);
          try { socket.close(); } catch { /* ignore */ }
          this.status = 'error';
          this.boundAddress = null;
          this.lastError = this.describeBindError(err);
          this.emit('status-change', this.status);
          reject(err);
        };

        socket.once('error', onBindError);
        socket.on('message', (msg, rinfo) => {
          this.handleMessage(msg, rinfo);
        });

        socket.bind(DHCP_SERVER_PORT, bindAddress === '0.0.0.0' ? undefined : bindAddress, () => {
          socket.removeListener('error', onBindError);
          // 绑定成功后的运行期错误只记录日志，不改变运行状态
          socket.on('error', (err) => {
            this.lastError = err.message;
            console.error('[DHCP] Socket error:', err);
          });
          try {
            socket.setBroadcast(true);
          } catch (err) {
            console.error('[DHCP] Failed to enable broadcast:', err);
          }

          this.socket = socket;
          this.boundAddress = bindAddress;
          this.status = 'running';
          this.lastError = null;
          socket.on('close', () => {
            if (this.socket === socket) {
              this.socket = null;
              this.boundAddress = null;
              if (this.status === 'running') {
                this.status = 'stopped';
                this.emit('status-change', this.status);
              }
            }
          });

          this.leaseManager.startCleanupTimer();
          this.leaseManager.startLogCleanupTimer();
          this.emit('status-change', this.status);
          console.log(`[DHCP] Server listening on ${this.serverIP}:${DHCP_SERVER_PORT} (bind: ${bindAddress})`);
          resolve();
        });
      });
    } catch (err) {
      // 启动失败时保持 stopped/error 状态，不再伪装为 running
      console.error('[DHCP] Failed to start DHCP server:', this.lastError);
      throw err;
    }
  }

  async stop(): Promise<void> {
    // 可能从未启动过（例如直接调用 /api/dhcp/stop），先确保依赖已初始化
    this.init();
    this.leaseManager.stopCleanupTimer();

    const socket = this.socket;
    this.socket = null;
    this.boundAddress = null;
    this.status = 'stopped';
    this.emit('status-change', this.status);

    if (socket) {
      await new Promise<void>((resolve) => {
        try {
          socket.close(() => resolve());
        } catch {
          resolve();
        }
      });
    }

    console.log('[DHCP] Server stopped');
  }

  private describeBindError(err: NodeJS.ErrnoException): string {
    if (err.code === 'EACCES') {
      return `Permission denied on UDP ${DHCP_SERVER_PORT} (requires root or NET_ADMIN capability)`;
    }
    if (err.code === 'EADDRINUSE') {
      return `UDP ${DHCP_SERVER_PORT} is already in use by another process`;
    }
    return err.message || String(err);
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

      const enabled = getConfig.get('dhcp_enabled') as { value: string } | undefined;
      this.enabledInConfig = enabled?.value === '1';
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

      // chaddr 必须是合法的以太网 MAC：hlen 异常或畸形包无法正确识别客户端
      if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(packet.chaddr)) {
        console.warn('[DHCP] Dropping packet with invalid chaddr:', packet.chaddr);
        return;
      }

      // 必须有合法的消息类型（1..8）
      const msgType = packet.messageType;
      if (!msgType || !Number.isInteger(msgType) || msgType < 1 || msgType > 8) {
        console.warn('[DHCP] Received packet without valid message type from', packet.chaddr);
        return;
      }

      // MAC 黑名单检查 — 静默丢弃，不发送任何响应
      const blocked = this.db.prepare(
        'SELECT reason FROM mac_blacklist WHERE mac_address = ? AND enabled = 1'
      ).get(packet.chaddr) as { reason: string } | undefined;
      if (blocked) {
        console.log(`[DHCP] Blocked: ${packet.chaddr} (reason: ${blocked.reason || 'blacklisted'})`);
        this.packetLogger.logServerResponse(
          msgType, packet.chaddr, '0.0.0.0', packet.xid,
          undefined, `SR|BLOCKED|${blocked.reason || 'blacklisted'}`,
          undefined, undefined, this.serverIP, packet.giaddr,
        );
        return;
      }

      this.packetLogger.logPacket(packet);

      switch (msgType) {
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

    // 读取 honor_requested_ip 配置
    let honorRequested = true;
    try {
      const row = this.db.prepare("SELECT value FROM config WHERE key = 'honor_requested_ip'").get() as { value: string } | undefined;
      if (row) honorRequested = row.value !== '0';
    } catch { /* ignore */ }

    // 检查客户端是否有已有租约
    const existingLease = this.leaseManager.findLeaseByMAC(mac);

    if (!honorRequested && !reservation) {
      // 不遵循客户端请求IP 且 无保留地址
      if (existingLease) {
        // 有旧租约 → 只允许续期旧 IP
        if (targetIP === existingLease.ip_address) {
          const pool = this.poolManager.findPoolForIP(targetIP);
          if (pool) {
            this.sendAck(packet, targetIP, pool);
            return;
          }
        }
        // 请求的不是旧 IP → NAK，让客户端重新 DISCOVER
        this.sendNak(packet, `SR|NAK|USE_OWN_IP|${existingLease.ip_address}|${targetIP}`);
        return;
      }
      // 无旧租约 → NAK，强制走 DISCOVER 分配路径
      this.sendNak(packet, 'SR|NAK|MUST_DISCOVER');
      return;
    }

    // 遵循客户端请求IP（默认行为）或有保留地址
    // 检查 IP 是否在已启用的地址池范围内
    const pool = this.poolManager.findPoolForIP(targetIP);
    if (!pool) {
      this.sendNak(packet, `SR|NAK|NOT_IN_POOL|${targetIP}`);
      return;
    }

    // 检查该 IP 是否被其他 MAC 保留：保留地址不可被非保留设备抢占
    const ipReservation = this.poolManager.findReservationByIP(targetIP);
    if (ipReservation && ipReservation.mac_address !== mac.toUpperCase()) {
      this.sendNak(packet, `SR|NAK|IP_RESERVED|${targetIP}`);
      return;
    }

    // 检查 IP 是否已被其他客户端占用
    const ipHolder = this.leaseManager.findLeaseByIP(targetIP);
    if (ipHolder && ipHolder.mac_address !== mac.toUpperCase()) {
      this.sendNak(packet, `SR|NAK|IP_LEASED|${targetIP}|${ipHolder.mac_address}`);
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

    // 该 IP 仍被其他 MAC 持有时不发送 OFFER，避免把同一 IP 发给两台设备
    const created = this.leaseManager.createOfferedLease(
      ip, mac, pool.id, leaseTime, packet.xid.toString(16),
      hostname, clientId, vendorClass, requestedIP,
    );
    if (!created) {
      console.warn(`[DHCP] Skip OFFER ${ip} → ${mac}: IP is still leased to another device`);
      return;
    }

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

    // 确认租约（若该 IP 已被其他 MAC 占用则拒绝，避免抢租约）
    const confirmed = this.leaseManager.confirmLease(ip, mac, leaseTime, hostname, pool.id);
    if (!confirmed) {
      console.warn(`[DHCP] Refuse ACK ${ip} → ${mac}: IP is still leased to another device`);
      this.sendNak(packet, `SR|NAK|LEASE_CONFLICT|${ip}`);
      return;
    }

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

// Use globalThis to share a single instance across module systems.
// Next.js custom server (src/server.ts) and API routes (src/app/api/*) run in
// separate module scopes, which would otherwise create TWO DhcpInstance objects.
// The API-side instance never truly binds UDP 67 (it gets EADDRINUSE because the
// server.ts instance owns the port), so calling stop() from the API only flips an
// in-memory flag without closing the real socket — the server keeps running.
// Pinning the singleton on globalThis guarantees one instance process-wide.
const globalForDhcp = globalThis as unknown as { __dhcpInstance?: DhcpInstance };

export const dhcpInstance =
  globalForDhcp.__dhcpInstance ?? new DhcpInstance();

if (!globalForDhcp.__dhcpInstance) {
  globalForDhcp.__dhcpInstance = dhcpInstance;
}
