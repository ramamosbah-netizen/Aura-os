# ADR-0016: Metadata designer sequencing - forms, then list views, dashboards, custom entities

**Status:** Accepted (2026-07-03)

## Context
Every metadata surface wants a designer; building them out of order creates rework.

## Decision
Sequence by dependency and payoff: form designer first (engine + registries exist), then
list-view schemas, dashboard widgets, menus, then custom fields and custom entities via the
Universal Create Engine.
