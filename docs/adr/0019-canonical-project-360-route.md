---
id: adr_489f0b15
number: 0019
title: Canonical Project 360 route and ownership
status: Accepted
category: 
owner: Architecture
date: 2026-08-16
supersedes: []
related: []
---

# ADR-0019: Canonical Project 360 route and ownership

**Status:** Accepted  
**Date:** 2026-08-16  
**Deciders:** AURA OS product and engineering ownership

## Context

AURA exposed two independently rendered project-detail experiences: `/project/[projectId]` for delivery context and `/projects/projects/[id]` for commercial/project controls. Both represented the same Project aggregate, produced competing entry points, and allowed links, breadcrumbs, search, and future AI context to disagree about the canonical record.

The domain ownership must not change. Engineering owns drawings and submittals; Site owns execution; Quality owns inspections and NCRs; HSE owns safe-work controls; Commissioning owns testing; Contracts and Finance own their commercial records. Project 360 composes links and status—it does not copy those state machines.

## Decision

`/project/[projectId]` is the canonical Project 360 namespace.

- `/project/[projectId]` is the delivery command center.
- `/project/[projectId]/controls` is the project/commercial control view.
- Delivery-area and team routes remain children of the same project namespace.
- `/projects/projects/[id]` remains temporarily as a compatibility redirect to the canonical controls view and preserves query parameters.
- Internal record links target the canonical namespace immediately.
- The old route is not removed until redirect coverage and deprecation telemetry are accepted.

## Options considered

### Keep two owning pages

Low migration cost, but keeps duplicate ownership and ambiguous search, breadcrumb, permission, browser-tab, and AI context. Rejected.

### Make `/projects/projects/[id]` canonical

Preserves the older CRUD hierarchy, but makes delivery areas and Project Context secondary. Rejected because the product architecture is project-delivery-first.

### Canonical `/project/[projectId]` namespace

Keeps one Project Context, supports focused child views, and leaves business state in authoritative modules. Accepted.

## Consequences

- One route family owns Project identity, system lens, navigation, and future AI context.
- Existing bookmarks continue to work through a tested redirect.
- Links must be migrated and lint/browser tests must prevent the legacy detail path from returning as an owner.
- Production Auth/RLS and dependency advisories remain separate release gates.

## Enforcement

- `apps/web/project-route-ownership.fitness.test.ts` runs in the standard web unit/CI test command and rejects new internal legacy detail links.
- The same fitness function proves the compatibility route remains redirect-only and the canonical controls owner exists.
- Browser coverage exercises direct navigation, refresh, canonical deep links, query-preserving compatibility redirects, anonymous 401 handling, authenticated 403 handling, Project Context propagation, keyboard interaction, and desktop/mobile layouts.
- The compatibility route remains in place; removal requires a separate approved decision backed by telemetry.
