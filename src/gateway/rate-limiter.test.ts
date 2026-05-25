import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { checkRateLimit, getRateLimitStatus } from './rate-limiter.js';

describe('rate limiter', () => {
  let now = 0;
  const originalDateNow = Date.now.bind(globalThis.Date);

  beforeEach(() => {
    now = 0;
    globalThis.Date.now = () => now;
  });

  afterEach(() => {
    globalThis.Date.now = originalDateNow;
  });

  test('allows burst messages up to burst size', () => {
    const sender = '+15550001111';
    const account = 'default';

    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(sender, account);
      expect(result.allowed).toBe(true);
    }

    const status = getRateLimitStatus(sender, account);
    expect(status.burstRemaining).toBe(0);
    expect(status.minuteRemaining).toBe(5); // 10 - 5 used
  });

  test('blocks when minute window is exceeded', () => {
    const sender = '+15550002222';
    const account = 'default';

    // Send 10 messages (burst 5 + 5 more)
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit(sender, account);
      expect(result.allowed).toBe(true);
    }

    // 11th message should be blocked
    const result = checkRateLimit(sender, account);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('minute_limit_exceeded');
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test('blocks when hour window is exceeded', () => {
    const sender = '+15550003333';
    const account = 'default';

    // Send 100 messages across multiple minute windows
    for (let i = 0; i < 100; i++) {
      // Advance time every 10 messages to reset minute window
      if (i > 0 && i % 10 === 0) {
        now += 61_000;
      }
      const result = checkRateLimit(sender, account);
      expect(result.allowed).toBe(true);
    }

    // Advance past the last minute window before testing hour limit
    now += 61_000;

    // 101st message should be blocked by hour limit
    const result = checkRateLimit(sender, account);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('hour_limit_exceeded');
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test('replenishes burst after cooldown period', () => {
    const sender = '+15550004444';
    const account = 'default';

    // Exhaust burst
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(sender, account);
      expect(result.allowed).toBe(true);
    }

    let status = getRateLimitStatus(sender, account);
    expect(status.burstRemaining).toBe(0);

    // Wait cooldown period
    now += 5000;

    status = getRateLimitStatus(sender, account);
    expect(status.burstRemaining).toBe(1);

    // Should be allowed again
    const result = checkRateLimit(sender, account);
    expect(result.allowed).toBe(true);
  });

  test('cleans up entries older than one hour', () => {
    const sender = '+15550005555';
    const account = 'default';

    checkRateLimit(sender, account);
    let status = getRateLimitStatus(sender, account);
    expect(status.minuteRemaining).toBe(9);

    // Advance more than one hour
    now += 3_600_001;

    status = getRateLimitStatus(sender, account);
    expect(status.minuteRemaining).toBe(10);
    expect(status.hourRemaining).toBe(100);
    expect(status.burstRemaining).toBe(5);
  });

  test('returns fresh status for unknown senders', () => {
    const status = getRateLimitStatus('+15550006666', 'default');
    expect(status.minuteRemaining).toBe(10);
    expect(status.hourRemaining).toBe(100);
    expect(status.burstRemaining).toBe(5);
  });

  test('resets minute window after 60 seconds', () => {
    const sender = '+15550007777';
    const account = 'default';

    // Send 10 messages to exhaust minute limit
    for (let i = 0; i < 10; i++) {
      checkRateLimit(sender, account);
    }

    let result = checkRateLimit(sender, account);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('minute_limit_exceeded');

    // Advance just past one minute
    now += 60_001;

    result = checkRateLimit(sender, account);
    expect(result.allowed).toBe(true);
  });

  test('tracks different senders independently', () => {
    const senderA = '+15550008888';
    const senderB = '+15550009999';
    const account = 'default';

    // Exhaust senderA
    for (let i = 0; i < 10; i++) {
      checkRateLimit(senderA, account);
    }

    // SenderB should still have full allowance
    const result = checkRateLimit(senderB, account);
    expect(result.allowed).toBe(true);

    const statusB = getRateLimitStatus(senderB, account);
    expect(statusB.minuteRemaining).toBe(9);
  });
});
