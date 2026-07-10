// Secret source seam (gap register Vol 23 #3). Every process secret is read through
// readSecret so a managed store can inject values without code changes: Docker/K8s
// secret mounts and vault CSI drivers surface secrets as files, and the standard
// `<NAME>_FILE` convention points at them. Plain env vars stay the dev fallback, so
// nothing changes for local runs.
//
// NO static `node:fs` import: this module reaches the browser bundle through the
// shared barrel (field-crypto → index → form plugins), and client bundlers cannot
// resolve node builtins. The `_FILE` branch is server-only by nature, so fs binds
// lazily via process.getBuiltinModule (Node ≥20.16) — invisible to bundlers.

interface FsLike {
  readFileSync(path: string, encoding: 'utf8'): string;
}

function nodeFs(): FsLike | null {
  const proc = (globalThis as { process?: { getBuiltinModule?: (m: string) => unknown } }).process;
  return proc?.getBuiltinModule ? (proc.getBuiltinModule('node:fs') as FsLike) : null;
}

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
    const fs = nodeFs();
    if (!fs) {
      throw new Error(`${name}_FILE requires a Node.js runtime (secret files are never readable in the browser)`);
    }
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new Error(`${name}_FILE points at an unreadable secret file (${filePath}): ${(err as Error).message}`);
    }
    return content.trim() || null;
  }
  return process.env[name]?.trim() || null;
}
