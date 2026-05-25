import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dexterPath } from '../../utils/paths.js';
import { encryptValue, decryptValue, getEncryptionKey } from '../../utils/encryption.js';

export type SessionEntry = {
  sessionKey: string;
  createdAt: number;
  updatedAt: number;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastAgentId?: string;
};

export type SessionStore = Record<string, SessionEntry>;

export function resolveSessionStorePath(agentId: string): string {
  const base = process.env.DEXTER_SESSIONS_DIR ?? dexterPath('sessions');
  return join(base, agentId, 'sessions.json');
}

export function loadSessionStore(path: string): SessionStore {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const content = readFileSync(path, 'utf8');
    if (content.startsWith('encrypted:')) {
      if (content.length <= 10) {
        console.error('Invalid encrypted content length in session store');
        return {};
      }
      const decrypted = decryptValue(content.slice(10), getEncryptionKey());
      try {
        return JSON.parse(decrypted) as SessionStore;
      } catch (error) {
        console.error('Failed to parse decrypted session store:', error);
        return {};
      }
    }
    try {
      return JSON.parse(content) as SessionStore;
    } catch (error) {
      console.error('Failed to parse session store:', error);
      return {};
    }
  } catch (error) {
    console.error('Failed to load session store:', error);
    return {};
  }
}

export function saveSessionStore(path: string, store: SessionStore): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const encrypted = encryptValue(JSON.stringify(store), getEncryptionKey());
  writeFileSync(path, 'encrypted:' + encrypted, 'utf8');
  chmodSync(path, 0o600);
}

export function upsertSessionMeta(params: {
  storePath: string;
  sessionKey: string;
  channel: string;
  to: string;
  accountId: string;
  agentId: string;
}): SessionEntry {
  const store = loadSessionStore(params.storePath);
  const existing = store[params.sessionKey];
  const now = Date.now();
  const next: SessionEntry = {
    sessionKey: params.sessionKey,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastChannel: params.channel,
    lastTo: params.to,
    lastAccountId: params.accountId,
    lastAgentId: params.agentId,
  };
  store[params.sessionKey] = next;
  saveSessionStore(params.storePath, store);
  return next;
}

