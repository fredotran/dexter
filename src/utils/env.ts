import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { config } from 'dotenv';
import { getProviderById } from '@/providers';
import { encryptValue, decryptValue, getEncryptionKey } from './encryption.js';
import { saveToKeychain, getFromKeychain, deleteFromKeychain } from './keychain.js';
import { logger } from './logger.js';

// Load .env on module import
config({ quiet: true });

const KEYCHAIN_MARKER = 'keychain://';

export function getApiKeyNameForProvider(providerId: string): string | undefined {
  return getProviderById(providerId)?.apiKeyEnvVar;
}

export function getProviderDisplayName(providerId: string): string {
  return getProviderById(providerId)?.displayName ?? providerId;
}

export async function checkApiKeyExistsForProvider(providerId: string): Promise<boolean> {
  const apiKeyName = getApiKeyNameForProvider(providerId);
  if (!apiKeyName) return true;
  return checkApiKeyExists(apiKeyName);
}

function maybeDecryptValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('encrypted:')) {
    try {
      const encrypted = trimmed.slice('encrypted:'.length);
      return decryptValue(encrypted, getEncryptionKey());
    } catch {
      return undefined;
    }
  }
  return trimmed;
}

export async function checkApiKeyExists(apiKeyName: string): Promise<boolean> {
  const rawValue = process.env[apiKeyName];

  // Check for keychain marker in env
  if (rawValue?.trim() === KEYCHAIN_MARKER) {
    const keychainValue = await getFromKeychain('dexter', apiKeyName);
    return keychainValue !== null && keychainValue.trim().length > 0;
  }

  const value = maybeDecryptValue(rawValue);
  if (value && value.trim() && !value.trim().startsWith('your-')) {
    return true;
  }

  // Also check .env file directly
  if (existsSync('.env')) {
    const envContent = readFileSync('.env', 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key.trim() === apiKeyName) {
          const valStr = valueParts.join('=').trim();
          if (valStr === KEYCHAIN_MARKER) {
            const keychainValue = await getFromKeychain('dexter', apiKeyName);
            return keychainValue !== null && keychainValue.trim().length > 0;
          }
          const val = maybeDecryptValue(valStr);
          if (val && !val.startsWith('your-')) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function writeEnvValue(apiKeyName: string, value: string): boolean {
  try {
    let lines: string[] = [];
    let keyUpdated = false;

    if (existsSync('.env')) {
      const existingContent = readFileSync('.env', 'utf-8');
      const existingLines = existingContent.split('\n');

      for (const line of existingLines) {
        const stripped = line.trim();
        if (!stripped || stripped.startsWith('#')) {
          lines.push(line);
        } else if (stripped.includes('=')) {
          const key = stripped.split('=')[0].trim();
          if (key === apiKeyName) {
            lines.push(`${apiKeyName}=${value}`);
            keyUpdated = true;
          } else {
            lines.push(line);
          }
        } else {
          lines.push(line);
        }
      }

      if (!keyUpdated) {
        if (lines.length > 0 && lines[lines.length - 1] !== '') {
          lines.push('');
        }
        lines.push(`${apiKeyName}=${value}`);
      }
    } else {
      lines.push('# LLM API Keys');
      lines.push(`${apiKeyName}=${value}`);
    }

    writeFileSync('.env', lines.join('\n'));
    chmodSync('.env', 0o600);

    // Reload environment variables
    config({ override: true, quiet: true });

    return true;
  } catch {
    return false;
  }
}

export async function saveApiKeyToEnv(
  apiKeyName: string,
  apiKeyValue: string,
  tryKeychainFirst: boolean = true
): Promise<boolean> {
  try {
    // Try keychain first if enabled
    if (tryKeychainFirst) {
      const keychainSaved = await saveToKeychain('dexter', apiKeyName, apiKeyValue);
      if (keychainSaved) {
        // Write keychain marker to .env so we know it's stored in keychain
        return writeEnvValue(apiKeyName, KEYCHAIN_MARKER);
      }
    }

    const encryptedValue = `encrypted:${encryptValue(apiKeyValue, getEncryptionKey())}`;
    return writeEnvValue(apiKeyName, encryptedValue);
  } catch {
    return false;
  }
}

export async function saveApiKeyForProvider(providerId: string, apiKey: string): Promise<boolean> {
  const apiKeyName = getApiKeyNameForProvider(providerId);
  if (!apiKeyName) return false;
  return saveApiKeyToEnv(apiKeyName, apiKey);
}

export type SearchProviderId = 'exa' | 'perplexity' | 'tavily' | 'langsearch';

export const SEARCH_PROVIDERS: Record<SearchProviderId, { displayName: string; apiKeyEnvVar: string }> = {
  exa: { displayName: 'Exa', apiKeyEnvVar: 'EXASEARCH_API_KEY' },
  perplexity: { displayName: 'Perplexity', apiKeyEnvVar: 'PERPLEXITY_API_KEY' },
  tavily: { displayName: 'Tavily', apiKeyEnvVar: 'TAVILY_API_KEY' },
  langsearch: { displayName: 'LangSearch', apiKeyEnvVar: 'LANGSEARCH_API_KEY' },
};

export function getSearchProviderDisplayName(providerId: SearchProviderId): string {
  return SEARCH_PROVIDERS[providerId].displayName;
}

export function getApiKeyNameForSearchProvider(providerId: SearchProviderId): string {
  return SEARCH_PROVIDERS[providerId].apiKeyEnvVar;
}

export async function checkApiKeyForSearchProvider(providerId: SearchProviderId): Promise<boolean> {
  return checkApiKeyExists(SEARCH_PROVIDERS[providerId].apiKeyEnvVar);
}

export async function saveApiKeyForSearchProvider(providerId: SearchProviderId, apiKey: string): Promise<boolean> {
  return saveApiKeyToEnv(SEARCH_PROVIDERS[providerId].apiKeyEnvVar, apiKey);
}

export function removeApiKeyFromEnv(apiKeyName: string): boolean {
  try {
    // Delete from keychain (best-effort, fire-and-forget)
    deleteFromKeychain('dexter', apiKeyName).catch((err) => {
      logger.error(`Failed to delete ${apiKeyName} from keychain: ${err}`);
    });

    if (!existsSync('.env')) {
      return false;
    }

    const existingContent = readFileSync('.env', 'utf-8');
    const existingLines = existingContent.split('\n');
    const newLines: string[] = [];
    let keyRemoved = false;

    for (const line of existingLines) {
      const stripped = line.trim();
      if (stripped && !stripped.startsWith('#') && stripped.includes('=')) {
        const key = stripped.split('=')[0].trim();
        if (key === apiKeyName) {
          keyRemoved = true;
          continue;
        }
      }
      newLines.push(line);
    }

    if (keyRemoved) {
      writeFileSync('.env', newLines.join('\n'));
      chmodSync('.env', 0o600);
      config({ override: true, quiet: true });
    }

    return keyRemoved;
  } catch {
    return false;
  }
}
