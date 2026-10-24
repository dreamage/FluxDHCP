'use client';

import { useEffect, useState } from 'react';

/**
 * 是否为窄屏（默认 < 768px）。
 *
 * 首帧一律返回 false，与服务端渲染结果保持一致，挂载后再按真实宽度切换，
 * 避免 hydration 不匹配。
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}
