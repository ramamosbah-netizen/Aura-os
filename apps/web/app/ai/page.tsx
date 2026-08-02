import React from 'react';
import { AdminCard, AdminHeader, adminPage } from '@/components/admin-chrome';
import UserAiWorkspace from '@/components/user-ai-workspace';

export const dynamic = 'force-dynamic';

export default function UserAiPage() {
  // No hardcoded KPIs here — every figure is read live from the autonomy queue by the
  // workspace below, so the header can never contradict (or invent) the real numbers.
  return (
    <div style={adminPage}>
      <AdminHeader
        title="AURA AI Operational Workspace"
        glyph="🤖"
        subtitle="Your AI workforce observes business events, builds RAG memory, and proposes actions into your review queue — it never mutates data un-audited."
        kpis={[]}
      />

      <AdminCard
        title="Autonomy queue & RAG"
        desc="Recommendations the intelligence layer has surfaced for you, and the documents indexed into vector memory. Every number below is live from the queue — nothing is pre-filled."
      >
        <UserAiWorkspace userRole="you" />
      </AdminCard>
    </div>
  );
}
