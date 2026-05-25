/**
 * Optional OS keychain integration for API key storage.
 * Falls back to file-based encrypted storage if keychain is unavailable.
 *
 * macOS: uses `security` CLI (built-in)
 * Linux: uses `secret-tool` (libsecret, commonly available)
 * Windows: uses `cmdkey` (built-in)
 */

import { spawn, spawnSync } from 'node:child_process';

type Platform = 'darwin' | 'linux' | 'win32' | 'unknown';

function getPlatform(): Platform {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'win32') return 'win32';
  return 'unknown';
}

function runCommand(
  command: string,
  args: string[],
  stdin?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      // Executable not found or spawn failed
      resolve({ stdout: '', stderr: '', exitCode: 1 });
      return;
    }

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });

    proc.on('error', () => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 1 });
    });

    if (stdin !== undefined) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();
  });
}

export function isKeychainAvailable(): boolean {
  const platform = getPlatform();
  if (platform === 'darwin') {
    const result = spawnSync('security', ['help'], { stdio: 'ignore' });
    return result.error === undefined;
  }
  if (platform === 'linux') {
    const result = spawnSync('secret-tool', ['--version'], { stdio: 'ignore' });
    // If the binary is missing, result.error is set; otherwise it exists
    // (even if --version is unsupported and exits non-zero).
    return result.error === undefined;
  }
  if (platform === 'win32') {
    const result = spawnSync('cmdkey', ['/list'], { stdio: 'ignore' });
    return result.error === undefined;
  }
  return false;
}

export async function saveToKeychain(
  service: string,
  account: string,
  password: string
): Promise<boolean> {
  const platform = getPlatform();
  try {
    // Validate service and account parameters to prevent command injection
    if (!/^[a-zA-Z0-9._-]+$/.test(service) || !/^[a-zA-Z0-9._@+-]+$/.test(account)) {
      throw new Error('Invalid service or account name');
    }
    if (platform === 'darwin') {
      const { exitCode } = await runCommand('security', [
        'add-generic-password',
        '-s', service,
        '-a', account,
        '-w', password,
        '-U',
      ]);
      return exitCode === 0;
    }
    if (platform === 'linux') {
      const { exitCode } = await runCommand(
        'secret-tool',
        ['store', '--label', `Dexter ${account}`, 'service', service, 'account', account],
        password
      );
      return exitCode === 0;
    }
    if (platform === 'win32') {
      const { exitCode } = await runCommand('cmdkey', [
        `/generic:${service}/${account}`,
        `/user:${account}`,
        `/pass:${password}`,
      ]);
      return exitCode === 0;
    }
  } catch {
    // Fall through to return false
  }
  return false;
}

export async function getFromKeychain(
  service: string,
  account: string
): Promise<string | null> {
  const platform = getPlatform();
  try {
    if (platform === 'darwin') {
      const { stdout, exitCode } = await runCommand('security', [
        'find-generic-password',
        '-s', service,
        '-a', account,
        '-w',
      ]);
      if (exitCode === 0) {
        return stdout;
      }
      return null;
    }
    if (platform === 'linux') {
      const { stdout, exitCode } = await runCommand('secret-tool', [
        'lookup',
        'service', service,
        'account', account,
      ]);
      if (exitCode === 0 && stdout) {
        return stdout;
      }
      return null;
    }
    if (platform === 'win32') {
      // cmdkey does not provide a reliable way to read stored passwords.
      // Return null to trigger fallback behavior.
      return null;
    }
  } catch {
    // Fall through to return null
  }
  return null;
}

export async function deleteFromKeychain(
  service: string,
  account: string
): Promise<boolean> {
  const platform = getPlatform();
  try {
    if (platform === 'darwin') {
      const { exitCode } = await runCommand('security', [
        'delete-generic-password',
        '-s', service,
        '-a', account,
      ]);
      return exitCode === 0;
    }
    if (platform === 'linux') {
      const { exitCode } = await runCommand('secret-tool', [
        'clear',
        'service', service,
        'account', account,
      ]);
      return exitCode === 0;
    }
    if (platform === 'win32') {
      const { exitCode } = await runCommand('cmdkey', [`/delete:${service}/${account}`]);
      return exitCode === 0;
    }
  } catch {
    // Fall through to return false
  }
  return false;
}
