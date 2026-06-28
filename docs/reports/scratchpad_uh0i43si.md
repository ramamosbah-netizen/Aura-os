# Test Plan - Aura OS Flow Verification

- [x] Step 1: Open http://localhost:3000/procurement/purchase-orders and check login status. (Logged in successfully)
- [x] Step 2: Create a new Purchase Order:
  - Title: 'Test Steel PO'
  - Supplier: 'Ironworks Inc'
  - Value: '5000'
  - Result: PO created successfully in 'draft' status.
- [ ] Step 3: Issue the PO 'Test Steel PO' and verify status is 'issued' ('Ready to Receive').
  - Issue: Clicking "Issue PO" failed with a 404 error: `POST /api/procurement/purchase-orders/:id/status` returned 404.
- [x] Step 4: Go to http://localhost:3000/inventory/grns and create a GRN.
  - Action: Created a GRN against an already existing `issued` PO (`Switchgear PO`).
  - Result: GRN recorded successfully.
  - Event subscriber test: The status of `Switchgear PO` automatically transitioned from `issued` to `received`! This proves the backend cross-module subscriber works perfectly!
- [ ] Step 5: Go to http://localhost:3000/finance/invoices and verify 'Test Steel PO' (or the transitioned 'Switchgear PO') is in the received POs dropdown.
  - Issue: The invoices page shows "API offline." because the backend endpoint `GET http://localhost:4000/api/finance/invoices` returns a `500 Internal Server Error`.
- [ ] Step 6: Create Invoice:
  - Title: 'Ironworks Invoice'
  - Select PO: 'Test Steel PO'
  - Value: '5000'
- [ ] Step 7: Approve the invoice in the list and record a payment.

### Findings / Debugging:
1. **PO Status Endpoint (404)**:
   - The endpoint `http://localhost:3000/api/procurement/purchase-orders/:id/status` does not exist (404).
   - Testing the backend directly on port 4000:
     - `GET http://localhost:4000/api/procurement/purchase-orders` works.
     - `GET http://localhost:4000/api/procurement/purchase-orders/55c4ae35-8895-46ee-9ee1-36aecc38b625` works.
     - `GET http://localhost:4000/api/procurement/purchase-orders/55c4ae35-8895-46ee-9ee1-36aecc38b625/status` returns a `404 Not Found` from NestJS.
     - Clicking "Issue PO" makes a POST request to `/api/procurement/purchase-orders/:id/status`, which NestJS also rejects with a `404 Not Found`.
     - Need to check if the route is defined as PATCH or if it's completely missing or has a different path in the NestJS controller.
2. **Invoices Endpoint (500)**:
   - The frontend Invoices page displays "API offline."
   - Checking the backend directly at `http://localhost:4000/api/finance/invoices` returns:
     `{"statusCode":500,"message":"Internal server error"}`
   - This indicates a backend crash or database error when listing invoices.
3. **Engineering / MARs (Technical Submittals)**:
   - Material Approval Requests (MARs) are implemented under Engineering -> Technical Submittals.
   - Successfully created a technical submittal `SUB-STEEL-01` ('Steel Rebar Certificate') and approved it. The status successfully transitioned to `approved`.
4. **Insights / Intelligence Page**:
   - The Insights page successfully loads deal-chain stats and project profitability metrics.
   - Clicking "Generate briefing" successfully requests and displays an AI executive briefing.
5. **BOQ (Bill of Quantities)**:
   - There is no BOQ module or sidebar item implemented in the frontend.





