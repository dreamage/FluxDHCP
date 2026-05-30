/**
 * Translate API error messages to i18n keys.
 * Maps English API error strings to translation keys.
 * Falls back to the original string if no mapping found.
 */

const ERROR_MAP: Record<string, string> = {
  // Field validation
  'Missing required fields': 'errMissingFields',
  'Invalid MAC address format': 'errInvalidMac',
  'Invalid URL format': 'errInvalidUrl',

  // Resource not found
  'Pool not found': 'errPoolNotFound',
  'Reservation not found': 'errReservationNotFound',
  'Option not found': 'errOptionNotFound',
  'Webhook not found': 'errWebhookNotFound',
  'MAC note not found': 'errMacNoteNotFound',
  'Note is required': 'errNoteRequired',
  'MAC address and note are required': 'errMacNoteRequired',
  'No active lease found for this IP': 'errNoActiveLease',

  // Duplicate / conflict
  'MAC address already reserved': 'errMacAlreadyReserved',
  'IP address already reserved': 'errIpAlreadyReserved',
  'Option already exists for this MAC address': 'errOptionAlreadyExists',
  'IP address is currently leased to another device': 'errIpLeasedToOther',

  // Range / format
  'IP address is not within the selected pool range': 'errIpOutOfRange',
  'IP address is not within the subnet': 'errIpOutOfRange',
  'Start IP must be less than or equal to End IP': 'errStartIpGreaterThanEnd',

  // Generic failures
  'Failed to fetch config': 'errFailedFetch',
  'Failed to update config': 'errFailedUpdate',
  'Failed to fetch pools': 'errFailedFetch',
  'Failed to fetch pool': 'errFailedFetch',
  'Failed to create pool': 'errFailedCreate',
  'Failed to update pool': 'errFailedUpdate',
  'Failed to delete pool': 'errFailedDelete',
  'Failed to fetch reservations': 'errFailedFetch',
  'Failed to fetch reservation': 'errFailedFetch',
  'Failed to create reservation': 'errFailedCreate',
  'Failed to update reservation': 'errFailedUpdate',
  'Failed to delete reservation': 'errFailedDelete',
  'Failed to fetch leases': 'errFailedFetch',
  'Failed to release lease': 'errFailedDelete',
  'Failed to fetch options': 'errFailedFetch',
  'Failed to fetch option': 'errFailedFetch',
  'Failed to create option': 'errFailedCreate',
  'Failed to update option': 'errFailedUpdate',
  'Failed to delete option': 'errFailedDelete',
  'Failed to fetch logs': 'errFailedFetch',
  'Failed to fetch webhooks': 'errFailedFetch',
  'Failed to create webhook': 'errFailedCreate',
  'Failed to update webhook': 'errFailedUpdate',
  'Failed to delete webhook': 'errFailedDelete',
  'Failed to fetch MAC notes': 'errFailedFetch',
  'Failed to save MAC note': 'errFailedCreate',
  'Failed to fetch MAC note': 'errFailedFetch',
  'Failed to update MAC note': 'errFailedUpdate',
  'Failed to delete MAC note': 'errFailedDelete',
};

// For messages that start with a known prefix (e.g., long MAC format messages)
const PREFIX_MAP: Array<[string, string]> = [
  ['Invalid MAC address format', 'errInvalidMac'],
  ['Missing required fields', 'errMissingFields'],
];

export function getErrorKey(errorMessage: string): string | null {
  // Exact match
  if (ERROR_MAP[errorMessage]) return ERROR_MAP[errorMessage];

  // Prefix match
  for (const [prefix, key] of PREFIX_MAP) {
    if (errorMessage.startsWith(prefix)) return key;
  }

  return null;
}

/**
 * Translate an API error message using the common translations.
 * Falls back to the raw error message if no translation found.
 */
export function translateError(errorMessage: string, tc: (key: string) => string): string {
  const key = getErrorKey(errorMessage);
  if (key) {
    try { return tc(key); } catch { /* no translation */ }
  }
  return errorMessage;
}
