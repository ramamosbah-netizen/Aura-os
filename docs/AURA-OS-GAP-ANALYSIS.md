# AURA OS — Architectural Gap Analysis (V7.0)

> **Status:** Review Document  
> **Prepared For:** AURA Core Architecture Team  
> **Prepared By:** Antigravity (Google DeepMind Team)  
> **Date:** June 28, 2026

---

## 1. Executive Summary

While the **V7.0 Blueprint & Reference Architecture** provides a comprehensive foundation for a Tier-1 Enterprise Operating System, a deep architectural review reveals **six critical operational gaps** that must be resolved to guarantee security, financial auditability, and data integrity at enterprise scale.

---

## 2. Identified Architectural Gaps & Recommendations

### Gap 1: Dynamic Hierarchical Row-Level Security (RLS)
* **Context:** The blueprint defines hierarchical multi-tenancy (`Tenant ──► Company ──► Branch ──► Department ──► Project`).
* **The Gap:** We lack a specific implementation strategy for mapping this hierarchy to PostgreSQL Row-Level Security (RLS) policies dynamically. Without this, nested access control logic must be written in every SQL query, risking data leakage.
* **Recommendation:**
  Implement a dynamic, SUPABASE-compatible session context handler in Postgres using `request.jwt.claims`.
  ```sql
  -- Set tenant context on connection
  CREATE OR REPLACE FUNCTION auth.get_active_project_ids() RETURNS uuid[] AS $$
    SELECT array_agg(project_id) FROM public.user_project_assignments
    WHERE user_id = auth.uid() AND status = 'active';
  $$ LANGUAGE sql SECURITY DEFINER;

  -- Apply RLS policy on Project tables
  CREATE POLICY project_isolation_policy ON public.projects
    USING (id = ANY(auth.get_active_project_ids()));
  ```

### Gap 2: Double-Entry Financial Integrity Guardrails
* **Context:** The blueprint introduces the **Financial & Posting Engine** and **Cost Allocation Engine**.
* **The Gap:** In Tier-1 ERPs, posting entries must maintain strict mathematical balance (`Sum(Debits) = Sum(Credits)`) and be immutable. The blueprint does not specify the validation rules, ledger lock states, and multi-period adjustment mechanisms.
* **Recommendation:**
  Enforce two invariants at the Database and Command Pipeline levels:
  1. **Transactional Invariant:** A posting command must write to `journal_entries` and `journal_lines` atomically. A database constraint must assert that `Debit - Credit = 0` per journal entry.
  2. **Immutability Invariant:** Posted entries cannot be updated or deleted. Corrections must be handled via **reversal entries** (Saga Engine).

### Gap 3: Offline Synchronization & Conflict Resolution Strategy
* **Context:** The blueprint references an **Offline Synchronization Engine** for PWAs and mobile apps.
* **The Gap:** In construction sites with poor connectivity, multiple engineers might edit the same field report or stock level. The blueprint does not define the conflict resolution strategy.
* **Recommendation:**
  Utilize Conflict-free Replicated Data Types (CRDTs) for cumulative values (like progress quantities) and Last-Write-Wins (LWW) with **human review queues** for structural status updates.
  - *Conflict Queue Schema:*
    ```sql
    CREATE TABLE public.sync_conflicts (
      id uuid PRIMARY KEY,
      tenant_id text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      local_state jsonb,
      server_state jsonb,
      resolved boolean DEFAULT false,
      resolved_by text
    );
    ```

### Gap 4: Change Data Capture (CDC) to Lakehouse Pipelines
* **Context:** The **Data Platform** lists CDC and streaming ingestion into a Lakehouse.
* **The Gap:** The exact technology bridge from Supabase/PostgreSQL (OLTP) to the streaming lakehouse (OLAP) is undefined.
* **Recommendation:**
  Deploy **Debezium** to tail the PostgreSQL Write-Ahead Log (WAL) and stream changes into Apache Kafka topic clusters, which are then batch-projected into Apache Iceberg tables in the Data Lakehouse.

### Gap 5: AI Agent Safety Thresholds & Guardrails
* **Context:** The blueprint outlines **AI Agents** (CFO, PM, Procurement Agents) executing **Autonomous ERP Workflows**.
* **The Gap:** Giving AI write access to transactional systems requires strict safety constraints to prevent erroneous PO approvals or financial allocations.
* **Recommendation:**
  Define absolute financial and structural thresholds under which AI can run autonomously. Anything exceeding these triggers a **Human-in-the-Loop (HITL)** approval.
  - *Autonomous Threshold Rule:*
    - `PO.amount < 10,000 AED` -> Autonomous execution.
    - `PO.amount >= 10,000 AED` -> Create draft, request PM approval.
    - Any changes to bank account routing -> Block autonomous updates completely.

### Gap 6: BIM-to-BOQ Data Linkage
* **Context:** The **Spatial Platform** details BIM Revit file integration.
* **The Gap:** The blueprint does not specify how BIM spatial properties (such as concrete volume or linear steel lengths) link dynamically to the Bill of Quantities (BOQ) lines in the Estimating module.
* **Recommendation:**
  Standardize on **IFC GUIDs** (Industry Foundation Classes) mapped directly to BOQ line item codes.
  ```typescript
  interface BIMLink {
    ifcGUID: string;
    boqLineItemId: string;
    multiplier: number; // For conversions (e.g. Volume to Mass)
  }
  ```
