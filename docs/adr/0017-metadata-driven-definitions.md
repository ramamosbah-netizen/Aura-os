---
id: adr_7f1e9c04
number: 0017
title: Metadata-Driven Definitions
status: Accepted
category: Architecture
owner: Architecture
date: 2026-07-05
supersedes: []
related: [0006, 0011, 0012, 0016]
---

# ADR-0017: Metadata-Driven Definitions

**Status:** Accepted

## Context

A `docType` began as a string discriminator on the `EngineeringDocument` aggregate (ADR-0011),
plus a small `DOC_TYPES` map binding each type to a label, an owning module and a form-schema id.
The form fields are already data (ADR-0006, forms-are-JSON).

As capabilities accrete around these types — workflow, permissions, events, notifications, AI
prompts, templates, required attachments — each is tempted to branch on the type literal
(`if (docType === 'risk_assessment') …`). That `switch(docType)` sprawl across N capabilities is
the ERP rot ADR-0011 exists to prevent, re-introduced through a different door: the type's
behaviour becomes hard-coded and scattered instead of composed over the aggregate.

We already avoid this by accident (the `DOC_TYPES` map, not a switch). This ADR makes it a rule
before the temptation multiplies — and, equally important, bounds how far to take it.

## Decision

**Business behaviour is configured through a Definition (metadata), not hard-coded by type.**

A **Definition** binds a type to the metadata each capability needs: its form `schema` id, its
`ownerModule`, its `workflow`, its emitted `events`, the `permissions` that gate it, its
`templates` and `aiProfile`. Capabilities read `getDefinition(type).<slice>` and stay
**type-agnostic** — no capability contains the type literal. This extends ADR-0006 from *"the form
is data"* to *"the process is data"*, over the ADR-0011 aggregate.

Rules:
1. **No branching on the type literal** in any capability. Read the definition instead.
2. **A definition is data, not behaviour.** It names ids (schema id, workflow id, event names) that
   the respective platform capability resolves. A capability reads only its own slice — the
   definition is not a god-object of logic.
3. **Definitions live in their owning module.** Engineering owns `DocumentDefinition`; the registry
   and its accessor sit in the Engineering module, not a shared package.

### Scope — Rule of Three (the boundary)

A **cross-module / platform** Definition Registry is **not** created now. Per ADR-0011's Rule of
Three, it is extracted only once **three modules independently maintain their own definition
registries** and the shared shape is proven. **Listing future consumers (Procurement, Quality,
HSE, FM) does not satisfy the rule — having them does.** Today there is exactly one consumer
(Engineering documents), so the definition is formalised **in-module**. When the second and third
modules grow their own, we extract the shared registry and revisit this ADR — not before.

## Consequences

+ A new document type (Permit to Work, ITP, NCR, WIR/MIR, commissioning checklist) is a new
  definition entry plus a form schema — **no capability code changes**.
+ Forms, workflow, events, permissions and AI all read one source of truth per type; the type
  literal exists in exactly one place (the definition), never in capabilities.
+ Extends the metadata-driven direction of ADR-0006 and ADR-0016 without a speculative platform.
- A definition can bloat toward a god-object; mitigated by rule 2 (data, not behaviour; each
  capability reads only its slice).
- Premature platform extraction is explicitly forbidden until the Rule of Three fires — the shared
  registry is deferred, on purpose.
