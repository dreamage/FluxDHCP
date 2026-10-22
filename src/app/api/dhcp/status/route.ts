import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';

export async function GET() {
  // 直接返回真实状态机状态，不再用"端口被占用即运行中"来猜测，
  // 否则 67 端口被 dnsmasq 等外部进程占用时会误报为 running。
  const status = dhcpInstance.getStatus();
  const error = dhcpInstance.getLastError();

  return NextResponse.json({ status, ...(error ? { error } : {}) });
}
