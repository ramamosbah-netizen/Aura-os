# ADR-0006: Form schemas are pure JSON; behavior referenced by registry id

**Status:** Accepted (2026-07-03, form engine M1)

## Context
Metadata-driven forms must be storable in a database (no-code designer), evaluable
server-side, and portable to future shells.

## Decision
FormSchema contains no functions. Custom behavior (validators, formula functions, field
renderers, toolbar actions) is registered against string ids and resolved at run time.

## Consequences
+ Schemas round-trip through JSON; server and client evaluate identically.
- Plugins must be registered in every runtime that renders the schema.
