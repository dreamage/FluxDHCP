/**
 * Translate structured server response strings to localized text.
 * Handles both new format (SR|TYPE|params) and legacy format (NAK: reason, etc.)
 */
export function translateServerResponse(
  response: string | null | undefined,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (!response) return '';

  const parts = response.split('\n---OPTIONS---\n');
  const mainPart = parts[0] || '';

  // New structured format: SR|TYPE|param1|param2
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
          case 'USE_OWN_IP':     return t('srNakUseOwnIp', { own_ip: p1, requested_ip: p2 });
          case 'MUST_DISCOVER':  return t('srNakMustDiscover');
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
        case 'BLOCKED': return t('srBlocked', { reason: p1 });
        default: return mainPart;
      }
    } catch {
      return mainPart.replace(/^SR\|/, '').replace(/\|/g, ' ');
    }
  }

  // Legacy format: translate known patterns
  if (mainPart.startsWith('NAK: ')) {
    const reason = mainPart.substring(5); // Remove "NAK: " prefix
    if (reason === 'No requested IP') return t('srNakNoRequestedIp');
    if (reason.startsWith('Reserved IP mismatch for')) return t('srNakReservedMismatch', { reserved: '—', requested: '—' });
    if (reason.startsWith('IP ') && reason.includes('not in any enabled pool')) {
      const ip = reason.replace('IP ', '').replace(' not in any enabled pool', '');
      return t('srNakNotInPool', { ip });
    }
    if (reason.startsWith('IP ') && reason.includes('already leased to')) {
      const match = reason.match(/^IP (.+) already leased to (.+)$/);
      return t('srNakIpLeased', { ip: match?.[1] || '', mac: match?.[2] || '' });
    }
    // Unknown reason, return as-is
    return mainPart;
  }

  // Legacy: Offered/Assigned/Declined/Released/INFORM (plain English)
  if (mainPart.startsWith('Offered IP ')) {
    const match = mainPart.match(/^Offered IP (.+) from pool "(.+)"$/);
    if (match) return t('srOffer', { ip: match[1], pool: match[2] });
  }
  if (mainPart.startsWith('Assigned IP ')) {
    const match = mainPart.match(/^Assigned IP (.+) from pool "(.+)"$/);
    if (match) return t('srAssign', { ip: match[1], pool: match[2] });
  }
  if (mainPart.startsWith('Client declined IP ')) {
    const ip = mainPart.replace('Client declined IP ', '').replace(' (address conflict)', '');
    return t('srDecline', { ip });
  }
  if (mainPart.startsWith('Client released IP ')) {
    const ip = mainPart.replace('Client released IP ', '');
    return t('srRelease', { ip });
  }
  if (mainPart === 'INFORM response with configuration options') {
    return t('srInform');
  }

  return mainPart;
}
