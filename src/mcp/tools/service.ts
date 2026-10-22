import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FluxClient } from '../client';
import { refused, runTool } from '../tool-result';

export function registerServiceTools(server: McpServer, client: FluxClient) {
  server.registerTool('service_start', {
    title: 'Start the DHCP service',
    description:
      'Start the DHCP listener on UDP 67 and persist dhcp_enabled=1. Fails if port 67 is already taken or the process lacks root/NET_ADMIN; the error payload carries the bind error and lastError. ' +
      'Starting is safe to retry, but it does affect every client on the network.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => runTool(() => client.request('POST', '/api/dhcp/start')));

  server.registerTool('service_stop', {
    title: 'Stop the DHCP service',
    description:
      'Stop the DHCP listener and persist dhcp_enabled=0. Every client whose lease expires while the service is down will lose connectivity — this is the highest-impact action in the whole API. ' +
      'Requires confirm=true. Always check dhcp_status and confirm with the user before calling.',
    inputSchema: {
      confirm: z.boolean().optional().describe('Must be true; the call is refused otherwise'),
      reason: z.string().optional().describe('Recorded nowhere, but helps the caller be deliberate'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ confirm }) => {
    if (confirm !== true) {
      return refused(
        'Stopping the DHCP service requires explicit confirmation',
        'Call again with confirm=true only after the user has agreed to take DHCP offline.',
      );
    }
    return runTool(() => client.request('POST', '/api/dhcp/stop'));
  });

  server.registerTool('config_import', {
    title: 'Import configuration',
    description:
      'Replace configuration categories from a previously exported payload. Importing a category DELETES the existing rows for that category first — pools, reservations, device options, MAC blacklist, MAC notes, webhooks, server config, and optionally leases and dhcp_logs. ' +
      'DHCP settings are hot-reloaded immediately. Requires confirm=true. Prefer narrow categories; never import leases/logs unless the user asked for it.',
    inputSchema: {
      data: z.record(z.any()).describe('The exported JSON document (must contain a numeric "version")'),
      categories: z.array(z.enum([
        'pools', 'reservations', 'device_options', 'mac_blacklist', 'mac_notes', 'webhooks', 'config', 'leases', 'dhcp_logs',
      ])).describe('Categories to apply'),
      confirm: z.boolean().optional().describe('Must be true; the call is refused otherwise'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ data, categories, confirm }) => {
    if (confirm !== true) {
      return refused(
        'Importing configuration requires explicit confirmation',
        'Call again with confirm=true after the user approves overwriting the selected categories.',
      );
    }
    return runTool(() => client.request('POST', '/api/config/import', {
      body: { ...data, categories },
    }));
  });
}
