import type { WorkspaceMe } from '@aura/shared';
import { getJson } from '@/lib/api';
import { visibleSuites } from '@/lib/suites';
import SuiteLauncher from '@/components/suite-launcher';
import styles from '@/components/suite-launcher.module.css';

export const dynamic = 'force-dynamic';

export default async function SuitesPage() {
  const me = await getJson<WorkspaceMe>('/api/workspace/me');
  const suites = visibleSuites(me?.functions.filter((fn) => fn.startsWith('suite.')) ?? null, me?.isAdmin ?? false);
  return (
    <div className={styles.shell} data-testid="suites-page">
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>AURA OS / SUITES</p><h1 className={styles.title}>Choose the work, not the module.</h1><p className={styles.description}>Suites organize existing AURA capabilities around outcomes. They do not create new backend ownership or copy domain records.</p></div>
        <span className={styles.count}>{suites.length} suites available</span>
      </header>
      <SuiteLauncher suites={suites} />
    </div>
  );
}
