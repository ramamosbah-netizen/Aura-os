# Volume 17 — Integration Platform

[← Master index](README.md)

Posture: **event-out, REST-in, file-everywhere.** The kernel integration layer (webhooks,
connectors, SDK generator, CSV) is built; named external connectors are roadmap. Each entry
below states its state and, for planned items, the concrete integration shape.

---

## 1. Core mechanisms (built)

| Mechanism | State | Detail |
|---|---|---|
| REST API | ✅ | 551 handlers (Volume 9) |
| Webhooks out | ✅ | per-event subscriptions, HMAC-signed, retry worker + dead-letter (0012) |
| Event catalog | ✅ | 71 typed events — the async contract |
| Connector registry | ✅ kernel service | named systems + config; concrete connectors pending |
| SDK generator | ✅ | typed TS clients from route metadata |
| CSV import/export | ✅ | `shared/integration/csv.ts` + list exporters |
| MCP server | ✅ | AURA as tool-provider to external AI agents (Vol 6 §11) |
| GraphQL | ❌ | deliberate deferral (Vol 9 §2) |
| OpenAPI | ❌ P2 | prerequisite for partner-grade API docs |

## 2. Named integrations (state + designed shape)

### Enterprise systems
| Target | State | Designed shape |
|---|---|---|
| **SAP** | [Planned] | export-first: journal/AP/AR extracts via OLAP path; inbound master-data CSV; later IDoc/OData connector on the connector registry |
| **Oracle (Fusion/EBS)** | [Planned] | same export-first pattern; FBDI-format extracts |
| **Power BI** | [Planned — near-term] | scheduled OLAP exports → dataset; template PBIX per module (Vol 16 §4) |
| **Microsoft 365** | [Planned] | **Graph API** is the recorded decision for CRM email; Teams webhooks for notifications; SharePoint as optional DMS backend behind the storage port |
| **Google Workspace** | [Planned] | Gmail/Drive parity of the M365 shape, lower priority (GCC market is Microsoft-first) |

### Construction domain
| Target | State | Designed shape |
|---|---|---|
| **Primavera P6** | [Planned] | XER/XML import → project schedule entities (schedule store exists); baseline sync back-off |
| **Procore-class tools** | not targeted | AURA competes rather than integrates here |
| **AutoCAD / IFC** | ◐ | **IFC/BIM viewer shipped** (`/engineering/bim`, 0111); DWG metadata ingest [Planned]; drawing register is the anchor |
| **Oracle Unifier** | not targeted | competitive (Vol 22) |

### IoT / OT
| Target | State | Designed shape |
|---|---|---|
| Fleet telematics | ◐ | **webhook ingestion live** (lat/lng/speed/odometer → positions); provider adapters [Planned] |
| **MQTT** | [Planned] | broker consumer → kernel events (`iot.*` namespace); asset/BMS telemetry |
| **BACnet / Modbus / OPC-UA** | [Planned] | edge gateway translating to MQTT — AURA stays protocol-agnostic above MQTT; FM vertical driver (Vol 1 §5) |

### Financial rails
| Target | State |
|---|---|
| WPS (UAE payroll) | ✅ SIF generation live |
| Bank statements | ◐ reconciliation module live; feed import (camt/CSV) [Planned] |
| Tax authority (FTA) e-filing | [Planned] — VAT return data exists |

## 3. Integration architecture rules

1. External systems never touch the database — API/webhooks/exports only.
2. Inbound flows create *events*, not raw writes (telemetry pattern is the template).
3. Credentials go through the connector registry backed by vaulted secrets (Vol 7 §10
   prerequisite).
4. Every connector is an adapter behind a kernel port — the DMS storage and AI provider ports
   prove the pattern.

## 4. Sequencing

Power BI export (near, cheap, exec-visible) → M365 Graph email for CRM (recorded decision) →
bank-feed import → Primavera XER import → MQTT gateway (FM vertical) → SAP/Oracle export packs
(enterprise sales enabler).

---

*Next: [Volume 18 — Dev Platform](vol-18-dev-platform.md)*
