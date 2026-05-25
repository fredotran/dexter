import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dexterPath } from '../utils/paths.js';

const SECURITY_LOG_PATH = dexterPath('security-audit.log');

export function logSecurityEvent(event: {
  type: 'rate_limit' | 'access_denied' | 'pairing_attempt' | 'invalid_message';
  senderId?: string;
  accountId?: string;
  details: string;
  severity: 'info' | 'warn' | 'error';
}): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${event.severity.toUpperCase()} ${event.type}: ${event.details} (sender=${event.senderId ?? 'n/a'}, account=${event.accountId ?? 'n/a'})\n`;

  try {
    const dir = dirname(SECURITY_LOG_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(SECURITY_LOG_PATH, logLine);
  } catch {
    // Silent fail - don't crash on logging errors
  }
}
