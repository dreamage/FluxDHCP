import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { FluxClient } from '@/mcp/client';
import { registerAllTools } from '@/mcp/register';
import { apiError, serverError } from '@/lib/api-response';
import { authorize } from '@/lib/api-auth';
import { readCredential } from '@/lib/api-keys';

/**
 * 基于 Streamable HTTP 的 MCP 端点。工具定义位于 src/mcp 下，与传输方式解耦。
 *
 *   POST /api/mcp
 *   Authorization: Bearer fdx_...
 *
 * 采用无状态模式（不分配 sessionId），每个请求独立创建一个 Server 实例，
 * 因此不需要在网关/多实例之间共享会话。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function internalBaseUrl(): string {
  return process.env.FLUXDHCP_INTERNAL_URL || `http://127.0.0.1:${process.env.WEB_PORT || 3000}`;
}

export async function POST(request: Request) {
  try {
    // 该端点只接受 API Key：工具调用会以同一份凭据回访内部 HTTP API，
    // 浏览器会话 cookie 无法这样转发，也不应该用它驱动 agent。
    const { present, key } = readCredential(request);
    if (!present || !key) {
      return apiError('API_KEY_REQUIRED', 'API key required', 401, {
        hint: 'Send "Authorization: Bearer <api-key>". Browser sessions are not accepted on this endpoint.',
      });
    }

    const denied = authorize(request, 'read');
    if (denied) return denied;

    const server = new McpServer({ name: 'fluxdhcp', version: '0.1.0' });
    registerAllTools(server, new FluxClient(internalBaseUrl(), key));

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    return serverError('POST /api/mcp', error, 'MCP request failed');
  }
}
