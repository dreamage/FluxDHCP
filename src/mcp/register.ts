import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FluxClient } from './client';
import { registerReadTools } from './tools/read';
import { registerWriteTools } from './tools/write';
import { registerServiceTools } from './tools/service';

/**
 * 工具注册的唯一入口，由 HTTP 端点（src/app/api/mcp/route.ts）调用。
 * 传输层与工具定义分离，后续新增传输方式时无需改动工具代码。
 */
export function registerAllTools(server: McpServer, client: FluxClient): void {
  registerReadTools(server, client);
  registerWriteTools(server, client);
  registerServiceTools(server, client);
}
