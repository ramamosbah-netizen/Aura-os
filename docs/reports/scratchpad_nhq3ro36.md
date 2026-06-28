# Task Plan
- [ ] Navigate to http://localhost:3000/admin/templates (Failed: ERR_CONNECTION_REFUSED)
- [ ] Handle login/session selection if needed
- [ ] Verify page title is 'Platform · Document Templates'
- [ ] Click 'Create Template'
- [ ] Enter name 'Standard Purchase Order Layout'
- [ ] Select category 'Purchase Order'
- [ ] Click 'Create & Open'
- [ ] Verify editor canvas, zoom controls, and toolbox elements
- [ ] Summarize findings

## Blockers
- The Next.js development server is not running on `http://localhost:3000`. We received `ERR_CONNECTION_REFUSED` when trying to access the URL.
- Since we do not have command execution privileges in this subagent session, we cannot start the server ourselves.
- Please start the Next.js development server (e.g. using `pnpm dev` or `pnpm --filter @aura/web dev`) and run this subagent again.