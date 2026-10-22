import crypto from 'crypto';
import { getDb } from '@/lib/db-instance';

/**
 * 管理员口令与会话。
 *
 * - 单管理员，只有密码，没有用户名
 * - 口令用 scrypt 派生，格式 scrypt$N$r$p$saltHex$hashHex
 * - 会话落库（只存 token 的 SHA-256），7 天绝对过期
 * - 未初始化（没有口令）时，除认证接口外所有 API 均拒绝
 */

export const SESSION_COOKIE = 'fluxdhcp_session';
export const SESSION_TTL_DAYS = 7;

const PASSWORD_KEY = 'admin_password_hash';
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
// N*r*128 是 scrypt 的内存下界，留一倍余量
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N: n, r, p, maxmem: SCRYPT_MAXMEM }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEYLEN);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) return false;

  try {
    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), Number(n), Number(r), Number(p), expected.length);
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** 空字符串永远不是有效口令——未初始化状态必须走 setup。 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password must be a string';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  return null;
}

// ===== config 存取 =====

function readConfig(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeConfig(key: string, value: string): void {
  getDb().prepare(
    'INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\')'
  ).run(key, value);
}

export function deleteAdminPassword(): void {
  getDb().prepare('DELETE FROM config WHERE key = ?').run(PASSWORD_KEY);
}

export function isInitialized(): boolean {
  const hash = readConfig(PASSWORD_KEY);
  return typeof hash === 'string' && hash.length > 0;
}

export function getAdminPasswordHash(): string | null {
  return readConfig(PASSWORD_KEY);
}

export async function setAdminPassword(password: string): Promise<void> {
  writeConfig(PASSWORD_KEY, await hashPassword(password));
}

const envBootstrapState = { checked: false, applied: false };

/**
 * 首次启动时用 ADMIN_PASSWORD 完成初始化，避免“谁先打开页面谁当管理员”的窗口期。
 * 已初始化则完全忽略该环境变量。
 */
export async function ensureAdminBootstrap(): Promise<void> {
  if (envBootstrapState.checked) return;
  envBootstrapState.checked = true;

  if (isInitialized()) return;

  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv && !validatePassword(fromEnv)) {
    await setAdminPassword(fromEnv);
    envBootstrapState.applied = true;
    console.log('[FluxDHCP] Admin password initialized from ADMIN_PASSWORD');
    return;
  }

  if (fromEnv) {
    console.warn('[FluxDHCP] ADMIN_PASSWORD is set but does not meet the policy; ignored');
  }
  console.warn(
    '[FluxDHCP] Admin password is NOT set. Open the web UI to complete setup, ' +
    'or set ADMIN_PASSWORD and restart to avoid a first-visitor window.'
  );
}

// ===== 会话 =====

export interface SessionRow {
  id: number;
  token_hash: string;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  user_agent: string | null;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createSession(userAgent?: string | null): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  getDb().prepare(`
    INSERT INTO admin_sessions (token_hash, created_at, last_seen_at, expires_at, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(hashToken(token), now.toISOString(), now.toISOString(), expiresAt, userAgent || null);

  return { token, expiresAt };
}

export function verifySession(token: string | null | undefined): SessionRow | null {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').get(hashToken(token)) as SessionRow | undefined;
  if (!row) return null;

  if (row.expires_at <= new Date().toISOString()) {
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(row.id);
    return null;
  }

  // last_seen_at 最多每分钟更新一次，避免每个请求都写库
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  if (!row.last_seen_at || row.last_seen_at < cutoff) {
    db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  }

  return row;
}

export function destroySession(token: string | null | undefined): void {
  if (!token) return;
  getDb().prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashToken(token));
}

export function destroyOtherSessions(currentToken: string): void {
  getDb().prepare('DELETE FROM admin_sessions WHERE token_hash != ?').run(hashToken(currentToken));
}

export function destroySessionById(id: number, currentToken: string): boolean {
  const currentHash = hashToken(currentToken);
  const result = getDb().prepare('DELETE FROM admin_sessions WHERE id = ? AND token_hash != ?').run(id, currentHash);
  return result.changes > 0;
}

export function listSessions(currentToken: string | null) {
  const rows = getDb().prepare(
    'SELECT id, created_at, last_seen_at, expires_at, user_agent, token_hash FROM admin_sessions ORDER BY created_at DESC'
  ).all() as SessionRow[];

  const currentHash = currentToken ? hashToken(currentToken) : null;
  return rows.map(row => ({
    id: row.id,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    expires_at: row.expires_at,
    user_agent: row.user_agent,
    current: currentHash !== null && row.token_hash === currentHash,
  }));
}

// ===== cookie =====

export function isHttps(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  return new URL(request.url).protocol === 'https:';
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(index + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

export function sessionCookie(request: Request, token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    secure: isHttps(request),
  };
}

export function clearedSessionCookie(request: Request) {
  return { ...sessionCookie(request, ''), maxAge: 0 };
}

// ===== 登录限流（进程内，重启即清空） =====

const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

const failures = new Map<string, { count: number; lockedUntil: number }>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'local';
}

/** 返回剩余锁定秒数；0 表示未锁定。 */
export function loginLockRemaining(ip: string): number {
  const entry = failures.get(ip);
  if (!entry || entry.lockedUntil <= Date.now()) return 0;
  return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
}

export function recordLoginFailure(ip: string): void {
  const entry = failures.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.count = 0;
  }
  failures.set(ip, entry);
}

export function clearLoginFailures(ip: string): void {
  failures.delete(ip);
}

/** 失败响应统一延迟，钝化时序差异。 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
