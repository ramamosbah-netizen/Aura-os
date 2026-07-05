---
id: adr_570b1012
number: 0008
title: Freeze the CreateDrawer props API as an adapter over the form engine
status: Accepted
category: Platform
owner: Architecture
date: 
supersedes: []
related: [0006]
---

# ADR-0008: Freeze the CreateDrawer props API as an adapter over the form engine

**Status:** Accepted (2026-07-03, form engine M2)

## Context
20 call sites used the legacy FieldSpec drawer; the engine replaced its internals.

## Decision
components/ui/create-drawer.tsx keeps its exact public API and adapts FieldSpec[] to a
FormSchema, delegating to FormDrawer. New surfaces use registered schemas instead.

## Consequences
+ Zero-regression migration (verified live); legacy path remains the simple on-ramp.
- Two entry points until legacy call sites are gradually converted.
