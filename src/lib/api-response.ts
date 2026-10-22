import { NextResponse } from 'next/server';

/**
 * 统一 API 响应契约。
 *
 * 错误：{ error: { code, message, details?, hint? } }
 *   - code    稳定的机器可读错误码，调用方（含 AI agent）据此分支处理
 *   - message 人类可读文案，与前端 i18n 映射表保持一一对应
 *   - details 结构化上下文，例如冲突的资源 id
 *   - hint    可执行的修复建议
 *
 * 列表：{ items, page, pageSize, total }
 */

export interface ApiErrorOptions {
  details?: Record<string, unknown>;
  hint?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    hint?: string;
  };
}

export function apiError(
  code: string,
  message: string,
  status: number,
  options: ApiErrorOptions = {},
) {
  const body: ApiErrorBody = { error: { code, message } };
  if (options.details) body.error.details = options.details;
  if (options.hint) body.error.hint = options.hint;
  return NextResponse.json(body, { status });
}

/** 服务端异常统一出口：记录日志，返回 500，不把内部异常细节暴露给调用方。 */
export function serverError(scope: string, error: unknown, message: string) {
  console.error(`[API] ${scope}:`, error);
  return apiError('INTERNAL_ERROR', message, 500);
}

/** better-sqlite3 唯一约束冲突，映射为 409 而不是 500。 */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return true;
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export interface PageParams {
  page: number;
  pageSize: number;
  offset: number;
}

/** 解析 page/pageSize，非法值回退到默认值，pageSize 做上限保护。 */
export function parsePage(
  searchParams: URLSearchParams,
  options: { defaultPageSize?: number; maxPageSize?: number } = {},
): PageParams {
  const defaultPageSize = options.defaultPageSize ?? 50;
  const maxPageSize = options.maxPageSize ?? 500;

  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawPageSize = parseInt(searchParams.get('pageSize') || String(defaultPageSize), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
    ? Math.min(rawPageSize, maxPageSize)
    : defaultPageSize;

  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function pageResult<T>(items: T[], params: PageParams, total: number): PageResult<T> {
  return { items, page: params.page, pageSize: params.pageSize, total };
}

/**
 * 数据库中的时间字段存在两种历史格式：
 *   - datetime('now')            → 2026-10-22 10:36:00（UTC，无时区标记）
 *   - new Date().toISOString()   → 2026-10-22T10:36:00.000Z
 * 出参统一为带 Z 的 ISO 8601，避免调用方按本地时区误解析。
 */
const TIMESTAMP_FIELDS = new Set([
  'created_at',
  'updated_at',
  'last_used_at',
  'timestamp',
  'lease_start',
  'lease_end',
  'declined_at',
  'expires_at',
  'completed_at',
]);

export function toIsoUtc(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(value);
  if (!match) return value;
  return `${match[1]}T${match[2]}${match[3] ?? ''}Z`;
}

export function serializeRow<T extends Record<string, any>>(row: T): T {
  const result: Record<string, any> = { ...row };
  for (const key of Object.keys(result)) {
    if (TIMESTAMP_FIELDS.has(key)) result[key] = toIsoUtc(result[key]);
  }
  return result as T;
}

export function serializeRows<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map(serializeRow);
}
