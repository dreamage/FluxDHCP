/**
 * Normalize MAC address from various formats to AA:BB:CC:DD:EE:FF
 * Supported formats:
 *   - AA:BB:CC:DD:EE:FF (colon separated)
 *   - AA-BB-CC-DD-EE-FF (dash separated)
 *   - AABBCCDDEEFF (no separator)
 *   - AABB.CCDD.EEFF (dot separated)
 *   - Mixed case
 */
export function normalizeMac(mac: string): string | null {
  if (!mac) return null;
  const cleaned = mac.trim();

  // Remove all separators and validate
  const hex = cleaned.replace(/[:\-.]/g, '');
  if (!/^[0-9A-Fa-f]{12}$/.test(hex)) return null;

  return hex.toUpperCase().match(/.{2}/g)!.join(':');
}
