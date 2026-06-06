// ===== 端口 =====
export const DHCP_SERVER_PORT = 67;
export const DHCP_CLIENT_PORT = 68;

// ===== 操作码 =====
export const OP_BOOTREQUEST = 1;
export const OP_BOOTREPLY = 2;

// ===== 硬件类型 =====
export const HTYPE_ETHERNET = 1;
export const HLEN_ETHERNET = 6;

// ===== Magic Cookie =====
export const MAGIC_COOKIE = 0x63825363;

// ===== 消息类型 (Option 53) =====
export enum DhcpMessageType {
  DISCOVER = 1,
  OFFER = 2,
  REQUEST = 3,
  DECLINE = 4,
  ACK = 5,
  NAK = 6,
  RELEASE = 7,
  INFORM = 8,
}

// 消息类型名称映射
export const MESSAGE_TYPE_NAMES: Record<DhcpMessageType, string> = {
  [DhcpMessageType.DISCOVER]: 'DHCPDISCOVER',
  [DhcpMessageType.OFFER]: 'DHCPOFFER',
  [DhcpMessageType.REQUEST]: 'DHCPREQUEST',
  [DhcpMessageType.DECLINE]: 'DHCPDECLINE',
  [DhcpMessageType.ACK]: 'DHCPACK',
  [DhcpMessageType.NAK]: 'DHCPNAK',
  [DhcpMessageType.RELEASE]: 'DHCPRELEASE',
  [DhcpMessageType.INFORM]: 'DHCPINFORM',
};

// ===== 选项码 =====
export enum DhcpOptionCode {
  PAD = 0,
  SUBNET_MASK = 1,
  ROUTER = 3,
  DNS_SERVER = 6,
  HOST_NAME = 12,
  DOMAIN_NAME = 15,
  BROADCAST_ADDRESS = 28,
  REQUESTED_IP = 50,
  LEASE_TIME = 51,
  MESSAGE_TYPE = 53,
  SERVER_IDENTIFIER = 54,
  PARAMETER_REQUEST_LIST = 55,
  RENEWAL_TIME = 58,
  REBINDING_TIME = 59,
  VENDOR_CLASS_ID = 60,
  CLIENT_IDENTIFIER = 61,
  END = 255,
}

// 选项码友好名称映射
export const OPTION_CODE_NAMES: Partial<Record<DhcpOptionCode, string>> = {
  [DhcpOptionCode.SUBNET_MASK]: 'Subnet Mask',
  [DhcpOptionCode.ROUTER]: 'Router/Gateway',
  [DhcpOptionCode.DNS_SERVER]: 'DNS Server',
  [DhcpOptionCode.HOST_NAME]: 'Host Name',
  [DhcpOptionCode.DOMAIN_NAME]: 'Domain Name',
  [DhcpOptionCode.BROADCAST_ADDRESS]: 'Broadcast Address',
  [DhcpOptionCode.REQUESTED_IP]: 'Requested IP',
  [DhcpOptionCode.LEASE_TIME]: 'Lease Time',
  [DhcpOptionCode.MESSAGE_TYPE]: 'Message Type',
  [DhcpOptionCode.SERVER_IDENTIFIER]: 'Server Identifier',
  [DhcpOptionCode.PARAMETER_REQUEST_LIST]: 'Parameter Request List',
  [DhcpOptionCode.RENEWAL_TIME]: 'Renewal Time (T1)',
  [DhcpOptionCode.REBINDING_TIME]: 'Rebinding Time (T2)',
  [DhcpOptionCode.VENDOR_CLASS_ID]: 'Vendor Class ID',
  [DhcpOptionCode.CLIENT_IDENTIFIER]: 'Client Identifier',
};

// ===== 数据包固定偏移量 =====
export const DHCP_PACKET_HEADER_SIZE = 236;
export const DHCP_MAGIC_COOKIE_SIZE = 4;
export const DHCP_MIN_PACKET_SIZE = 576;
export const DHCP_CHADDR_SIZE = 16;
export const DHCP_SNAME_SIZE = 64;
export const DHCP_FILE_SIZE = 128;

// ===== 广播标志 =====
export const BROADCAST_FLAG = 0x8000;
