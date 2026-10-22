import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FluxClient } from './client';
import { registerReadTools } from './tools/read';
import { registerWriteTools } from './tools/write';
import { registerServiceTools } from './tools/service';

/**
 * 工具注册的唯一入口。
 * stdio（src/mcp/stdio.ts）和 HTTP（src/app/api/mcp/route.ts）共用这一份定义，
 * 避免两种接入方式的工具集出现差异。
 */
export function registerAllTools(server: McpServer, client: FluxClient): void {
  registerReadTools(server, client);
  registerWriteTools(server, client);
  registerServiceTools(server, client);
}
