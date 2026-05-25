/**
 * Message-level rate limiter for gateway inbound messages.
 * Prevents spam and abuse by limiting messages per sender.
 */

const MAX_MESSAGES_PER_MINUTE = 10;
const MAX_MESSAGES_PER_HOUR = 100;
const BURST_SIZE = 5;
const COOLDOWN_MS = 5000;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type RateLimitEntry = {
  minuteCount: number;
  hourCount: number;
  lastMessage: number;
  burstRemaining: number;
  minuteWindowStart: number;
  hourWindowStart: number;
};

const store = new Map<string, RateLimitEntry>();

function getCompositeKey(accountId: string, senderId: string): string {
  return `${accountId}:${senderId}`;
}

function cleanupOldEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.lastMessage > HOUR_MS) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(
  senderId: string,
  accountId: string,
): { allowed: boolean; reason?: string; retryAfter?: number } {
  cleanupOldEntries();

  const key = getCompositeKey(accountId, senderId);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    const newEntry: RateLimitEntry = {
      minuteCount: 1,
      hourCount: 1,
      lastMessage: now,
      burstRemaining: BURST_SIZE - 1,
      minuteWindowStart: now,
      hourWindowStart: now,
    };
    store.set(key, newEntry);
    return { allowed: true };
  }

  // Reset fixed windows when they expire
  if (now - entry.minuteWindowStart >= MINUTE_MS) {
    entry.minuteCount = 0;
    entry.minuteWindowStart = now;
  }
  if (now - entry.hourWindowStart >= HOUR_MS) {
    entry.hourCount = 0;
    entry.hourWindowStart = now;
  }

  // Replenish burst bucket based on time since last message
  const elapsed = now - entry.lastMessage;
  const replenished = Math.floor(elapsed / COOLDOWN_MS);
  entry.burstRemaining = Math.min(BURST_SIZE, entry.burstRemaining + replenished);

  // Check minute limit
  if (entry.minuteCount >= MAX_MESSAGES_PER_MINUTE) {
    const retryAfter = MINUTE_MS - (now - entry.minuteWindowStart);
    return {
      allowed: false,
      reason: 'minute_limit_exceeded',
      retryAfter: Math.max(0, retryAfter),
    };
  }

  // Check hour limit
  if (entry.hourCount >= MAX_MESSAGES_PER_HOUR) {
    const retryAfter = HOUR_MS - (now - entry.hourWindowStart);
    return {
      allowed: false,
      reason: 'hour_limit_exceeded',
      retryAfter: Math.max(0, retryAfter),
    };
  }

  // Increment counters
  entry.minuteCount += 1;
  entry.hourCount += 1;
  entry.lastMessage = now;

  // Consume a burst token if available
  if (entry.burstRemaining > 0) {
    entry.burstRemaining -= 1;
  }

  return { allowed: true };
}

export function getRateLimitStatus(
  senderId: string,
  accountId: string,
): { minuteRemaining: number; hourRemaining: number; burstRemaining: number } {
  cleanupOldEntries();

  const key = getCompositeKey(accountId, senderId);
  const entry = store.get(key);
  if (!entry) {
    return {
      minuteRemaining: MAX_MESSAGES_PER_MINUTE,
      hourRemaining: MAX_MESSAGES_PER_HOUR,
      burstRemaining: BURST_SIZE,
    };
  }

  const now = Date.now();

  // Replenish burst for status calculation
  const elapsed = now - entry.lastMessage;
  const replenished = Math.floor(elapsed / COOLDOWN_MS);
  const burstRemaining = Math.min(BURST_SIZE, entry.burstRemaining + replenished);

  // Adjust counts for current window
  let minuteCount = entry.minuteCount;
  let hourCount = entry.hourCount;

  if (now - entry.minuteWindowStart >= MINUTE_MS) {
    minuteCount = 0;
  }
  if (now - entry.hourWindowStart >= HOUR_MS) {
    hourCount = 0;
  }

  return {
    minuteRemaining: Math.max(0, MAX_MESSAGES_PER_MINUTE - minuteCount),
    hourRemaining: Math.max(0, MAX_MESSAGES_PER_HOUR - hourCount),
    burstRemaining,
  };
}
