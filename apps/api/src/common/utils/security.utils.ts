// ==============================================================================
// LocalSaathi — Security Utilities (Phase 17)
// SSRF Defense, XSS Sanitization & PII Error Scrubbing
// ==============================================================================

import * as net from 'net';

export class SecurityUtils {
  // Private / Reserved IPv4 Subnets (RFC 1918, RFC 3927, RFC 5735)
  private static readonly PRIVATE_IP_RANGES = [
    { start: '10.0.0.0', end: '10.255.255.255' },
    { start: '172.16.0.0', end: '172.31.255.255' },
    { start: '192.168.0.0', end: '192.168.255.255' },
    { start: '127.0.0.0', end: '127.255.255.255' },
    { start: '169.254.0.0', end: '169.254.255.255' }, // Cloud Metadata / Link-Local
    { start: '0.0.0.0', end: '0.255.255.255' },
  ];

  private static ipToLong(ip: string): number {
    return ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  /**
   * Validates external URLs to prevent Server-Side Request Forgery (SSRF).
   * Strictly forbids loopback, internal private subnets, and AWS/GCP cloud metadata endpoints.
   */
  static validateUrlForSsrf(urlString: string): { isSafe: boolean; reason?: string } {
    if (!urlString || typeof urlString !== 'string') {
      return { isSafe: false, reason: 'Empty or invalid URL input' };
    }

    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      return { isSafe: false, reason: 'Malformed URL syntax' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isSafe: false, reason: `Forbidden protocol "${parsed.protocol}"` };
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    // Check known localhost and cloud metadata aliases
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === 'metadata.google.internal' ||
      hostname === 'instance-data'
    ) {
      return { isSafe: false, reason: 'Access to loopback or metadata host is prohibited' };
    }

    // Direct IP Address validation
    if (net.isIPv4(hostname)) {
      const ipVal = this.ipToLong(hostname);
      for (const range of this.PRIVATE_IP_RANGES) {
        const startVal = this.ipToLong(range.start);
        const endVal = this.ipToLong(range.end);
        if (ipVal >= startVal && ipVal <= endVal) {
          return { isSafe: false, reason: `Access to private IP range ${range.start}-${range.end} is forbidden` };
        }
      }
    }

    // Check for IPv6 loopback / local
    if (net.isIPv6(hostname)) {
      if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc00:')) {
        return { isSafe: false, reason: 'Access to IPv6 private or loopback range is forbidden' };
      }
    }

    return { isSafe: true };
  }

  /**
   * Sanitizes rich user input (bio, job descriptions, chat) against Cross-Site Scripting (XSS).
   * Strips script tags, iframe, event handlers, and javascript: links.
   */
  static sanitizeText(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/javascript:[^\s"'>]*/gi, '')
      .replace(/data:text\/html[^\s"'>]*/gi, '')
      .replace(/on\w+\s*=/gi, 'data-blocked=')
      .replace(/<\/?(?:applet|embed|object|base|meta|link)\b[^>]*>/gi, '')
      .trim();
  }

  /**
   * Scrubs sensitive PII, database tables, and connection strings from error messages.
   */
  static scrubErrorMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return 'An error occurred';
    }

    return message
      .replace(/postgres(ql)?:\/\/[^\s]+/gi, '[DATABASE_URL_REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/\b\d{10}\b/g, '[PHONE_REDACTED]')
      .replace(/SELECT\s+.*?\s+FROM/gi, '[SQL_QUERY_REDACTED]')
      .replace(/UPDATE\s+.*?\s+SET/gi, '[SQL_QUERY_REDACTED]')
      .replace(/DELETE\s+FROM/gi, '[SQL_QUERY_REDACTED]');
  }
}
