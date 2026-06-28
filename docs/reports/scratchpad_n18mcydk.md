# Document Control Dashboard Verification Plan

# Document Control Dashboard Verification Plan

- [x] Open http://localhost:3000/documents/control (Failed)
- [ ] Handle login if prompted (try standard u-admin or quick login)
- [ ] Verify Document Control page has 'Transmittals Log' and 'Correspondence Log' tabs
- [ ] Verify Transmittals Log:
  - [ ] Submit a new transmittal (Code: TRA-ARC-001, Title: Architectural Layout Package)
  - [ ] Verify it appears in the list
- [ ] Verify Correspondence Log:
  - [ ] Switch to Correspondence Log tab
  - [ ] Submit a new correspondence (Code: COR-IN-001, Subject: Delay Claim Warning, Direction: Inbound)
  - [ ] Verify it appears in the list
- [ ] Confirm styling looks premium and polished

Error: The open_browser_url tool failed with the following error: failed to create new page using playwright context: target closed: could not read protocol padding: EOF