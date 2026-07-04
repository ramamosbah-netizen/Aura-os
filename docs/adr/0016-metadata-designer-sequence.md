---
id: adr_88c56758
number: 0016
title: Metadata designer sequencing - forms, then list views, dashboards, custom entities
status: Accepted
category: Platform
owner: Architecture
date: 2026-07-03
supersedes: []
related: []
---

# ADR-0016: Metadata designer sequencing - forms, then list views, dashboards, custom entities

**Status:** Accepted (2026-07-03)

> **Provenance:** originally back-filled as *ADR-0012* in the 2026-07-03 master-report
> documentation pass (commit `019701c`, which back-filled ADRs 0002–0014 in bulk — it was never
> independently adopted at that number). Renumbered to **0016** on 2026-07-04 so the live
> *Shared Dimensions* decision (already referenced across the codebase) could hold 0012. See
> [ADR-0012](0012-shared-dimensions.md).

## Context
Every metadata surface wants a designer; building them out of order creates rework.

## Decision
Sequence by dependency and payoff: form designer first (engine + registries exist), then
list-view schemas, dashboard widgets, menus, then custom fields and custom entities via the
Universal Create Engine.
