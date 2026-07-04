---
id: adr_402b16a0
number: 0005
title: Single AI provider seam with deterministic local fallback
status: Accepted
category: AI
owner: Architecture
date: 
supersedes: []
related: []
---

# ADR-0005: Single AI provider seam with deterministic local fallback

**Status:** Accepted

## Context
AI features must not couple the platform to one vendor, and must not break demos/tests when
no API key is present.

## Decision
One port (shared/src/ai/ai-provider.ts: complete/embed). Concrete providers live only in
core/src/ai (Claude + local fallback). Every AI feature must function - degraded - on the
local provider.

## Consequences
+ Vendor swap = one adapter; keyless environments stay fully functional.
- Local-fallback output quality is heuristic (acceptable: it is a fallback).
