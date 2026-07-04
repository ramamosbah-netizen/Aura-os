# ADR-0004: No module-to-module imports; cross-module behavior via events only

**Status:** Accepted

## Context
Module coupling is how ERPs rot. Bounded contexts must stay independently evolvable.

## Decision
A business module may import core and shared only. Cross-module effects happen through
catalogued domain events consumed by app-layer reactors (cross-module-subscriber), which
must be idempotent.

## Consequences
+ Deal-chain automation without coupling; modules deletable/replaceable.
- Reactor logic lives at app layer; eventual (not immediate) consistency across contexts.
