/**
 * Translate structured server response strings to localized text.
 * Format: SR|TYPE|param1|param2  (for simple responses)
 * Format: SR|NAK|CODE|param1|param2  (for NAK with reason codes)
 */
export function translateServerResponse(
  response: string | null | undefined,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (!response) return '';

  const parts = response.split('\n---OPTIONS---\n');
  const mainPart = parts[0] || '';

  if (mainPart.startsWith('SR|')) {
    const segments = mainPart.split('|');
    const type = segments[1];

    try {
      if (type === 'NAK') {
        const code = segments[2] || '';
        const p1 = segments[3] || '';
        const p2 = segments[4] || '';
        switch (code) {
          case 'NO_REQUESTED_IP': return t('srNakNoRequestedIp');
          case 'NOT_IN_POOL':     return t('srNakNotInPool', { ip: p1 });
          case 'RESERVED_MISMATCH': return t('srNakReservedMismatch', { reserved: p1, requested: p2 });
          case 'IP_LEASED':       return t('srNakIpLeased', { ip: p1, mac: p2 });
          case 'POOL_DISABLED':   return t('srNakPoolDisabled', { ip: p1 });
          default:                return t('srNak', { reason: code });
        }
      }

      const p1 = segments[2] || '';
      const p2 = segments[3] || '';
      switch (type) {
        case 'DECLINE': return t('srDecline', { ip: p1 });
        case 'RELEASE': return t('srRelease', { ip: p1 });
        case 'OFFER':   return t('srOffer', { ip: p1, pool: p2 });
        case 'ASSIGN':  return t('srAssign', { ip: p1, pool: p2 });
        case 'INFORM':  return t('srInform');
        default: return mainPart;
      }
    } catch {
      // Fallback
      return mainPart.replace(/^SR\|/, '').replace(/\|/g, ' ');
    }
  }

  return mainPart;
}
