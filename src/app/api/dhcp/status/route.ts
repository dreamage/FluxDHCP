import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';
import { authorize } from '@/lib/api-auth';

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  // 直接返回真实状态机状态，不再用"端口被占用即运行中"来猜测，
  // 否则 67 端口被 dnsmasq 等外部进程占用时会误报为 running。
  // lastError 用于与错误响应中的 error 字段区分，避免歧义。
  const status = dhcpInstance.getStatus();
  const lastError = dhcpInstance.getLastError();

  return NextResponse.json({ status, lastError: lastError || null });
}
