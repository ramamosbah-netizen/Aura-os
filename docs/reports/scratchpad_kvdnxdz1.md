# Audit Checklist

- [x] 1. http://localhost:3000/ (home/workspace) - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 2. http://localhost:3000/crm/accounts - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 3. http://localhost:3000/crm/leads - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 4. http://localhost:3000/tendering/tenders - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 5. http://localhost:3000/contracts/contracts - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 6. http://localhost:3000/projects/projects - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 7. http://localhost:3000/projects/projects (expand project row to view CBS/WBS/Delay tabs) - Fails to load (Cannot test because page fails to load due to Build Error)
- [x] 8. http://localhost:3000/procurement/purchase-requests - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 9. http://localhost:3000/procurement/purchase-orders - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 10. http://localhost:3000/inventory/grns - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 11. http://localhost:3000/finance/invoices - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 12. http://localhost:3000/finance/ledger - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 13. http://localhost:3000/finance/tax - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 14. http://localhost:3000/subcontracts/subcontracts - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')
- [x] 15. http://localhost:3000/intelligence - Fails to load (Build Error: Module not found: Can't resolve '../../../../../lib/api' in './apps/web/app/api/projects/cbs/summary/[projectId]/route.ts')

## Notes & Findings
- Page 1 (http://localhost:3000/) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page1_home_error`.
- Page 2 (http://localhost:3000/crm/accounts) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page2_crm_accounts_error`.
- Page 3 (http://localhost:3000/crm/leads) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page3_crm_leads_error`.
- Page 4 (http://localhost:3000/tendering/tenders) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page4_tenders_error`.
- Page 5 (http://localhost:3000/contracts/contracts) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page5_contracts_error`.
- Page 6 (http://localhost:3000/projects/projects) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page6_projects_error`.
- Page 7 (expand project row) cannot be evaluated because the page fails to load.
- Page 8 (http://localhost:3000/procurement/purchase-requests) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page8_purchase_requests_error`.
- Page 9 (http://localhost:3000/procurement/purchase-orders) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page9_purchase_orders_error`.
- Page 10 (http://localhost:3000/inventory/grns) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page10_grns_error`.
- Page 11 (http://localhost:3000/finance/invoices) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page11_invoices_error`.
- Page 12 (http://localhost:3000/finance/ledger) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page12_ledger_error`.
- Page 13 (http://localhost:3000/finance/tax) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page13_tax_error`.
- Page 14 (http://localhost:3000/subcontracts/subcontracts) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page14_subcontracts_error`.
- Page 15 (http://localhost:3000/intelligence) shows Next.js Build Error: `Module not found: Can't resolve '../../../../../lib/api'` in `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` (line 2). Screenshot saved as `page15_intelligence_error`.

## Global Root Cause
The Next.js application has a build compilation error. The file `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` imports from `../../../../../lib/api` which fails to resolve.
Since it's a global build error from Turbopack, it blocks the rendering of all routes on `http://localhost:3000`.
To fix this, the file needs to import from `../../../../../../lib/api` (6 levels up instead of 5) or `@/lib/api` if path aliases are configured.
Since I am a browser subagent and my file editing is restricted only to the `browser` directory where the scratchpad resides, I cannot directly edit `apps/web/app/api/projects/cbs/summary/[projectId]/route.ts` to fix the import.
The main agent or user will need to apply the fix and restart/reload the server to complete the audit.








