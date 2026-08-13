// Bearer headers for specs that talk to the API DIRECTLY rather than through the web BFF.
//
// Most specs go through the BFF, which attaches the session cookie's token for them. A couple
// (offline-sync's project fixture, commissioning's seeding) call the API on its own port, so when a
// verifier is configured they are refused unless they carry a token themselves. Global setup mints
// one and parks it in the environment; this returns it, or an empty object when auth is off so the
// call sites read the same either way.
export function apiAuthHeaders(): Record<string, string> {
  const token = process.env.E2E_API_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Headers for a SECOND actor, when one is configured. Segregation of duties cannot be exercised by
 * a single principal — the permit-to-work gate refuses self-authorisation — so a spec that wants
 * to drive the approval path seeds the request as this actor and approves as the session user.
 * Returns null when there is no second actor (auth off, or none configured).
 */
export function altApiAuthHeaders(): Record<string, string> | null {
  const token = process.env.E2E_ALT_API_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/** Is a JWT verifier configured for this run? Specs branch on it rather than assuming. */
export function authEnabled(): boolean {
  return Boolean(process.env.E2E_API_TOKEN?.trim());
}
