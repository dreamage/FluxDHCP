/**
 * Translate structured server response strings to localized text.
 * Format: SR|TYPE|param1|param2
 * Falls back to displaying the raw string for legacy/unrecognized formats.
 */
export function translateServerResponse(
  response: string | null | undefined,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (!response) return '';

  // Handle multi-part responses (response + options separated by \n---OPTIONS---\n)
  const parts = response.split('\n---OPTIONS---\n');
  const mainPart = parts[0];

  // Parse structured format: SR|TYPE|param1|param2
  if (mainPart.startsWith('SR|')) {
    const segments = mainPart.split('|');
    const type = segments[1];
    const p1 = segments[2] || '';
    const p2 = segments[3] || '';

    switch (type) {
      case 'DECLINE': return t('srDecline', { ip: p1 });
      case 'RELEASE': return t('srRelease', { ip: p1 });
      case 'OFFER':   return t('srOffer', { ip: p1, pool: p2 });
      case 'ASSIGN':  return t('srAssign', { ip: p1, pool: p2 });
      case 'INFORM':  return t('srInform');
      case 'NAK':     return t('srNak', { reason: p1 });
      default: return mainPart;
    }
  }

  // Legacy format: return as-is
  return mainPart;
}
