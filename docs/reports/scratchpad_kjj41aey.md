# Checklist
- [x] Navigate to /admin/templates
- [x] Wait for templates to load (Blocked: Frontend requests `http://127.0.0.1:4000/templates` which returns 404, while NestJS templates API is at `http://127.0.0.1:4000/api/templates`. This blocks page hydration/unblocking, keeping the page permanently in "Fetching templates..." state)
- [ ] Click "Create Template"
- [ ] Fill "Standard Purchase Order Layout", select "Purchase Order", click "Create & Open"
- [ ] Click 'Heading' tool button
- [ ] Click 'Text Body' tool button
- [ ] Click 'APPROVED STAMP' button
- [ ] Interact with canvas: edit heading text or drag elements
- [ ] Click 'Save Layout' and verify success alert
- [ ] Click 'Preview PDF' to generate document layout

