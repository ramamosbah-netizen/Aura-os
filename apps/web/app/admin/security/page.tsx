import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import { AdminHeader, AdminCard, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import { Pill } from '@/components/admin-ui';
import ServiceAccountsClient from '@/components/service-accounts-client';

export const dynamic = 'force-dynamic';

// Admin Center depth (Vol 15 §2.2): the security posture in one page — auth mode,
// lockout policy, MFA enrolments, SSO wiring, PII crypto staging. Env-bound values
// are shown read-only by design; docs/runbooks/secrets-rotation.md says how to change
// them. Per-user MFA reset lives on Roles & Access.

interface SecurityStatus {
  auth: {
    verifier: 'jwks' | 'hs256' | 'off';
    required: boolean;
    devTokensAllowed: boolean;
    devPasswordSet: boolean;
    lockout: { maxAttempts: number; windowSec: number; lockSec: number };
  };
  mfa: Array<{ userId: string; active: boolean }>;
  sso: { jwksConfigured: boolean; groupRoleMap: Array<{ group: string; role: string }> };
  pii: { encryptionConfigured: boolean; rotationStaged: boolean };
}

export default async function SecurityAdminPage() {
  const status = await getJson<SecurityStatus>('/api/admin/platform/security');

  if (!status) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Security Posture" glyph="🛡" backToHub subtitle="Auth mode, lockout, MFA, SSO, and PII crypto in one read." />
        <AdminOffline label="Security" />
      </div>
    );
  }

  const { auth, mfa, sso, pii } = status;
  const kpis: Kpi[] = [
    { label: 'Auth', value: auth.verifier === 'off' ? 'OFF' : auth.verifier.toUpperCase(), sub: auth.required ? 'required (fail closed)' : 'staged (not enforced)', tone: auth.verifier === 'off' ? 'bad' : auth.required ? 'good' : 'warn' },
    { label: 'MFA enrolments', value: mfa.filter((m) => m.active).length, sub: `${mfa.filter((m) => !m.active).length} pending activation`, tone: 'accent' },
    { label: 'SSO', value: sso.jwksConfigured ? 'Entra' : '—', sub: sso.jwksConfigured ? `${sso.groupRoleMap.length} group mapping(s)` : 'JWKS not configured', tone: sso.jwksConfigured ? 'good' : 'info' },
    { label: 'PII crypto', value: pii.encryptionConfigured ? 'ON' : 'staged', sub: pii.rotationStaged ? 'rotation in progress' : 'AES-256-GCM at store boundary', tone: pii.encryptionConfigured ? 'good' : 'warn' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Security Posture"
        glyph="🛡"
        backToHub
        subtitle="What the platform enforces right now. Environment-bound values are read-only here — rotation and hardening steps live in the security runbooks."
        kpis={kpis}
      />

      <AdminCard title="Authentication & lockout">
        <table style={tbl}>
          <tbody>
            <Row k="Token verifier" v={auth.verifier === 'jwks' ? <>Hosted IdP (JWKS) <Pill tone="good">SSO</Pill></> : auth.verifier === 'hs256' ? <>Self-issued HS256 <Pill tone="info">dev/site</Pill></> : <Pill tone="bad">OFF — staged pass-through</Pill>} />
            <Row k="Anonymous requests" v={auth.required ? <Pill tone="good">rejected (401, public allowlist only)</Pill> : <Pill tone="warn">allowed — AUTH_REQUIRED not set</Pill>} />
            <Row k="Dev token mint" v={auth.devTokensAllowed ? <Pill tone="warn">enabled — disable in production</Pill> : <Pill tone="good">disabled</Pill>} />
            <Row k="Dev password" v={auth.devPasswordSet ? <Pill tone="good">set</Pill> : <Pill tone="warn">any password accepted (dev default)</Pill>} />
            <Row k="Brute-force lockout" v={`${auth.lockout.maxAttempts} failures in ${auth.lockout.windowSec}s → locked ${auth.lockout.lockSec}s (429)`} />
          </tbody>
        </table>
      </AdminCard>

      <AdminCard title={`MFA enrolments (${mfa.length})`}>
        {mfa.length === 0 ? (
          <p style={dim}>No TOTP enrolments yet. Users enrol via POST /auth/mfa/enroll → scan → activate; from then login requires a code.</p>
        ) : (
          <table style={tbl}>
            <tbody>
              {mfa.map((m) => (
                <tr key={m.userId}>
                  <td style={td}><code style={code}>{m.userId}</code></td>
                  <td style={td}>{m.active ? <Pill tone="good">active — gates login</Pill> : <Pill tone="warn">enrolled, awaiting first code</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ ...dim, marginTop: 8 }}>
          Device lost? Reset a user&apos;s MFA from <Link href="/admin/access">Roles &amp; Access</Link>.
        </p>
      </AdminCard>

      <AdminCard title="Single sign-on (Entra ID)">
        <table style={tbl}>
          <tbody>
            <Row k="JWKS verification" v={sso.jwksConfigured ? <Pill tone="good">configured</Pill> : <Pill tone="info">not configured — set AUTH_JWKS_URL</Pill>} />
            {sso.groupRoleMap.map((m) => (
              <Row key={m.group} k={<>group <code style={code}>{m.group}</code></>} v={<>→ role <code style={code}>{m.role}</code></>} />
            ))}
          </tbody>
        </table>
      </AdminCard>

      <AdminCard title="API keys (service accounts)">
        <p style={{ ...dim, marginBottom: 10 }}>
          Machine credentials for external integrations — an <code style={code}>aura_sk_…</code> key
          authenticates as <code style={code}>sa:&lt;id&gt;</code> and is authorized through the same
          role grants as any user. Only the key&apos;s hash is stored; revocation is immediate.
        </p>
        <ServiceAccountsClient />
      </AdminCard>

      <AdminCard title="PII field encryption">
        <table style={tbl}>
          <tbody>
            <Row k="At-rest field crypto" v={pii.encryptionConfigured ? <Pill tone="good">on — AES-256-GCM (WPS identifiers)</Pill> : <Pill tone="warn">staged — set PII_ENCRYPTION_KEY</Pill>} />
            <Row k="Key rotation" v={pii.rotationStaged ? <Pill tone="info">in progress (previous key accepted on decrypt)</Pill> : 'not in progress'} />
          </tbody>
        </table>
        <p style={{ ...dim, marginTop: 8 }}>
          Rotation procedure: <code style={code}>docs/runbooks/secrets-rotation.md</code> §3.
        </p>
      </AdminCard>
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <tr>
      <td style={{ ...td, color: 'var(--muted)', width: 220 }}>{k}</td>
      <td style={td}>{v}</td>
    </tr>
  );
}

const tbl: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const td: CSSProperties = { padding: '7px 8px', borderBottom: '1px solid var(--border)' };
const dim: CSSProperties = { fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, margin: 0 };
const code: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 4px' };
