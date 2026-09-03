'use client';

import type { CSSProperties } from 'react';
import { ArrowRight, GitBranch, Plus } from 'lucide-react';
import AuraTabLink from './aura-tab-link';
import styles from './suite-dashboard-shell.module.css';

export interface DeliveryVariation {
  id: string;
  type: 'addition' | 'omission' | string;
  amount: number;
  signedAmount: number;
  status: string;
}

function money(value: number): string {
  return `AED ${Math.round(value).toLocaleString('en-AE')}`;
}

export default function ProjectChangeControlBand({ variations }: { variations: DeliveryVariation[] | null }) {
  const rows = variations ?? [];
  const approved = rows.filter((variation) => variation.status === 'approved');
  const pending = rows.filter((variation) => variation.status === 'draft' || variation.status === 'submitted');
  const additions = approved.filter((variation) => variation.type === 'addition').reduce((sum, variation) => sum + variation.amount, 0);
  const omissions = approved.filter((variation) => variation.type === 'omission').reduce((sum, variation) => sum + variation.amount, 0);
  const net = additions - omissions;
  const unavailable = variations === null;

  return (
    <section className={styles.band} aria-label="Project change control" data-testid="project-change-control-band">
      <div className={styles.bandHead}>
        <div>
          <p className={styles.sectionKicker}><GitBranch size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Change control pulse</p>
          <h2>C6 variations that need a decision</h2>
        </div>
        <AuraTabLink href="/projects/variations" tabTitle="Changes" tabType="Projects">Open register <ArrowRight aria-hidden /></AuraTabLink>
      </div>
      <div className={styles.bandStages} style={{ '--stage-count': 4 } as CSSProperties}>
        <AuraTabLink href="/projects/variations?status=submitted" tabTitle="Pending variations" tabType="Projects" className={styles.bandStage}>
          <small>Awaiting approval</small><b>{unavailable ? '—' : pending.length}</b><span>{unavailable ? 'data unavailable' : pending.length === 1 ? 'open change' : 'open changes'}</span><i />
        </AuraTabLink>
        <AuraTabLink href="/projects/variations?status=approved" tabTitle="Approved variations" tabType="Projects" className={styles.bandStage}>
          <small>Approved changes</small><b>{unavailable ? '—' : approved.length}</b><span>{unavailable ? 'data unavailable' : approved.length === 1 ? 'value effect' : 'value effects'}</span><i />
        </AuraTabLink>
        <AuraTabLink href="/projects/variations?status=approved" tabTitle="Net approved effect" tabType="Projects" className={styles.bandStage}>
          <small>Net approved effect</small><b>{unavailable ? '—' : `${net < 0 ? '−' : ''}${money(Math.abs(net))}`}</b><span>{unavailable ? 'data unavailable' : 'original stays immutable'}</span><i />
        </AuraTabLink>
        <AuraTabLink href="/projects/variations#raise-variation" tabTitle="Raise variation" tabType="Projects" className={styles.bandStage}>
          <small><Plus size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Action</small><b>Raise</b><span>create a controlled draft</span><i />
        </AuraTabLink>
      </div>
    </section>
  );
}
