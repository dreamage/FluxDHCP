import { FluxApiError } from './client';

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(error: unknown): ToolResult {
  if (error instanceof FluxApiError) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ http_status: error.status, error: error.payload }, null, 2),
      }],
      isError: true,
    };
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: {
          code: 'TOOL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      }, null, 2),
    }],
    isError: true,
  };
}

/** 需要显式确认的操作被拒绝时使用。 */
export function refused(message: string, hint: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: { code: 'CONFIRMATION_REQUIRED', message, hint } }, null, 2) }],
    isError: true,
  };
}

export async function runTool(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await fn());
  } catch (error) {
    return errorResult(error);
  }
}
