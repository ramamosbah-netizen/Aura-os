import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The app's own source, walked once and read once.
 *
 * WHY THIS EXISTS
 *
 * Three fitness tests each carried their own copy of the same directory walk over `app`,
 * `components` and `lib`, and each re-read every file it found. Standalone that costs 0.4–0.6s and
 * nobody notices. Under `turbo run test` — twenty-odd packages compiling and testing at once — the
 * same walk repeatedly blew the 5s per-test budget, and it cost four verification cycles before
 * the cause was clear.
 *
 * It read as flake, which is the expensive part: `retries: 0` is deliberate here so a flaky test
 * stays a visible failure, and a failure nobody can attribute is worse than one that reproduces.
 * So this removes the cause rather than raising the budget or retrying — the tests assert exactly
 * what they asserted before, they just stop doing the same I/O three times.
 *
 * TWO CHANGES, BOTH ABOUT SYSCALLS
 *
 * `readdirSync(dir, { withFileTypes: true })` returns entries that already know whether they are
 * directories, which removes one `statSync` per file. On Windows that syscall is the dominant cost
 * of the walk, and the old code paid it for every entry in the tree.
 *
 * The results are then cached for the lifetime of the module, so a file with several tests walks
 * once instead of once per test. Vitest isolates module registries per test file, so this does not
 * leak between files — and it must not, because a fitness test that read another file's stale
 * snapshot would be asserting against source that no longer exists.
 */

export interface SourceFile {
  /** Absolute path, as the walkers produced before. */
  path: string;
  /** File contents, read once. */
  source: string;
}

/** The web app's root, resolved from this file rather than from the caller's location. */
export const WEB_ROOT = resolve(__dirname, '..');

/** The trees the fitness tests care about: the app's own code, not its config or its e2e suite. */
const ROOTS = ['app', 'components', 'lib'] as const;

/**
 * Skipped everywhere, for different reasons: `node_modules` is not ours, `.next` is generated
 * output that would make assertions pass or fail on build state, and `e2e` is Playwright's.
 */
const SKIP = new Set(['node_modules', '.next', 'e2e', '.turbo']);

/**
 * The BFF route handlers, excluded — see the function name.
 *
 * Roughly four hundred files, and no current fitness test wants them: the two route-ownership
 * gates exempt the API namespace explicitly (it keeps the legacy paths on purpose, being the
 * source of truth), and the hydration gate only judges client components, which a server-only
 * route handler can never be. Reading them was most of the cost of the scan.
 */
const API_DIR = join('app', 'api');

const isSource = (name: string): boolean => /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name);

function walk(dir: string, out: string[]): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    // withFileTypes: the entry already knows what it is, so no stat call per file.
    entries = readdirSync(dir, { withFileTypes: true }) as never;
  } catch {
    return; // A root that does not exist is not a failure; it is a tree this app does not have.
  }
  for (const entry of entries as unknown as Array<{ name: string; isDirectory(): boolean }>) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (isSource(entry.name)) out.push(full);
  }
}

let cache: SourceFile[] | null = null;

/**
 * The app's UI source — `app`, `components` and `lib` — with contents, EXCLUDING `app/api`.
 *
 * Named `uiSourceFiles` rather than `appSourceFiles` so the exclusion is impossible to miss at the
 * call site. A future gate that genuinely needs to read the BFF handlers must say so and add its
 * own accessor; it must not discover by surprise that four hundred files were never scanned.
 *
 * Callers filter this rather than walking again. Returned readonly so one test cannot mutate the
 * snapshot another test in the same file then reads.
 */
export function uiSourceFiles(): readonly SourceFile[] {
  if (cache) return cache;
  const paths: string[] = [];
  const apiPrefix = join(WEB_ROOT, API_DIR);
  for (const root of ROOTS) walk(join(WEB_ROOT, root), paths);
  cache = paths
    .filter((path) => !path.startsWith(apiPrefix))
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }));
  return cache;
}

/** Just the paths, for callers that only need to know what exists. */
export function uiSourcePaths(): readonly string[] {
  return uiSourceFiles().map((f) => f.path);
}
