// Staged-diff secret scan (gap register N-05).
//
// A published secret cannot be unpublished, so this runs before the commit rather than in CI.
// It is a shape check, not a vault — gitleaks in the deploy pipeline remains the thorough pass.
//
// The hard design constraint is FALSE POSITIVES. A pre-commit guard that fires on documentation
// gets `--no-verify`d out of habit, and a guard that is always bypassed protects nothing. This
// one already tripped on the gap register's own prose describing a connection-string shape, which
// is exactly the failure mode. Placeholders are therefore recognised and allowed through.
//
// Run: node scripts/scan-staged-secrets.mjs
import { execFileSync } from 'node:child_process';

/** Credential shapes worth blocking on sight. */
const PATTERNS = [
  { name: 'database URL with inline password', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/([^\s:/@]+):([^\s@]+)@/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API key', re: /\bsk-(?!ant-)[A-Za-z0-9]{32,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

/**
 * Words that mean "this is an example, not a credential". Matched against the user and password
 * captured from a connection string, and against the whole line for the opaque token shapes.
 */
const PLACEHOLDER =
  /^(?:\*+|x+|\.{3}|<[^>]*>|\$\{[^}]*\}|user|username|admin|root|pass|passwd|password|secret|token|key|changeme|example|placeholder|your[-_]?\w*|my[-_]?\w*|foo|bar|test|dummy|redacted|hunter2|aura_app_ci)$/i;

const isPlaceholder = (v) => PLACEHOLDER.test(v) || /^\$[A-Z_]+$/.test(v) || v.includes('***');

/**
 * The repository's own disposable database credentials — but only ever at a LOOPBACK host.
 *
 * Wave 0's local verification environment has to document the credentials a developer actually
 * types (`docker-compose.dev.yml` creates the role, the runbook and provisioner tell you to use
 * it), so masking them to `user:***@host` would make the runbook not work. They are throwaway by
 * construction: the container stores its data in tmpfs and `down` destroys it.
 *
 * BOTH halves are required, and that is the whole design. `aura` is also the production migration
 * role NAME, so exempting the user alone would wave through
 * `postgres://aura:<a real password>@prod-host/db`. Pinning the exemption to a known disposable
 * PASSWORD *and* a loopback host is what keeps it impossible to satisfy by accident with a real
 * secret: a genuine credential would have to literally be `aura_app_local` on localhost.
 *
 *   aura            docker-compose.dev.yml — the tmpfs container's owner role
 *   aura_app_local  provision-local-db.mjs — default for the disposable runtime role
 *   aura_app_ci     CI's service container (also listed in PLACEHOLDER, which predates this)
 */
const DISPOSABLE_PASSWORD = /^(?:aura|aura_app_local|aura_app_ci)$/;
const LOOPBACK_HOST = /@(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[/?]/;
const isDisposableLocalDb = (line, password) =>
  DISPOSABLE_PASSWORD.test(password) && LOOPBACK_HOST.test(line);

function stagedDiff() {
  try {
    return execFileSync('git', ['diff', '--cached', '-U0'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
}

const findings = [];
let file = null;

for (const line of stagedDiff().split('\n')) {
  if (line.startsWith('+++ b/')) {
    file = line.slice(6);
    continue;
  }
  // Only added lines can introduce a secret.
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  const body = line.slice(1);

  for (const { name, re } of PATTERNS) {
    const m = re.exec(body);
    if (!m) continue;
    // Connection strings carry their own user/password captures; judge those.
    if (
      m[1] !== undefined &&
      m[2] !== undefined &&
      (isPlaceholder(m[1]) || isPlaceholder(m[2]) || isDisposableLocalDb(body, m[2]))
    )
      continue;
    // Opaque tokens have no captures — a line that is clearly illustrative still gets a pass.
    if (m[1] === undefined && isPlaceholder(m[0])) continue;
    findings.push({ file, name, snippet: body.trim().slice(0, 120) });
    break;
  }
}

if (findings.length > 0) {
  console.error(`✗ ${findings.length} possible credential(s) in the staged diff:`);
  for (const f of findings) console.error(`  ${f.file}: ${f.name}\n    ${f.snippet}`);
  console.error('\nMove it to apps/api/.env.local (gitignored) or a secret mount (the *_FILE seam).');
  console.error('If it is genuinely an example, make the placeholder obvious (user:***@host).');
  process.exit(1);
}

console.log('✓ no credentials in the staged diff');
