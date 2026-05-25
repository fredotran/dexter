import { describe, test, expect } from 'bun:test';
import {
  isKeychainAvailable,
  saveToKeychain,
  getFromKeychain,
  deleteFromKeychain,
} from './keychain.js';

describe('isKeychainAvailable', () => {
  test('returns a boolean', () => {
    expect(typeof isKeychainAvailable()).toBe('boolean');
  });
});

describe('save / get / delete round-trip', () => {
  test('works if keychain is available', async () => {
    if (!isKeychainAvailable()) {
      return;
    }

    const account = `dexter-test-${Date.now()}`;
    const password = 'test-password-12345';

    // Save
    const saved = await saveToKeychain('dexter', account, password);
    expect(saved).toBe(true);

    // Get (returns null on Windows by design)
    const retrieved = await getFromKeychain('dexter', account);
    if (process.platform === 'win32') {
      expect(retrieved).toBeNull();
    } else {
      expect(retrieved).toBe(password);
    }

    // Delete
    const deleted = await deleteFromKeychain('dexter', account);
    expect(deleted).toBe(true);

    // After delete, get should return null on all platforms
    const afterDelete = await getFromKeychain('dexter', account);
    expect(afterDelete).toBeNull();
  });

  test('get returns null for missing entries', async () => {
    if (!isKeychainAvailable()) {
      return;
    }

    const retrieved = await getFromKeychain('dexter', `nonexistent-${Date.now()}`);
    expect(retrieved).toBeNull();
  });
});

describe('fallback behavior', () => {
  test('returns false / null when keychain is unavailable', async () => {
    if (isKeychainAvailable()) {
      return;
    }

    const saved = await saveToKeychain('dexter', 'test-account', 'test-password');
    expect(saved).toBe(false);

    const retrieved = await getFromKeychain('dexter', 'test-account');
    expect(retrieved).toBeNull();

    const deleted = await deleteFromKeychain('dexter', 'test-account');
    expect(deleted).toBe(false);
  });
});
