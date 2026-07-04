---
id: adr_a93a1c7a
number: 0007
title: Hand-rolled formula engine; no eval; cycles rejected at compile
status: Accepted
category: Platform
owner: Architecture
date: 
supersedes: []
related: []
---

# ADR-0007: Hand-rolled formula engine; no eval; cycles rejected at compile

**Status:** Accepted (2026-07-03, form engine M1)

## Context
Calculated fields will eventually be authored by tenant admins - untrusted input.

## Decision
Recursive-descent parser + AST evaluator (shared/src/forms/formula.ts); no eval/Function;
token/depth caps; unknown functions throw; compileFormulas topologically orders computed
fields and throws on circular dependencies.

## Consequences
+ Code injection structurally impossible; infinite recalculation impossible.
- We own ~300 lines of parser (fully unit-tested).
