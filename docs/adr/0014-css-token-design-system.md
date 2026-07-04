---
id: adr_39cb7ebe
number: 0014
title: Design system on CSS custom properties; no UI framework dependency
status: Accepted
category: UI
owner: Architecture
date: 
supersedes: []
related: []
---

# ADR-0014: Design system on CSS custom properties; no UI framework dependency

**Status:** Accepted

## Context
Tailwind/MUI/shadcn bring velocity but also churn, bundle weight, and migration cliffs.

## Decision
One token layer (globals.css custom properties) + a small class vocabulary (.btn/.input/
.drawer/.fe-*); components consume tokens only; themes are token swaps.

## Consequences
+ Zero framework migrations; tiny CSS; strict visual consistency.
- No component-library shortcuts; new primitives are hand-built (accepted).
