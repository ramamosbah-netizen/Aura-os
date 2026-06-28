# Tasks
- [x] Verify invoices page loads successfully (http://localhost:3000/finance/invoices) (Failed: Page loads but displays "API offline")
- [ ] Go to procurement/purchase-orders (http://localhost:3000/procurement/purchase-orders)
- [ ] Create PO: 'Test Equipment PO', 'Engines LLC', '12000'
- [ ] Find 'Test Equipment PO' and click 'Issue PO', verify it updates to 'issued'
- [ ] Go to inventory/grns (http://localhost:3000/inventory/grns)
- [ ] Create GRN: 'Engines Delivery GRN' against 'Test Equipment PO', '12000'
- [ ] Go to finance/invoices (http://localhost:3000/finance/invoices)
- [ ] Create Invoice: 'Engines LLC Invoice' against PO 'Test Equipment PO', '12000'
- [ ] Click 'Approve' on 'Engines LLC Invoice'
- [ ] Click 'Record Payment' on 'Engines LLC Invoice'
- [ ] Report status of all steps

## Findings
- Navigated to `http://localhost:3000/finance/invoices` and `http://localhost:3000/procurement/purchase-orders`. Both pages show "API offline.".
- Tried to access the backend API directly at `http://localhost:4000/api/finance/invoices` but got `ERR_CONNECTION_REFUSED`.
- The backend server on port 4000 appears to be offline/stopped.

