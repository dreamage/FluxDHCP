const PRIVATE_IP_PATTERNS = [
  (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0',
  (h: string) => h === '169.254.169.254',
  (h: string) => h.startsWith('10.'),
  (h: string) => h.startsWith('192.168.'),
  (h: string) => {
    if (!h.startsWith('172.')) return false;
    const second = parseInt(h.split('.')[1], 10);
    return second >= 16 && second <= 31;
  },
];

export function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only http/https URLs are allowed' };
  }

  const hostname = parsed.hostname;
  if (PRIVATE_IP_PATTERNS.some(fn => fn(hostname))) {
    return { valid: false, error: 'Internal/private URLs are not allowed' };
  }

  return { valid: true };
}
