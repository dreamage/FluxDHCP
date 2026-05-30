import { MAGIC_COOKIE, DhcpMessageType } from './constants';
import { decodeOptionValue } from './options';

// 解析后的 DHCP 数据包接口
export interface DhcpPacket {
  op: number;
  htype: number;
  hlen: number;
  hops: number;
  xid: number;
  secs: number;
  flags: number;
  ciaddr: string;
  yiaddr: string;
  siaddr: string;
  giaddr: string;
  chaddr: string;
  sname: string;
  file: string;
  options: Map<number, unknown>;
  messageType?: DhcpMessageType;
}

/**
 * 解析 DHCP 数据包
 * @param buf 原始 UDP 数据
 * @returns 解析后的 DhcpPacket 对象
 * @throws Error 如果数据包格式无效
 */
export function parseDhcpPacket(buf: Buffer): DhcpPacket {
  // 基本长度校验（236 头部 + 4 magic cookie）
  if (buf.length < 240) {
    throw new Error(`DHCP packet too short: ${buf.length} bytes (minimum 240)`);
  }

  // 解析固定头部（236字节）
  const op = buf.readUInt8(0);
  const htype = buf.readUInt8(1);
  const hlen = buf.readUInt8(2);
  const hops = buf.readUInt8(3);
  const xid = buf.readUInt32BE(4);
  const secs = buf.readUInt16BE(8);
  const flags = buf.readUInt16BE(10);

  // 解析 IP 地址字段
  const ciaddr = readIP(buf, 12);
  const yiaddr = readIP(buf, 16);
  const siaddr = readIP(buf, 20);
  const giaddr = readIP(buf, 24);

  // 解析 chaddr（取前 hlen 字节为 MAC 地址）
  const chaddr = formatMac(buf, 28, hlen);

  // 解析 sname 和 file
  const sname = readNullTerminatedString(buf, 44, 64);
  const file = readNullTerminatedString(buf, 108, 128);

  // 验证 Magic Cookie
  const cookie = buf.readUInt32BE(236);
  if (cookie !== MAGIC_COOKIE) {
    throw new Error(`Invalid DHCP magic cookie: 0x${cookie.toString(16)}`);
  }

  // 解析 Options（从偏移240开始）
  const options = parseOptions(buf, 240);

  // 提取消息类型
  const messageType = options.get(53) as DhcpMessageType | undefined;

  return {
    op, htype, hlen, hops, xid, secs, flags,
    ciaddr, yiaddr, siaddr, giaddr,
    chaddr, sname, file,
    options,
    messageType,
  };
}

// 解析 Options 区域
function parseOptions(buf: Buffer, offset: number): Map<number, unknown> {
  const options = new Map<number, unknown>();

  while (offset < buf.length) {
    const code = buf.readUInt8(offset++);

    // 选项 0 (Pad)：跳过
    if (code === 0) continue;

    // 选项 255 (End)：终止
    if (code === 255) break;

    // 读取 Length
    const len = buf.readUInt8(offset++);

    // 读取 Value
    const valueBuf = buf.subarray(offset, offset + len);
    offset += len;

    // 解码选项值
    options.set(code, decodeOptionValue(code, valueBuf));
  }

  return options;
}

// 辅助函数

function readIP(buf: Buffer, offset: number): string {
  return `${buf[offset]}.${buf[offset + 1]}.${buf[offset + 2]}.${buf[offset + 3]}`;
}

function formatMac(buf: Buffer, offset: number, len: number): string {
  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    parts.push(buf[offset + i].toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(':');
}

function readNullTerminatedString(buf: Buffer, offset: number, maxLen: number): string {
  let end = offset;
  while (end < offset + maxLen && buf[end] !== 0) end++;
  return buf.subarray(offset, end).toString('ascii');
}
