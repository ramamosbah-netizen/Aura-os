import { ArrowLeft } from 'lucide-react';
import { fetchJson } from '@/lib/api';
import type { WorkItemsPayload } from '@/lib/work-items';
import AuraTabLink from '@/components/aura-tab-link';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import DataStateNotice from '@/components/ui/data-state';
import MyTasksWorkspace from '@/components/my-tasks-workspace';
import styles from '@/components/my-work-center.module.css';

export const dynamic = 'force-dynamic';

export default async function MyTasksPage() {
  const result = await fetchJson<WorkItemsPayload>('/api/work-items');
  return (
    <main className={styles.page} data-testid="my-tasks-page">
      <AuraTabAnchor href="/my-work/tasks" title="Tasks" type="My Work" tabKey="/my-work/tasks" />
      <AuraTabLink href="/my-work" tabTitle="My Work" tabType="Workspace" className={styles.back}><ArrowLeft aria-hidden />My Work</AuraTabLink>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>MY WORK / TASKS</p><h1>My Tasks</h1><p>Every task connected to you—created by you, assigned by others, or raised by AURA. Today’s focused plan stays in My Day.</p></div>
      </header>
      {result.ok ? <MyTasksWorkspace initial={result.data} /> : <DataStateNotice error={result.error} subject="your work items" />}
    </main>
  );
}
