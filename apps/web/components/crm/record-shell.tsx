'use client';

// Moved to the shared record design system at components/ui/record.tsx (PR-04) so every module,
// not just CRM, composes the same 360 experience. This file remains as a compatibility re-export
// for the existing CRM 360s (account/lead/opportunity/quotation 360 clients + my-day). Import
// from '@/components/ui/record' in new code.
export * from '../ui/record';
