# Scratchpad - Browser Verification Task

## Plan
1. Navigate to `http://localhost:3000/projects/projects`.
2. Check for login, authenticate with `admin` / `admin123` if prompted.
3. Open a project detail view.
4. Verify the three tabs:
   - "WBS & Earned Value (EVM)"
   - "Cost Breakdown Structure (CBS)"
   - "Delay & EOT claims"
5. Navigate to `http://localhost:3000/finance/tax`.
6. Document findings and take screenshots.

## Progress
- [/] Navigate to Projects list (Encounters Next.js Build Error: Module not found: Can't resolve '../../../../../lib/api' in `./apps/web/app/api/projects/cbs/summary/[projectId]/route.ts`)
- [ ] Handle login (if needed)
- [ ] Open a project detail view
- [ ] Verify WBS & EVM tab
- [ ] Verify CBS tab
- [ ] Verify Delay & EOT claims tab
- [ ] Navigate to Finance Tax page (also blocked by build error)
- [ ] Report final findings

## Findings
- Next.js Turbopack shows build error:
  `Module not found: Can't resolve '../../../../../lib/api'` in `./apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` at line 2.
  This needs to be fixed to proceed with verification.
