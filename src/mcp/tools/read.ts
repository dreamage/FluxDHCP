import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FluxClient } from '../client';
import { runTool } from '../tool-result';

const page = {
  page: z.number().int().positive().optional().describe('1-based page number'),
  pageSize: z.number().int().positive().optional().describe('Rows per page (server default 50, max 1000 for config tables)'),
};

const mac = z.string().describe('MAC address, e.g. AA:BB:CC:DD:EE:FF');

const READ = { readOnlyHint: true, openWorldHint: false } as const;

export function registerReadTools(server: McpServer, client: FluxClient) {
  server.registerTool('dhcp_status', {
    title: 'DHCP status overview',
    description:
      'Aggregated health snapshot: whether the DHCP service is running, address pool usage, lease state counts, leases expiring within 1h/24h, blacklist and declined-IP counts, and 24h request volume. ' +
      'Call this first before any change that touches pools or the service.',
    inputSchema: {},
    annotations: READ,
  }, () => runTool(async () => {
    const d = await client.request<any>('GET', '/api/dashboard');
    return {
      dhcpStatus: d.dhcpStatus,
      activeLeases: d.activeLeases,
      totalIPs: d.totalIPs,
      poolCount: d.poolCount,
      activePoolCount: d.activePoolCount,
      reservationCount: d.reservationCount,
      requests24h: d.requests24h,
      leaseStates: d.leaseStates,
      expiringLeases: d.expiringLeases,
      poolUsage: d.poolUsage,
      security: d.security,
      assets: d.assets,
    };
  }));

  server.registerTool('pool_list', {
    title: 'List address pools',
    description:
      'List address pools with used/total/percentage. Each pool has id, name, subnet, netmask (dotted decimal), start_ip, end_ip, gateway, dns_servers, lease_time (seconds) and enabled (1/0).',
    inputSchema: page,
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/pools', { query: args })));

  server.registerTool('pool_get', {
    title: 'Get one address pool',
    description: 'Fetch a single pool by numeric id.',
    inputSchema: { id: z.number().int().positive().describe('Pool id') },
    annotations: READ,
  }, ({ id }) => runTool(() => client.request('GET', `/api/pools/${id}`)));

  server.registerTool('pool_ips', {
    title: 'List IP allocation inside a pool',
    description:
      'Per-IP state inside a pool: ip, status (free|reserved|bound|offered), mac, hostname, note, isReserved. Also returns aggregate counts. ' +
      'Pools can hold thousands of addresses, so walk pages instead of asking for everything at once.',
    inputSchema: {
      id: z.number().int().positive().describe('Pool id'),
      page: page.page,
      pageSize: z.number().int().positive().optional().describe('Default 1024, capped at the pool size'),
    },
    annotations: READ,
  }, ({ id, ...query }) => runTool(() => client.request('GET', `/api/pools/${id}/ips`, { query })));

  server.registerTool('lease_list', {
    title: 'List leases',
    description:
      'List DHCP leases. Filter by state (BOUND|OFFERED|EXPIRED|RELEASED), pool_id, mac (substring, case-insensitive), hostname (substring) or ip range. ' +
      'Sort with sort=ip_address|mac_address|hostname|state|lease_start|lease_end|pool_name and order=asc|desc.',
    inputSchema: {
      state: z.enum(['BOUND', 'OFFERED', 'EXPIRED', 'RELEASED']).optional(),
      pool_id: z.number().int().positive().optional(),
      mac: z.string().optional().describe('Substring match on MAC address'),
      hostname: z.string().optional().describe('Substring match on hostname'),
      ip_start: z.string().optional().describe('Range start, requires ip_end'),
      ip_end: z.string().optional().describe('Range end, requires ip_start'),
      sort: z.enum(['ip_address', 'mac_address', 'hostname', 'state', 'lease_start', 'lease_end', 'pool_name']).optional(),
      order: z.enum(['asc', 'desc']).optional(),
      ...page,
    },
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/leases', { query: args })));

  server.registerTool('reservation_list', {
    title: 'List static reservations',
    description: 'List MAC to IP reservations. Filter by pool_id, enabled (1|0), mac, hostname or an IP range.',
    inputSchema: {
      pool_id: z.number().int().positive().optional(),
      enabled: z.union([z.literal(0), z.literal(1)]).optional(),
      mac: z.string().optional(),
      hostname: z.string().optional(),
      ip_start: z.string().optional(),
      ip_end: z.string().optional(),
      ...page,
    },
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/reservations', { query: args })));

  server.registerTool('blacklist_list', {
    title: 'List MAC blacklist',
    description: 'List blocked MAC addresses. A blacklisted MAC receives no DHCP response at all while enabled is 1.',
    inputSchema: {
      mac: z.string().optional(),
      reason: z.string().optional(),
      enabled: z.union([z.literal(0), z.literal(1)]).optional(),
      ...page,
    },
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/mac-blacklist', { query: args })));

  server.registerTool('option_list', {
    title: 'List per-device DHCP options',
    description: 'List custom DHCP options bound to individual MAC addresses. option_code is 1-254. Each row carries enabled: 1 means it is sent, 0 means the row is kept but skipped, so the pool default applies.',
    inputSchema: {
      mac: z.string().optional(),
      option_code: z.number().int().min(1).max(254).optional(),
      option_value: z.string().optional(),
      ...page,
    },
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/options', { query: args })));

  server.registerTool('note_list', {
    title: 'List MAC notes',
    description: 'List human-readable labels attached to MAC addresses. Useful for turning a MAC into a device name.',
    inputSchema: { mac: z.string().optional(), note: z.string().optional(), ...page },
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/mac-notes', { query: args })));

  server.registerTool('logs_query', {
    title: 'Query DHCP packet logs',
    description:
      'Query the DHCP transaction log, newest first. Filter by messageType (1=DISCOVER 2=OFFER 3=REQUEST 4=DECLINE 5=ACK 6=NAK 7=RELEASE 8=INFORM), mac, ip or a timestamp range. ' +
      'raw_options are omitted by default because they are large; set includeRaw only when debugging option parsing.',
    inputSchema: {
      messageType: z.number().int().min(1).max(8).optional(),
      mac: z.string().optional(),
      ip: z.string().optional(),
      startTime: z.string().optional().describe('ISO 8601 lower bound, inclusive'),
      endTime: z.string().optional().describe('ISO 8601 upper bound, inclusive'),
      includeRaw: z.boolean().optional().describe('Include parsed raw_options (large; default false)'),
      ...page,
    },
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/dhcp-logs', {
    query: { ...args, includeRaw: args.includeRaw ? 1 : undefined },
  })));

  server.registerTool('webhook_list', {
    title: 'List webhooks',
    description: 'List webhook subscriptions with their event filters and delivery settings.',
    inputSchema: page,
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/webhooks', { query: args })));

  server.registerTool('config_export', {
    title: 'Export configuration',
    description:
      'Export configuration as JSON. Choose categories to limit the payload; without categories the server default set is returned (pools, reservations, device options, MAC blacklist, MAC notes, webhooks, server config). ' +
      'The result can be large, so request only the categories you need.',
    inputSchema: {
      categories: z.array(z.enum([
        'pools', 'reservations', 'device_options', 'mac_blacklist', 'mac_notes', 'webhooks', 'config', 'leases', 'dhcp_logs',
      ])).optional().describe('Categories to include'),
    },
    annotations: READ,
  }, ({ categories }) => runTool(() => client.request('GET', '/api/config/export', {
    query: categories?.length ? { categories: categories.join(',') } : undefined,
  })));

  server.registerTool('config_get', {
    title: 'Read server configuration',
    description:
      'Read current server settings. Values come back as strings, e.g. default_lease_time "86400", t1_ratio "0.5", ip_allocation_order "sequential", honor_requested_ip "1". ' +
      'Read-only: changing settings is not exposed through MCP — ask the user to edit them in the web UI.',
    inputSchema: {},
    annotations: READ,
  }, () => runTool(() => client.request('GET', '/api/config')));

  server.registerTool('mac_info', {
    title: 'Look up a MAC address',
    description:
      'Resolve one MAC to its current state in a single call: reserved or leased IP, pool, hostname, description and note. ' +
      'source is "reservation", "lease" or null when the device is unknown. Usually the fastest first step when someone asks about a specific device.',
    inputSchema: { mac },
    annotations: READ,
  }, ({ mac }) => runTool(() => client.request('GET', '/api/mac-info', { query: { mac } })));

  server.registerTool('webhook_deliveries', {
    title: 'Webhook delivery history',
    description:
      'Inspect recent webhook deliveries: event type, URL, HTTP status, request body, response and error. ' +
      'Filter by webhook_id or status (success|failed|error|pending). Use this to explain missing notifications.',
    inputSchema: {
      webhook_id: z.number().int().positive().optional(),
      status: z.enum(['success', 'failed', 'error', 'pending']).optional(),
      ...page,
    },
    annotations: READ,
  }, (args) => runTool(() => client.request('GET', '/api/webhooks/deliveries', { query: args })));
}
