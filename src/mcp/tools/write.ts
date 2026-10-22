import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FluxApiError, type FluxClient } from '../client';
import { refused, runTool } from '../tool-result';

const ip = z.string().describe('Dotted-decimal IPv4, e.g. 192.168.1.10');
const mac = z.string().describe('MAC address, e.g. AA:BB:CC:DD:EE:FF');

const webhookEvent = z.enum([
  'dhcp_discover', 'dhcp_offer', 'dhcp_request', 'dhcp_ack',
  'dhcp_nak', 'dhcp_release', 'dhcp_inform', 'dhcp_decline',
]);

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

export function registerWriteTools(server: McpServer, client: FluxClient) {
  server.registerTool('pool_create', {
    title: 'Create an address pool',
    description:
      'Create a DHCP address pool. Constraints enforced by the server: netmask must be dotted decimal (255.255.255.0, not 24); start_ip/end_ip must lie inside subnet/netmask; start_ip <= end_ip; the range must not overlap any existing pool; a pool may hold at most 4096 addresses. ' +
      'Returns the created pool including its new id.',
    inputSchema: {
      name: z.string().describe('Human-readable pool name'),
      subnet: ip.describe('Network address, e.g. 192.168.1.0'),
      netmask: z.string().describe('Dotted-decimal netmask, e.g. 255.255.255.0'),
      start_ip: ip.describe('First allocatable address'),
      end_ip: ip.describe('Last allocatable address'),
      gateway: ip.optional(),
      dns_servers: z.array(z.string()).optional().describe('Ordered DNS server list'),
      lease_time: z.number().int().positive().optional().describe('Lease time in seconds, default 86400'),
    },
    annotations: WRITE,
  }, (args) => runTool(() => client.request('POST', '/api/pools', { body: args })));

  server.registerTool('pool_update', {
    title: 'Update an address pool',
    description:
      'Partially update a pool; omitted fields keep their current value. The same subnet/range/overlap/4096-address constraints apply after merging. Returns the updated pool.',
    inputSchema: {
      id: z.number().int().positive(),
      name: z.string().optional(),
      subnet: ip.optional(),
      netmask: z.string().optional(),
      start_ip: ip.optional(),
      end_ip: ip.optional(),
      gateway: ip.optional(),
      dns_servers: z.array(z.string()).optional(),
      lease_time: z.number().int().positive().optional(),
      enabled: z.boolean().optional(),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, ({ id, ...body }) => runTool(() => client.request('PUT', `/api/pools/${id}`, { body })));

  server.registerTool('pool_delete', {
    title: 'Delete an address pool',
    description:
      'Delete a pool and its reservations and lease rows. Refused with 409 POOL_HAS_ACTIVE_LEASES while the pool still has BOUND or OFFERED leases — release them first. ' +
      'This is irreversible; confirm with the user before calling.',
    inputSchema: { id: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, ({ id }) => runTool(() => client.request('DELETE', `/api/pools/${id}`)));

  server.registerTool('lease_release', {
    title: 'Release or purge a lease',
    description:
      'Without purge: mark the lease at this IP as RELEASED (only BOUND/OFFERED leases; returns 404 otherwise). ' +
      'With purge=true: permanently delete a RELEASED or EXPIRED lease row (returns 404 if none). ' +
      'Releasing does not delete the device reservation.',
    inputSchema: {
      ip_address: ip,
      purge: z.boolean().optional().describe('Delete the row instead of releasing it'),
    },
    annotations: { ...DESTRUCTIVE, destructiveHint: false },
  }, ({ ip_address, purge }) => runTool(() => client.request('DELETE', `/api/leases/${ip_address}`, {
    query: purge ? { purge: 'true' } : undefined,
  })));

  server.registerTool('reservation_create', {
    title: 'Create a static reservation',
    description:
      'Bind a MAC to a fixed IP inside an existing pool. Rejected when the MAC or IP is already reserved (409), when the IP is outside the pool subnet (400), or when another device currently holds an active lease on that IP (409 IP_LEASED_TO_OTHER). Returns the created reservation with pool_name.',
    inputSchema: {
      mac_address: mac,
      ip_address: ip,
      pool_id: z.number().int().positive(),
      hostname: z.string().optional(),
      description: z.string().optional(),
    },
    annotations: WRITE,
  }, (args) => runTool(() => client.request('POST', '/api/reservations', { body: args })));

  server.registerTool('reservation_delete', {
    title: 'Delete a static reservation',
    description: 'Delete a reservation by id. The device keeps whatever lease it already holds.',
    inputSchema: { id: z.number().int().positive() },
    annotations: DESTRUCTIVE,
  }, ({ id }) => runTool(() => client.request('DELETE', `/api/reservations/${id}`)));

  server.registerTool('blacklist_add', {
    title: 'Block or update a MAC',
    description:
      'Add a MAC to the blacklist, or update the reason/enabled flag if it already exists (upsert). While enabled, the server sends no DHCP response to that MAC at all — the device will fall back to self-assigned addressing.',
    inputSchema: {
      mac_address: mac,
      reason: z.string().optional(),
      enabled: z.boolean().optional().describe('Default true'),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, (args) => runTool(() => client.request('POST', '/api/mac-blacklist', { body: args })));

  server.registerTool('blacklist_remove', {
    title: 'Unblock a MAC',
    description: 'Remove a MAC from the blacklist so it can obtain leases again.',
    inputSchema: { mac_address: mac },
    annotations: DESTRUCTIVE,
  }, ({ mac_address }) => runTool(() => client.request('DELETE', `/api/mac-blacklist/${encodeURIComponent(mac_address)}`)));

  server.registerTool('option_set', {
    title: 'Set a per-device DHCP option',
    description:
      'Upsert a DHCP option for one MAC. option_code must be 1-254; the value is sent as a raw string and must not exceed 255 bytes. ' +
      'Creates the option when absent, updates it when the MAC already has that code.',
    inputSchema: {
      mac_address: mac,
      option_code: z.number().int().min(1).max(254),
      option_value: z.string(),
      option_name: z.string().optional(),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, async (args) => runTool(async () => {
    try {
      return await client.request('POST', '/api/options', { body: args });
    } catch (error) {
      if (!(error instanceof FluxApiError) || error.payload.code !== 'OPTION_ALREADY_EXISTS') throw error;
      const listed = await client.request<any>('GET', '/api/options', {
        query: { mac: args.mac_address, option_code: args.option_code, pageSize: 200 },
      });
      const existing = (listed.items ?? []).find(
        (row: any) => row.option_code === args.option_code
          && String(row.mac_address).toUpperCase() === args.mac_address.toUpperCase(),
      );
      if (!existing) throw error;
      return client.request('PUT', `/api/options/${existing.id}`, {
        body: { option_value: args.option_value, option_name: args.option_name },
      });
    }
  }));

  server.registerTool('note_set', {
    title: 'Set a MAC note',
    description: 'Attach or replace a human-readable note on a MAC address (upsert). Notes show up in the UI and in webhook templates as {{mac_note}}.',
    inputSchema: { mac_address: mac, note: z.string().min(1) },
    annotations: { ...WRITE, idempotentHint: true },
  }, (args) => runTool(() => client.request('POST', '/api/mac-notes', { body: args })));

  server.registerTool('webhook_test', {
    title: 'Send a test webhook',
    description:
      'Send a test delivery using the stored webhook configuration and sample values. Returns success, http status and message. ' +
      'A failed delivery is reported as a normal result with success=false, not as a tool error.',
    inputSchema: { id: z.number().int().positive().describe('Webhook id') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, ({ id }) => runTool(() => client.request('POST', '/api/webhooks/test', { body: { id } })));

  server.registerTool('reservation_update', {
    title: 'Update a static reservation',
    description:
      'Partially update a reservation by id; omitted fields keep their current value. The same constraints as creation apply after merging: ' +
      'MAC and IP stay unique (409), the IP must be inside the target pool subnet (400), and an IP currently leased to another device is rejected (409 IP_LEASED_TO_OTHER). ' +
      'Returns the updated row.',
    inputSchema: {
      id: z.number().int().positive(),
      mac_address: mac.optional(),
      ip_address: ip.optional(),
      hostname: z.string().optional(),
      pool_id: z.number().int().positive().optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional(),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, ({ id, ...body }) => runTool(() => client.request('PUT', `/api/reservations/${id}`, { body })));

  server.registerTool('option_delete', {
    title: 'Delete a per-device DHCP option',
    description: 'Delete one device option by id. Use option_list to find the id first — the id is not the option code.',
    inputSchema: { id: z.number().int().positive().describe('device_options row id') },
    annotations: DESTRUCTIVE,
  }, ({ id }) => runTool(() => client.request('DELETE', `/api/options/${id}`)));

  server.registerTool('note_delete', {
    title: 'Delete a MAC note',
    description: 'Delete the note attached to a MAC address. The reservation, lease and blacklist entry for that MAC are untouched.',
    inputSchema: { mac_address: mac },
    annotations: DESTRUCTIVE,
  }, ({ mac_address }) => runTool(() => client.request('DELETE', `/api/mac-notes/${encodeURIComponent(mac_address)}`)));

  server.registerTool('logs_clear', {
    title: 'Clear all DHCP logs',
    description:
      'Permanently delete every DHCP packet log. This destroys the troubleshooting trail and cannot be undone. ' +
      'Requires confirm=true; the request is refused locally otherwise.',
    inputSchema: { confirm: z.boolean().optional().describe('Must be true; the call is refused otherwise') },
    annotations: DESTRUCTIVE,
  }, async ({ confirm }) => {
    if (confirm !== true) {
      return refused(
        'Clearing DHCP logs requires explicit confirmation',
        'Call again with confirm=true only after the user agrees to lose the packet history.',
      );
    }
    return runTool(() => client.request('DELETE', '/api/dhcp-logs'));
  });

  server.registerTool('webhook_create', {
    title: 'Create a webhook',
    description:
      'Create an outbound webhook. events must contain at least one type; fields are template pairs such as {name:"{{mac_address}}", value:"{{ip_address}}"}. ' +
      'The server rejects private/internal URLs (localhost, 10/8, 172.16/12, 192.168/16, 169.254.169.254) to limit SSRF. ' +
      'A webhook opens an outbound channel from this server and can carry lease data — only create one when the user asked for it.',
    inputSchema: {
      name: z.string(),
      url: z.string().describe('http(s) URL; private/internal addresses are rejected'),
      method: z.enum(['POST', 'GET']),
      events: z.array(webhookEvent).min(1),
      fields: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
      body_mode: z.enum(['json', 'form']).optional().describe('POST body format, default json'),
      headers: z.record(z.string()).optional().describe('Extra request headers'),
    },
    annotations: { ...WRITE, openWorldHint: true },
  }, (args) => runTool(() => client.request('POST', '/api/webhooks', { body: args })));

  server.registerTool('webhook_update', {
    title: 'Update a webhook',
    description:
      'Partially update a webhook by id; omitted fields keep their value. The URL is revalidated whenever it changes. Returns the updated row.',
    inputSchema: {
      id: z.number().int().positive(),
      name: z.string().optional(),
      url: z.string().optional(),
      method: z.enum(['POST', 'GET']).optional(),
      events: z.array(webhookEvent).min(1).optional(),
      fields: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
      body_mode: z.enum(['json', 'form']).optional(),
      headers: z.record(z.string()).optional(),
      enabled: z.boolean().optional(),
    },
    annotations: { ...WRITE, idempotentHint: true, openWorldHint: true },
  }, ({ id, ...body }) => runTool(() => client.request('PUT', `/api/webhooks/${id}`, { body })));

  server.registerTool('webhook_delete', {
    title: 'Delete a webhook',
    description: 'Delete a webhook by id. Future events stop being delivered; existing delivery logs are kept for inspection.',
    inputSchema: { id: z.number().int().positive() },
    annotations: { ...DESTRUCTIVE, openWorldHint: true },
  }, ({ id }) => runTool(() => client.request('DELETE', `/api/webhooks/${id}`)));
}
