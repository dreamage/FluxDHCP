import { NextResponse } from 'next/server';
import { dhcpInstance } from '@/lib/dhcp-instance';

export async function GET() {
  let status = dhcpInstance.getStatus();

  // If singleton says stopped, verify by checking if port 67 is actually in use.
  // This handles cross-instance sync issues caused by Next.js module bundling.
  if (status === 'stopped') {
    const portInUse = await dhcpInstance.isPortInUse();
    if (portInUse) {
      status = 'running';
    }
  }

  return NextResponse.json({ status });
}
