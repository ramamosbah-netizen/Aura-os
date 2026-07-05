---
id: adr_8c07c1be
number: 0010
title: RLS policies authored with tables; enforcement is the final pre-production task
status: Accepted
category: Security
owner: Architecture
date: 
supersedes: []
related: []
---

# ADR-0010: RLS policies authored with tables; enforcement is the final pre-production task

**Status:** Accepted (risk consciously carried; owner decision)

## Context
DB-enforced tenancy (FORCE RLS + least-privilege role + per-request GUC) constrains iteration
speed during the build phase; the policies themselves are cheap to author alongside tables.

## Decision
Every tenant table ships RLS-enabled with policies (migrations 0032/0049/0052), but the app
connects with a bypassing role until feature completeness; the enforcement bundle is the
designated last task before production (tracked P0, master report Vol 23 #1).

## Consequences
+ Full iteration speed now; policies never drift from schema.
- A misdeployed pre-GA instance has app-level isolation only - accepted, tracked, dated.
