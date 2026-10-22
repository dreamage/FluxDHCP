/**
 * 统一的剪贴板写入。
 *
 * 优先用异步 Clipboard API;它只在安全上下文(https 或 localhost)下存在,
 * 通过局域网 IP 的 http 访问时 `navigator.clipboard` 为 undefined,
 * 因此需要回退到 textarea + execCommand('copy')。
 *
 * 返回是否复制成功,调用方据此决定提示成功还是失败。
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒或文档未聚焦,继续走下面的回退方案
    }
  }

  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  try {
    const active = document.activeElement as HTMLElement | null;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    active?.focus({ preventScroll: true });
    return ok;
  } catch {
    return false;
  }
}
