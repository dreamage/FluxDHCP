import crypto from 'crypto';

/**
 * API Key 的生成与校验。
 * 明文形如 fdx_<32 位 base64url>，只在创建时返回一次；
 * 数据库中仅保存 SHA-256 摘要与前缀，泄露数据库也无法还原密钥。
 */

export type ApiScope = 'read' | 'write';

export interface ApiKeyRow {
  id: number;
  name: string;
  key_prefix: string;
  key_hash: string;
  scope: ApiScope;
  enabled: number;
  last_used_at: string | null;
  created_at: string;
}

export const API_KEY_HEADER_PREFIX = 'fdx_';

export function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `${API_KEY_HEADER_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    hash: hashApiKey(plaintext),
  };
}

/**
 * 取出请求中携带的凭据。
 * 返回 present=false 表示调用方没有携带任何凭据；
 * 返回 key=null 但 present=true 表示带了 Authorization 但格式不合法。
 */
export function readCredential(request: Request): { present: boolean; key: string | null } {
  const authorization = request.headers.get('authorization');
  if (authorization !== null) {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    return { present: true, key: match ? match[1] : null };
  }

  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== null) {
    return { present: true, key: apiKey.trim() || null };
  }

  return { present: false, key: null };
}
