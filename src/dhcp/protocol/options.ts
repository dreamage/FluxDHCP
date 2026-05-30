import { DhcpOptionCode } from './constants';

// 选项值类型枚举
export enum DhcpOptionValueType {
  IP = 'ip',
  IP_LIST = 'ip_list',
  UINT8 = 'uint8',
  UINT16 = 'uint16',
  UINT32 = 'uint32',
  STRING = 'string',
  BYTES = 'bytes',
}

// 选项元数据定义
export interface DhcpOptionMeta {
  code: DhcpOptionCode;
  name: string;
  valueType: DhcpOptionValueType;
}

// 已知选项的元数据注册表
export const KNOWN_OPTIONS: Map<number, DhcpOptionMeta> = new Map([
  [1,  { code: 1,  name: 'Subnet Mask',            valueType: DhcpOptionValueType.IP }],
  [3,  { code: 3,  name: 'Router',                 valueType: DhcpOptionValueType.IP_LIST }],
  [6,  { code: 6,  name: 'DNS Server',             valueType: DhcpOptionValueType.IP_LIST }],
  [12, { code: 12, name: 'Host Name',              valueType: DhcpOptionValueType.STRING }],
  [15, { code: 15, name: 'Domain Name',            valueType: DhcpOptionValueType.STRING }],
  [28, { code: 28, name: 'Broadcast Address',      valueType: DhcpOptionValueType.IP }],
  [50, { code: 50, name: 'Requested IP',           valueType: DhcpOptionValueType.IP }],
  [51, { code: 51, name: 'Lease Time',             valueType: DhcpOptionValueType.UINT32 }],
  [53, { code: 53, name: 'Message Type',           valueType: DhcpOptionValueType.UINT8 }],
  [54, { code: 54, name: 'Server Identifier',      valueType: DhcpOptionValueType.IP }],
  [55, { code: 55, name: 'Parameter Request List', valueType: DhcpOptionValueType.BYTES }],
  [58, { code: 58, name: 'Renewal Time (T1)',      valueType: DhcpOptionValueType.UINT32 }],
  [59, { code: 59, name: 'Rebinding Time (T2)',    valueType: DhcpOptionValueType.UINT32 }],
  [60, { code: 60, name: 'Vendor Class ID',        valueType: DhcpOptionValueType.STRING }],
  [61, { code: 61, name: 'Client Identifier',      valueType: DhcpOptionValueType.BYTES }],
]);

/**
 * 解码选项值：根据类型将 Buffer 片段转为 JS 值
 */
export function decodeOptionValue(code: number, buf: Buffer): unknown {
  const meta = KNOWN_OPTIONS.get(code);
  const type = meta?.valueType || inferType(buf.length);

  switch (type) {
    case DhcpOptionValueType.IP:
      return bufToStringIP(buf);
    case DhcpOptionValueType.IP_LIST:
      return decodeIPList(buf);
    case DhcpOptionValueType.UINT8:
      return buf.readUInt8(0);
    case DhcpOptionValueType.UINT16:
      return buf.readUInt16BE(0);
    case DhcpOptionValueType.UINT32:
      return buf.readUInt32BE(0);
    case DhcpOptionValueType.STRING:
      return buf.toString('ascii');
    case DhcpOptionValueType.BYTES:
    default:
      return Uint8Array.from(buf);
  }
}

/**
 * 编码选项值：根据类型将 JS 值转为 Buffer
 */
export function encodeOptionValue(code: number, value: unknown): Buffer {
  const meta = KNOWN_OPTIONS.get(code);
  const type = meta?.valueType;

  switch (type) {
    case DhcpOptionValueType.IP:
      return stringIPToBuffer(value as string);
    case DhcpOptionValueType.IP_LIST:
      return encodeIPList(value as string[]);
    case DhcpOptionValueType.UINT8: {
      const b = Buffer.alloc(1);
      b.writeUInt8(value as number, 0);
      return b;
    }
    case DhcpOptionValueType.UINT32: {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(value as number, 0);
      return b;
    }
    case DhcpOptionValueType.STRING:
      return Buffer.from(value as string, 'ascii');
    case DhcpOptionValueType.BYTES:
      return Buffer.from(value as Uint8Array);
    default:
      if (typeof value === 'string') return Buffer.from(value, 'utf-8');
      return Buffer.from(value as Uint8Array);
  }
}

// ===== 辅助函数 =====

function bufToStringIP(buf: Buffer): string {
  return `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`;
}

function stringIPToBuffer(ip: string): Buffer {
  const parts = ip.split('.').map(Number);
  return Buffer.from(parts);
}

function decodeIPList(buf: Buffer): string[] {
  const ips: string[] = [];
  for (let i = 0; i < buf.length; i += 4) {
    ips.push(bufToStringIP(buf.subarray(i, i + 4)));
  }
  return ips;
}

function encodeIPList(ips: string[]): Buffer {
  return Buffer.concat(ips.map(stringIPToBuffer));
}

function inferType(len: number): DhcpOptionValueType {
  if (len === 4) return DhcpOptionValueType.IP;
  if (len % 4 === 0) return DhcpOptionValueType.IP_LIST;
  return DhcpOptionValueType.BYTES;
}
