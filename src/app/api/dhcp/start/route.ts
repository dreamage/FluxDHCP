import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';

export async function POST() {
  try {
    await dhcpInstance.start();
    return NextResponse.json({ status: 'running', message: 'DHCP server started' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start DHCP server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
