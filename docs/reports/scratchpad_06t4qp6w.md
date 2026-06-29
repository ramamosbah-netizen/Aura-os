# Task Checklist

- [x] 1. Open /finance/invoices and verify it loads successfully.
- [x] 2. Open /procurement/purchase-orders and create PO: 'Test Equipment PO' (Supplier: Engines LLC, Value: 12000).
- [x] 3. Issue the PO and verify status is 'issued'.
- [x] 4. Open /inventory/grns and record GRN: 'Engines Delivery GRN' against 'Test Equipment PO' (Value: 12000).
- [x] 5. Open /finance/invoices and create invoice: 'Engines LLC Invoice' against PO 'Test Equipment PO' (Value: 12000).
- [ ] 6. Approve the invoice and record payment. (Blocked: POST /api/finance/payments returned 500 Internal Server Error)

## Findings

1. **Verification of Invoices Page**: Successfully loaded `/finance/invoices` without any "API offline" errors.
2. **Purchase Order**:
   - Created "Test Equipment PO" (Supplier: Engines LLC, Value: 12000) successfully.
   - Issued the PO successfully (status became `issued`).
3. **Goods Receipt (GRN)**:
   - Recorded "Engines Delivery GRN" against "Test Equipment PO" successfully.
   - The PO status automatically updated to `received`.
4. **Invoice & Approval**:
   - Created "Engines LLC Invoice" against "Test Equipment PO".
   - The 3-way match auditor showed "PASSED ✓" for all three checks (PO commitment, GRN, and invoice value matched at $12,000.00).
   - Approved the invoice successfully (status changed to `approved`).
5. **Payment (Failure)**:
   - Clicked "Record Payment", left defaults ("Main Cash Account (Auto-Created)" and $12,000.00).
   - Clicked "Confirm Payment" -> Toast/Error message displayed: "Error posting payment".
   - Browser console shows: `Failed to load resource: the server responded with a status of 500 (Internal Server Error)` on `POST http://localhost:3000/api/finance/payments`.

