# Volume 24 — Future Vision

[← Master index](README.md)

Beyond the three-version roadmap (Volume 20): where the architecture is *designed to go*.
Discipline of this volume: every vision item names the existing seam it would build on —
vision without a substrate is excluded.

---

## 1. AI Agents

**Substrate already live:** MCP server (AURA as tool provider) + autonomy proposal loop
(generate → human execute/reject) + guardrails + event stream.

**Trajectory:** (1) today — external agents call AURA tools via MCP; internal features
propose. (2) Supervised agents: named agents (Procurement Agent, Credit-Control Agent) run
multi-step plans whose *writes are proposals*, batch-approved from the universal inbox.
(3) Scoped autonomy: per-tenant policies graduate specific low-risk action classes
(send reminder, draft PO from reorder) to auto-execute with audit + undo. The kill-switch,
budget caps, and action allow-lists are guardrail-service extensions, not new architecture.

## 2. Digital Twin

**Substrate:** the event stream *is* a temporal record of the business; projections/snapshots
replay state at any time; `digital_*` projection tables already exist (0019-era intelligence
work). **Trajectory:** entity-timeline views (any record scrubbed through time) → org-level
twin (portfolio state replay for what-if: "re-run June with the new approval matrix") →
physical twin for FM once IoT lands (§7): building systems mirrored onto asset records with
live telemetry.

## 3. Predictive ERP

**Substrate:** cash-flow forecasts, EVM, pipeline projection, process mining, consumption
history. **Trajectory:** nightly model runs (provider seam handles both statistical and LLM
approaches) producing: cash runway forecasts, project overrun probability (CPI/SPI trends +
delay logs), stockout predictions (consumption vs lead time), payment-delay risk per customer
(AR history). All land as insights + risk chips — the same surfaces AI wave 2 builds.

## 4. Autonomous Workflow

**Substrate:** workflow engine + saga compensation + approval matrix + idempotent reactors.
**Trajectory:** workflows that *adapt* — SLA-aware re-routing (approver on leave ⇒ delegate),
load-balanced assignment, and AI-chosen next steps within designer-defined bounds. Compensation
(sagas) is the safety property that makes autonomous progression tolerable.

## 5. Voice ERP

**Substrate:** AI dock + context engine + (future) speech provider behind the AI seam.
**Trajectory:** field-first voice capture — site diary dictation ("today we poured B2 slab,
42 workers, 3-hour crane delay") → structured daily report via the same extraction pipeline
as AI auto-fill; approvals by voice in the mobile app. Arabic + English from day one (GCC
requirement).

## 6. AR / VR

**Substrate:** the IFC/BIM viewer (`/engineering/bim`) — models are already in the platform.
**Trajectory (deliberately conservative):** AR overlay of model + open NCRs/snags on-site via
mobile camera (anchored to the BIM model) → inspection walkthroughs recording findings against
model coordinates. VR walkthroughs for handover documentation. Sequenced after the mobile app
exists; not before.

## 7. IoT

**Substrate:** fleet telemetry webhook ingestion (live), assets + AMC/PPM modules, event
catalog. **Trajectory:** MQTT gateway (Volume 17) → `iot.*` events → rules ("chiller vibration
threshold ⇒ AMC ticket + PPM advance") → condition-based maintenance replacing calendar-based
PPM → energy/BMS analytics for the FM vertical (BACnet/Modbus via edge gateway). This is the
FM-industry moat item (Volume 1 §5).

## 8. Robotics

Honest position: **no near-term substrate**; adjacent reality is drones/scanners on sites.
The integration shape when it matters: capture devices are event sources (progress scans →
site progress records; drone photogrammetry → BIM comparison → auto progress %). Enters the
roadmap only behind IoT + mobile + vision AI, in that order.

---

## Sequencing sanity (what unlocks what)

```
mobile app ──► voice capture ──► AR overlays
IoT/MQTT ──► condition-based maintenance ──► FM digital twin
AI wave 2 (risk/RAG) ──► predictive ERP ──► supervised agents ──► scoped autonomy
event stream (done) ──► timeline twin (cheap, near-term differentiator)
```

The near-term sleeper: **entity timeline views** — almost free given the event store, and no
mid-market competitor shows "this record, through time" natively.

---

*Next: [Volume 25 — Appendices](vol-25-appendices.md)*
