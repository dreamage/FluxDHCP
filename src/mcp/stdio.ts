#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FluxClient } from './client';
import { registerAllTools } from './register';

/**
 * stdio 传输的 MCP server，供本地 agent 客户端拉起。
 *
 *   FLUXDHCP_URL=http://127.0.0.1:3000 FLUXDHCP_API_KEY=fdx_xxx \
 *     node dist/mcp/stdio.js
 *
 * 与 HTTP 端点（/api/mcp）共用同一份工具定义。
 */

// stdout 是 MCP 协议通道，所有日志必须走 stderr。
const log = (message: string) => console.error(`[fluxdhcp-mcp] ${message}`);

const baseUrl = process.env.FLUXDHCP_URL || 'http://127.0.0.1:3000';
const apiKey = process.env.FLUXDHCP_API_KEY;

if (!process.env.FLUXDHCP_URL) {
  log(`FLUXDHCP_URL is not set, falling back to ${baseUrl}`);
}
if (!apiKey) {
  log('FLUXDHCP_API_KEY is not set; requests will be rejected with 401');
}

const client = new FluxClient(baseUrl, apiKey);
const server = new McpServer({ name: 'fluxdhcp', version: '0.1.0' });
registerAllTools(server, client);

async function main() {
  try {
    const status = await client.request<any>('GET', '/api/dhcp/status');
    log(`connected to ${baseUrl} (dhcp: ${status.status})`);
  } catch (error) {
    // 不阻断启动：服务端可能稍后才起来，工具调用时会给出更具体的错误。
    log(`startup probe failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  await server.connect(new StdioServerTransport());
  log('ready on stdio');
}

main().catch((error) => {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
