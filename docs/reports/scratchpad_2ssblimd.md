# Scratchpad - Tax & VAT Engine Page Verification

## Plan
1. Navigate to http://localhost:3000/finance/tax
2. If login page is displayed, login using admin / admin123
3. Verify page elements:
   - Tax & VAT Engine page title/header
   - Tax code creation form
   - Registered tax codes table
   - Summary cards
4. Take a screenshot
5. Report findings

## Status
- [x] Navigate to http://localhost:3000/finance/tax
- [x] Handle login (if needed) - Not applicable, app has a build error
- [x] Verify page elements - Cannot verify due to build error
- [x] Take screenshot
- [x] Report findings

## Findings
- Navigated to `http://localhost:3000/finance/tax` and encountered a Next.js Build Error.
- The error is: `Module not found: Can't resolve '../../../../../lib/api'` in `./apps/web/app/api/projects/cbs/summary/[projectId]/route.ts (2:1)`.
- It seems the file still has 5 levels of `../` instead of the required 6 levels to reach `lib/api`.
- The compilation error blocks the compilation of the application, rendering a Turbopack Build Error overlay instead of the page.
- Captured screenshot: `nextjs_build_error_1782655520752.png`

