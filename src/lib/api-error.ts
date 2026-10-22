/**
 * 从 API 响应体中提取人类可读的错误文案。
 * 兼容结构化错误 { error: { code, message } } 与旧式 { error: string }。
 */
export function apiErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const err = (payload as { error?: unknown }).error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/** 提取稳定错误码，供需要按错误类型分支的调用方使用。 */
export function apiErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const err = (payload as { error?: unknown }).error;
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}
