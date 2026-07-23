'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { translateError } from '@/lib/error-map';

// 模块级防抖表:同一文本 800ms 内只弹一次,避免连点/批量操作刷屏
const recent = new Map<string, number>();
const DEDUP_MS = 800;

function dedup(key: string): boolean {
  const now = Date.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUP_MS) return false;
  recent.set(key, now);
  return true;
}

// 从未知错误中提取原始字符串(优先 .error,其次 .message)
function extractRaw(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as { error?: string; message?: string };
    if (typeof e.error === 'string' && e.error) return e.error;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return '';
}

export function useNotify() {
  const { message, notification } = App.useApp();
  const tc = useTranslations('common');

  /** 简单成功提示:顶部轻量条,3s 自动隐藏 */
  const success = (msg: string) => {
    message.success({ content: msg, duration: 3 });
  };

  /** 警告提示:顶部条,3s */
  const warn = (msg: string) => {
    message.warning({ content: msg, duration: 3 });
  };

  /** 普通失败:自动走 translateError,顶部条 3s。err 可为 Error/API 响应/字符串/null */
  const error = (err: unknown, fallbackKey = 'error') => {
    const raw = extractRaw(err);
    const text = raw ? translateError(raw, tc) : tc(fallbackKey);
    if (!dedup(text)) return;
    message.error({ content: text, duration: 3 });
  };

  /** 冲突/业务告警:右上角卡片,4.5s 自动隐藏 */
  const conflict = (title: string, desc?: string) => {
    notification.warning({
      message: title,
      description: desc,
      duration: 4.5,
      placement: 'topRight',
    });
  };

  /** 页面级严重错误(替代页面 Alert):右上角卡片,4.5s */
  const fatal = (title: string, err?: unknown) => {
    const raw = extractRaw(err);
    const desc = raw ? translateError(raw, tc) : undefined;
    notification.error({
      message: title,
      description: desc,
      duration: 4.5,
      placement: 'topRight',
    });
  };

  return { success, warn, error, conflict, fatal };
}
