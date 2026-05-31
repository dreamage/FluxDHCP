/**
 * Convert IPv4 address string to unsigned 32-bit integer.
 */
export function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Convert unsigned 32-bit integer to IPv4 address string.
 */
export function numToIp(num: number): string {
  return [
    (num >>> 24) & 0xFF,
    (num >>> 16) & 0xFF,
    (num >>> 8) & 0xFF,
    num & 0xFF,
  ].join('.');
}

/**
 * Validate IPv4 address format (each octet 0-255).
 */
export function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return /^\d{1,3}$/.test(p) && n >= 0 && n <= 255;
  });
}

/**
 * Check if an IP falls within a subnet.
 */
export function isIPInSubnet(ip: string, subnet: string, netmask: string): boolean {
  return (ipToNum(ip) & ipToNum(netmask)) === (ipToNum(subnet) & ipToNum(netmask));
}
