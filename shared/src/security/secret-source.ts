import { readFileSync } from 'node:fs';

// Secret source seam (gap register Vol 23 #3). Every process secret is read through
// readSecret so a managed store can inject values without code changes: Docker/K8s
// secret mounts and vault CSI drivers surface secrets as files, and the standard
// `<NAME>_FILE` convention points at them. Plain env vars stay the dev fallback, so
// nothing changes for local runs.

/**
 * Read a secret by env-var name, honoring the `<NAME>_FILE` convention.
 *
 * - `NAME_FILE` set → the secret is the trimmed content of that file. An unreadable
 *   path throws (explicit vault wiring that doesn't resolve is a config error — fail
 *   at boot, never silently run without the secret).
 * - otherwise → the trimmed env var, or null when absent/empty.
 */
export function readSecret(name: string): string | null {
  const filePath = process.env[`${name}_FILE`]?.trim();
  if (filePath) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new Error(`${name}_FILE points at an unreadable secret file (${filePath}): ${(err as Error).message}`);
    }
    return content.trim() || null;
  }
  return process.env[name]?.trim() || null;
}
