# Engineering Module Verification Checklist

- [x] Open http://localhost:3000 and handle login if needed
- [x] Verify "Engineering" sidebar link and navigate to it
- [x] Verify "Shop Drawings", "RFIs", and "Technical Submittals" tabs are present
- [ ] Create a Shop Drawing and verify it appears in the list (FAILED with 404 on POST /api/engineering/drawings)
- [ ] Create an RFI and verify it appears in the list (FAILED with 404 on POST /api/engineering/rfis)
- [ ] Create a Submittal and verify it appears in the list (FAILED with 404 on POST /api/engineering/submittals)
- [x] Take screenshots and document findings (Found 404 errors on all POST endpoints)
