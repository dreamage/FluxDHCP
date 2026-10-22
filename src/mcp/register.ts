import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FluxClient } from './client';
import { registerReadTools } from './tools/read';
import { registerWriteTools } from './tools/write';

/**
 * 工具注册的唯一入口，由 HTTP 端点（src/app/api/mcp/route.ts）调用。
 * 传输层与工具定义分离，后续新增传输方式时无需改动工具代码。
 *
 * 服务启停和配置导入不在这里：它们能在一次调用里中断整个网段，
 * 只保留给 Web 界面，agent 无法触达。
 */
export function registerAllTools(server: McpServer, client: FluxClient): void {
  registerReadTools(server, client);
  registerWriteTools(server, client);
}
