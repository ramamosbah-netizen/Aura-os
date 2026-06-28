# Task: Verify Pricing & Autonomy Engine UI

## Checklist
- [x] Open http://localhost:3000/admin/intelligence
- [x] Handle login if needed (u-admin / password) - Not needed, already logged in.
- [x] Explore '⚡ IEC Pricing Calibrator' tab
  - [x] Verify calibrations exist (e.g. CU-PIPE-15MM)
  - [x] Click '🔄 Run Calibration' and wait for completion
- [x] Explore '🧠 Autonomy Queue' tab
  - [x] Verify autonomy proposals exist
  - [x] Click '✅ Execute' or '✕ Reject' on a pending proposal
- [x] Document final findings

## Findings
1. **IEC Pricing Calibrator Tab**:
   - Items such as `CU-PIPE-15MM` (15mm Copper Pipe) with calibrated prices (AED 43.44), reality gaps (-0.71%), trust scores (80%), and source counts (2) are successfully rendered in the table.
   - Clicking `🔄 Run Calibration` successfully triggers the calibration run. The button changes to `⏳ Calibrating...` and reverts back to `🔄 Run Calibration` with the last run time updated to `0m ago` when completed.
   
2. **Autonomy Queue Tab**:
   - Properly renders the autonomy proposals (e.g., auto-approval proposal for `INV-2026-0042` with level `OPERATE`, mode `Info`, and value `$4,500`).
   - Clicking `✅ Execute` on the pending proposal successfully transitions its state from `PENDING` to `EXECUTED` (indicated in green in the UI), and hides the action buttons.


