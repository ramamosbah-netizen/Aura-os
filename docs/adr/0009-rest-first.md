---
id: adr_e76ab9a0
number: 0009
title: REST-first; GraphQL deferred until integrator demand
status: Accepted
category: Architecture
owner: Architecture
date: 
supersedes: []
related: []
---

# ADR-0009: REST-first; GraphQL deferred until integrator demand

**Status:** Accepted

## Context
The web app data-shaping needs are met by the BFF layer; GraphQL adds schema/runtime cost.

## Decision
Public surface is REST under /api/v1 (+ webhooks + generated SDK). GraphQL is revisited when
external integrators demonstrate need (trigger recorded in master report Vol 9).
