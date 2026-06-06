import {
  MAGIC_COOKIE, HTYPE_ETHERNET, HLEN_ETHERNET,
  DhcpMessageType, DhcpOptionCode,
} from './constants';
import { encodeOptionValue } from './options';

// 构建选项的配置接口
export interface DhcpPacketBuildOptions {
  op: number;
  xid: number;
  flags?: number;
  ciaddr?: string;
  yiaddr?: string;
  siaddr?: string;
  giaddr?: string;
  chaddr: string;
  sname?: string;
  file?: string;
  options?: Map<number, unknown>;
  messageType: DhcpMessageType;
}

/**
 * 构建 DHCP 响应数据包
 * @param opts 数据包构建选项
 * @returns 编码后的 Buffer
 */
export function buildDhcpPacket(opts: DhcpPacketBuildOptions): Buffer {
  const parts: Buffer[] = [];

  // 1. 固定头部（236字节）
  const header = Buffer.alloc(236);
  header.writeUInt8(opts.op, 0);
  header.writeUInt8(HTYPE_ETHERNET, 1);
  header.writeUInt8(HLEN_ETHERNET, 2);
  header.writeUInt8(0, 3);                                          // hops
  header.writeUInt32BE(opts.xid, 4);
  header.writeUInt16BE(0, 8);                                       // secs
  header.writeUInt16BE(opts.flags || 0, 10);
  writeIP(header, 12, opts.ciaddr || '0.0.0.0');
  writeIP(header, 16, opts.yiaddr || '0.0.0.0');
  writeIP(header, 20, opts.siaddr || '0.0.0.0');
  writeIP(header, 24, opts.giaddr || '0.0.0.0');
  writeMac(header, 28, opts.chaddr);
  // sname (44-107) 和 file (108-235) 保持全零
  if (opts.sname) {
    Buffer.from(opts.sname, 'ascii').copy(header, 44);
  }

  parts.push(header);

  // 2. Magic Cookie（4字节）
  const cookie = Buffer.alloc(4);
  cookie.writeUInt32BE(MAGIC_COOKIE, 0);
  parts.push(cookie);

  // 3. 选项区域
  const allOptions = new Map<number, unknown>(opts.options || []);
  allOptions.set(DhcpOptionCode.MESSAGE_TYPE, opts.messageType);

  // RFC 2131: Option 53 (Message Type) MUST be the first option
  const msgTypeBuf = encodeOptionValue(DhcpOptionCode.MESSAGE_TYPE, opts.messageType);
  const msgTypeOpt = Buffer.alloc(2 + msgTypeBuf.length);
  msgTypeOpt.writeUInt8(DhcpOptionCode.MESSAGE_TYPE, 0);
  msgTypeOpt.writeUInt8(msgTypeBuf.length, 1);
  msgTypeBuf.copy(msgTypeOpt, 2);
  parts.push(msgTypeOpt);

  // Write remaining options sorted by code
  const sortedCodes = [...allOptions.keys()].filter(c => c !== DhcpOptionCode.MESSAGE_TYPE).sort((a, b) => a - b);

  for (const code of sortedCodes) {
    if (code === 0 || code === 255) continue;

    const value = allOptions.get(code)!;
    const valueBuf = encodeOptionValue(code, value);

    // Code(1) + Length(1) + Value(N)
    const optBuf = Buffer.alloc(2 + valueBuf.length);
    optBuf.writeUInt8(code, 0);
    optBuf.writeUInt8(valueBuf.length, 1);
    valueBuf.copy(optBuf, 2);

    parts.push(optBuf);
  }

  // 4. End 选项 (255)
  parts.push(Buffer.from([255]));

  // 5. 拼接并填充到最小包长度 576 字节
  const result = Buffer.concat(parts);
  if (result.length < 576) {
    return Buffer.concat([result, Buffer.alloc(576 - result.length)]);
  }

  return result;
}

// 辅助函数

function writeIP(buf: Buffer, offset: number, ip: string): void {
  const parts = ip.split('.').map(Number);
  parts.forEach((p, i) => buf.writeUInt8(p, offset + i));
}

function writeMac(buf: Buffer, offset: number, mac: string): void {
  const parts = mac.split(/[:\-]/);
  parts.forEach((p, i) => buf.writeUInt8(parseInt(p, 16), offset + i));
}
