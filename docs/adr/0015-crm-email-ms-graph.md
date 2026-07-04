---
id: adr_d76c06bf
number: 0015
title: CRM email integration via Microsoft Graph
status: Accepted
category: Domain
owner: Architecture
date: 2026-07-01
supersedes: []
related: []
---

# ADR-0015: CRM email integration via Microsoft Graph

**Status:** Accepted (2026-07-01)

> **Provenance:** originally back-filled as *ADR-0011* in the 2026-07-03 master-report
> documentation pass (commit `019701c`, which back-filled ADRs 0002–0014 in bulk — it was never
> independently adopted at that number). Renumbered to **0015** on 2026-07-04 so the live
> *Aggregate Contract* decision (already referenced across the codebase) could hold 0011. See
> [ADR-0011](0011-aggregate-contract-platform-composition.md).

## Context
GCC mid-market runs on Microsoft 365; CRM email sync is a V2 roadmap item.

## Decision
Microsoft Graph API is the integration path for CRM email (send/receive/thread linking);
Google Workspace parity later, lower priority.
