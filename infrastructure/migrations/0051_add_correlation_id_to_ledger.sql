-- Migration: Add correlation_id columns to event and audit ledgers
-- Facilitates tracing requests and events across the entire monolith.

ALTER TABLE public.aura_events ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE public.aura_audit_log ADD COLUMN IF NOT EXISTS correlation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_aura_events_correlation ON public.aura_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_aura_audit_log_correlation ON public.aura_audit_log (correlation_id);
