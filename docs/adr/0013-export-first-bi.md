---
id: adr_4117618a
number: 0013
title: Export-first BI (no embedded BI lock-in)
status: Accepted
category: Platform
owner: Architecture
date: 
supersedes: []
related: []
---

# ADR-0013: Export-first BI (no embedded BI lock-in)

**Status:** Accepted

## Context
Executives need charts/BI; embedding a BI product adds cost and lock-in.

## Decision
Native chart primitives for in-app dashboards + scheduled OLAP exports (service exists) to
customer-chosen BI (Power BI first). Embedded BI only if the market forces it.
