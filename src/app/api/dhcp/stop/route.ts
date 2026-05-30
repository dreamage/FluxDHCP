import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';

export async function POST() {
  try {
    await dhcpInstance.stop();
    return NextResponse.json({ status: 'stopped', message: 'DHCP server stopped' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to stop DHCP server';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
