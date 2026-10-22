const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  hint?: string;
}

export class FluxApiError extends Error {
  constructor(readonly status: number, readonly payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'FluxApiError';
  }
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * FluxDHCP HTTP API 的薄客户端。
 * 鉴权、错误码、分页全部由服务端提供，这里只负责转发与错误透传。
 */
export class FluxClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  async request<T = any>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new FluxApiError(0, {
        code: 'UNREACHABLE',
        message: `Cannot reach FluxDHCP at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
        hint: 'Check that the FluxDHCP server is running and FLUXDHCP_URL points at it.',
      });
    }

    const text = await response.text();
    let data: any = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }

    if (!response.ok) {
      const payload: ApiErrorPayload = data?.error ?? {
        code: `HTTP_${response.status}`,
        message: typeof data === 'string' && data ? data.slice(0, 300) : response.statusText,
      };
      throw new FluxApiError(response.status, payload);
    }

    return data as T;
  }
}
