// Refuse to typecheck an app against workspace packages whose `dist` is older than their `src`.
//
// Every workspace package publishes `types: dist/index.d.ts`, so an app's typecheck reads the
// package's LAST BUILD, not its current source. `turbo.json` already handles this — `typecheck`
// declares `dependsOn: ["^build"]`, so `pnpm typecheck` rebuilds dependencies first and is honest.
//
// The trap is the per-package command, which looks equally official and skips turbo entirely:
//
//     pnpm --filter @aura/api exec tsc --noEmit -p tsconfig.json
//
// Demonstrated rather than assumed. Deleting `system` from the `Ncr` interface in
// modules/quality/src and running the two commands:
//
//     pnpm --filter @aura/api exec tsc --noEmit   → exit 0, silent
//     pnpm typecheck                              → 7 errors, immediately
//
// The silent direction is the dangerous one. A spurious error is loud and gets investigated; a
// spurious PASS is believed. Removing or renaming something in a module's source and being told
// the API still compiles is exactly the answer nobody double-checks.
//
// So this runs before an app's own `tsc` and refuses when the artifact it is about to trust is
// older than the source that artifact claims to describe. It is a timestamp comparison, not a
// build: no network, no database, milliseconds.
//
// NOT wired into pre-commit, deliberately. `dist/` is gitignored, so a stale build is local state
// a commit cannot carry, and the hook says plainly that anything needing a build belongs in CI.
// The lie happens at typecheck time, so the guard belongs at typecheck time.
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The caller's own package: only ITS dependencies can make ITS answer wrong.
//
// Checking every workspace package instead looked equivalent and was not. turbo runs independent
// tasks in parallel, so `@aura/web:typecheck` overlapped `@aura/quality:build` — a package web does
// not depend on, mid-rebuild, with src momentarily newer than dist. The guard failed a typecheck
// whose answer could not have been affected. A guard that fires on something the caller does not
// consume is noise, and noise is what gets a guard disabled.
const CALLER = process.cwd();

/**
 * Newest mtime under a directory, or 0 when it does not exist.
 *
 * `onlySource` restricts the scan to compilable files. A touched README or fixture under `src`
 * does not change what `tsc` emits, so counting it would fire the guard for a difference that
 * cannot affect the answer — and a guard that cries wolf gets bypassed, which costs more than the
 * lie it was written to catch.
 */
const COMPILABLE = /\.(ts|tsx|mts|cts)$/;
function newest(dir, onlySource = false) {
  let latest = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (!onlySource || COMPILABLE.test(entry.name)) latest = Math.max(latest, statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return latest;
}

function workspacePackages() {
  const out = [];
  for (const group of ['modules', 'packages', 'shared']) {
    const base = join(ROOT, group);
    if (!existsSync(base)) continue;
    // `shared` is itself a package; the other two are directories of packages.
    const candidates = existsSync(join(base, 'package.json'))
      ? [base]
      : readdirSync(base).map((name) => join(base, name));
    for (const dir of candidates) {
      const manifest = join(dir, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      // Only packages that expose a BUILT entry point can go stale this way.
      if (!String(pkg.types ?? pkg.main ?? '').startsWith('dist')) continue;
      out.push({ name: pkg.name, dir });
    }
  }
  return out;
}

/** The workspace packages the caller depends on, transitively — types flow through them all. */
function dependencyClosure(all) {
  const byName = new Map(all.map((p) => [p.name, p]));
  const manifestAt = (dir) => {
    try {
      return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
      return null;
    }
  };
  const seen = new Set();
  const queue = [CALLER];
  while (queue.length) {
    const pkg = manifestAt(queue.pop());
    if (!pkg) continue;
    for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (!String(range).startsWith('workspace:') || seen.has(name)) continue;
      seen.add(name);
      const dep = byName.get(name);
      if (dep) queue.push(dep.dir);
    }
  }
  return all.filter((p) => seen.has(p.name));
}

const stale = [];
const unbuilt = [];
for (const pkg of dependencyClosure(workspacePackages())) {
  const src = newest(join(pkg.dir, 'src'), true);
  const dist = newest(join(pkg.dir, 'dist'));
  if (!src) continue;
  if (!dist) unbuilt.push(pkg.name);
  else if (src > dist) stale.push({ name: pkg.name, behindMs: src - dist });
}

if (stale.length === 0 && unbuilt.length === 0) process.exit(0);

const ago = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
};
console.error('\n✗ typecheck would read stale build output, and would answer accordingly.\n');
for (const p of unbuilt) console.error(`    ${p.padEnd(28)} never built`);
for (const p of stale) console.error(`    ${p.name.padEnd(28)} src is ${ago(p.behindMs)} newer than dist`);
console.error(
  '\n  These packages resolve through `types: dist/index.d.ts`, so a typecheck against them\n' +
    '  describes their last build rather than their current source. A field deleted in src still\n' +
    '  type-checks as present — the failure that gets believed, because it is a PASS.\n\n' +
    '  Run `pnpm typecheck` from the repo root instead: turbo declares dependsOn ["^build"], so it\n' +
    '  rebuilds these first. Or build them once with `pnpm build`.\n',
);
process.exit(1);
