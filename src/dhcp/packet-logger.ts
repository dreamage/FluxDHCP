import Database from 'better-sqlite3';
import { DhcpMessageType, MESSAGE_TYPE_NAMES } from './protocol/constants';
import { DhcpPacket } from './protocol/parser';
import { triggerWebhooks } from '../lib/webhook-trigger';

export class PacketLogger {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * 记录 DHCP 包日志
   */
  logPacket(
    packet: DhcpPacket,
    poolId?: number,
    serverResponse?: string,
  ): void {
    try {
      const messageType = packet.messageType || 0;
      const rawOptions = this.serializeOptions(packet.options);

      this.db.prepare(`
        INSERT INTO logs (timestamp, message_type, client_mac, client_ip, yiaddr, siaddr, giaddr, requested_ip, hostname, client_id, vendor_class, xid, raw_options, pool_id, server_response, direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recv')
      `).run(
        new Date().toISOString(),
        messageType,
        packet.chaddr,
        packet.ciaddr !== '0.0.0.0' ? packet.ciaddr : null,
        packet.yiaddr !== '0.0.0.0' ? packet.yiaddr : null,
        packet.siaddr !== '0.0.0.0' ? packet.siaddr : null,
        packet.giaddr !== '0.0.0.0' ? packet.giaddr : null,
        (packet.options.get(50) as string) || null,  // Requested IP
        (packet.options.get(12) as string) || null,  // Host Name
        this.serializeClientId(packet.options.get(61)),
        (packet.options.get(60) as string) || null,  // Vendor Class ID
        packet.xid.toString(16).padStart(8, '0').toUpperCase(),
        rawOptions,
        poolId || null,
        serverResponse || null,
      );
    } catch (err) {
      console.error('[PacketLogger] Failed to log packet:', err);
    }
  }

  /**
   * 记录服务器发送的响应日志
   */
  logServerResponse(
    messageType: DhcpMessageType,
    clientMac: string,
    clientIP: string,
    xid: number,
    poolId?: number,
    serverResponse?: string,
    hostname?: string,
    responseOptions?: Map<number, unknown>,
    serverIP?: string,
    giaddr?: string,
  ): void {
    try {
      // Combine summary text with serialized options
      let fullResponse = serverResponse || null;
      if (responseOptions && responseOptions.size > 0) {
        const optsJson = this.serializeOptions(responseOptions);
        fullResponse = fullResponse ? `${fullResponse}\n---OPTIONS---\n${optsJson}` : optsJson;
      }

      this.db.prepare(`
        INSERT INTO logs (timestamp, message_type, client_mac, client_ip, yiaddr, siaddr, giaddr, hostname, xid, pool_id, server_response, direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'send')
      `).run(
        new Date().toISOString(),
        messageType,
        clientMac,
        null,  // ciaddr not applicable for server responses
        clientIP !== '0.0.0.0' ? clientIP : null,  // yiaddr = assigned IP
        serverIP !== '0.0.0.0' ? (serverIP || null) : null,  // siaddr = server IP
        giaddr !== '0.0.0.0' ? (giaddr || null) : null,  // giaddr = relay agent
        hostname || null,
        xid.toString(16).padStart(8, '0').toUpperCase(),
        poolId || null,
        fullResponse,
      );

      // Trigger webhooks
      triggerWebhooks(messageType, {
        mac_address: clientMac,
        ip_address: clientIP,
        hostname,
        pool_id: poolId,
      }).catch(err => console.error('[PacketLogger] Webhook trigger error:', err));
    } catch (err) {
      console.error('[PacketLogger] Failed to log server response:', err);
    }
  }

  /**
   * 格式化日志消息
   */
  formatLogEntry(
    messageType: DhcpMessageType,
    mac: string,
    ip?: string,
    extra?: string,
  ): string {
    const typeName = MESSAGE_TYPE_NAMES[messageType] || `UNKNOWN(${messageType})`;
    let msg = `[DHCP] ${typeName} from ${mac}`;
    if (ip && ip !== '0.0.0.0') msg += ` IP=${ip}`;
    if (extra) msg += ` ${extra}`;
    return msg;
  }

  /**
   * 序列化选项为 JSON 字符串
   */
  private serializeOptions(options: Map<number, unknown>): string {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of options) {
      if (value instanceof Uint8Array) {
        obj[key] = Array.from(value);
      } else {
        obj[key] = value;
      }
    }
    return JSON.stringify(obj);
  }

  /**
   * 序列化 Client ID
   */
  private serializeClientId(clientId: unknown): string | null {
    if (!clientId) return null;
    if (clientId instanceof Uint8Array) {
      return Array.from(clientId).map(b => b.toString(16).padStart(2, '0')).join(':');
    }
    return String(clientId);
  }
}
