import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';
import { apiError } from '@/lib/api-response';
import { hashApiKey, readCredential } from '@/lib/api-keys';
import type { ApiKeyRow, ApiScope } from '@/lib/api-keys';
import { readSessionToken, verifySession } from '@/lib/auth';

/**
 * 路由级鉴权。
 *
 * 两种合法身份：
 *   - 管理员会话（HttpOnly cookie）—— Web UI，拥有全部权限
 *   - API Key（Authorization: Bearer / X-API-Key）—— agent，按 scope 限制
 *
 * 没有凭据一律 401。只有 /api/auth/* 下的认证接口不经过这里。
 */

type AuthResult =
  | { kind: 'session'; token: string }
  | { kind: 'key'; key: ApiKeyRow }
  | { kind: 'error'; response: NextResponse };

function lookupKey(credential: string): ApiKeyRow | undefined {
  return getDb().prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hashApiKey(credential)) as ApiKeyRow | undefined;
}

function authenticate(request: Request): AuthResult {
  const { present, key } = readCredential(request);

  // API Key 优先：显式携带凭据时按凭据校验，失败不回落成会话
  if (present) {
    if (!key) {
      return {
        kind: 'error',
        response: apiError('INVALID_AUTHORIZATION', 'Invalid Authorization header', 401, {
          hint: 'Use "Authorization: Bearer <api-key>" or the X-API-Key header.',
        }),
      };
    }

    const row = lookupKey(key);
    if (!row) {
      return {
        kind: 'error',
        response: apiError('INVALID_API_KEY', 'Invalid API key', 401, {
          hint: 'The key does not exist. Create a new one in Settings → API access.',
        }),
      };
    }

    if (!row.enabled) {
      return {
        kind: 'error',
        response: apiError('API_KEY_DISABLED', 'API key is disabled', 401, { details: { keyId: row.id } }),
      };
    }

    // 写放大保护：last_used_at 最多每分钟更新一次
    try {
      getDb().prepare(
        `UPDATE api_keys SET last_used_at = datetime('now')
         WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-60 seconds'))`
      ).run(row.id);
    } catch { /* 更新时间失败不影响鉴权 */ }

    return { kind: 'key', key: row };
  }

  const token = readSessionToken(request);
  if (token) {
    if (verifySession(token)) return { kind: 'session', token };
    return {
      kind: 'error',
      response: apiError('SESSION_INVALID', 'Session expired or invalid', 401, {
        hint: 'Sign in again.',
      }),
    };
  }

  return {
    kind: 'error',
    response: apiError('AUTH_REQUIRED', 'Authentication required', 401, {
      hint: 'Sign in through the web UI, or send "Authorization: Bearer <api-key>".',
    }),
  };
}

export interface AuthorizeOptions {
  /** 是否允许通过 API Key 调用该接口。密钥管理类接口应设为 false，避免 key 自我提权。 */
  allowApiKey?: boolean;
}

/**
 * 校验请求是否满足指定权限。
 * 返回 null 表示放行；返回 NextResponse 表示应直接作为响应返回。
 */
export function authorize(
  request: Request,
  required: ApiScope,
  options: AuthorizeOptions = {},
): NextResponse | null {
  const result = authenticate(request);
  if (result.kind === 'error') return result.response;

  // 管理员会话拥有全部权限
  if (result.kind === 'session') return null;

  // 密钥管理类接口完全不接受 API Key，先于 scope 判断，避免给出误导性错误
  if (options.allowApiKey === false) {
    return apiError('API_KEY_MANAGEMENT_FORBIDDEN', 'API keys cannot manage API keys', 403, {
      details: { keyId: result.key.id },
      hint: 'Manage keys from the web UI instead.',
    });
  }

  if (required === 'write' && result.key.scope === 'read') {
    return apiError('API_KEY_READ_ONLY', 'This API key only has read permission', 403, {
      details: { keyId: result.key.id, scope: result.key.scope },
      hint: 'Use an API key with write scope for mutating requests.',
    });
  }

  return null;
}
