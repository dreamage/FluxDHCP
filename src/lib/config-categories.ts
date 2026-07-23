// 配置类别定义(顺序即展示顺序;前 7 个默认导出)
export const CONFIG_CATEGORIES = [
  { key: 'pools', label: 'catPools' },
  { key: 'reservations', label: 'catReservations' },
  { key: 'device_options', label: 'catDeviceOptions' },
  { key: 'mac_blacklist', label: 'catMacBlacklist' },
  { key: 'mac_notes', label: 'catMacNotes' },
  { key: 'webhooks', label: 'catWebhooks' },
  { key: 'config', label: 'catConfig' },
  { key: 'leases', label: 'catLeases' },
  { key: 'dhcp_logs', label: 'catDhcpLogs' },
];

export const DEFAULT_EXPORT_KEYS = CONFIG_CATEGORIES.slice(0, 7).map(c => c.key);

// 各类别对应的数据库表名
export const CATEGORY_TABLES: Record<string, string> = {
  pools: 'pools',
  reservations: 'reservations',
  device_options: 'device_options',
  mac_blacklist: 'mac_blacklist',
  mac_notes: 'mac_notes',
  webhooks: 'webhooks',
  config: 'config',
  leases: 'leases',
  dhcp_logs: 'dhcp_logs',
};
