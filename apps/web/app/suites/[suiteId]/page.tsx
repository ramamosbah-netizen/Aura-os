import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { WorkspaceMe } from '@aura/shared';
import DataStateNotice from '@/components/ui/data-state';
import { getJson } from '@/lib/api';
import { findSuite, suiteFunctions, visibleSuites } from '@/lib/suites';
import styles from '@/components/suite-launcher.module.css';

export const dynamic = 'force-dynamic';

export default async function SuiteHome({ params }: { params: Promise<{ suiteId: string }> }) {
  const { suiteId } = await params;
  const suite = findSuite(suiteId);
  if (!suite) notFound();
  const me = await getJson<WorkspaceMe>('/api/workspace/me');
  const allowed = visibleSuites(me?.functions.filter((fn) => fn.startsWith('suite.')) ?? null, me?.isAdmin ?? false);
  if (me && !allowed.some((entry) => entry.id === suite.id)) {
    return <div className={styles.shell}><DataStateNotice error={{ kind: 'forbidden', status: 403 }} subject={suite.name} /></div>;
  }
  const functions = suiteFunctions(suite);
  return (
    <div className={styles.shell} data-testid="suite-home">
      <p className={styles.eyebrow}><Link href="/suites">Suites</Link> / {suite.shortName}</p>
      <header className={styles.suiteHead}>
        <span className={styles.suiteGlyph} aria-hidden>{suite.glyph}</span>
        <div><h1 className={styles.title}>{suite.name}</h1><p className={styles.description}>{suite.description}</p></div>
        <Link href={suite.entryHref} className={styles.primary}>Open suite</Link>
      </header>
      {suite.featured?.length ? (
        <section aria-labelledby="featured-tools">
          <h2 id="featured-tools" style={{ fontSize: 15, margin: '0 0 10px' }}>Workplace shortcuts</h2>
          <div className={styles.featured}>
            {suite.featured.map((tool) => {
              const content = <><span className={styles.toolGlyph} aria-hidden>{tool.glyph}</span><span><strong>{tool.label}</strong><span className={styles.toolCopy}>{tool.description}</span></span><span className={styles.toolStatus}>{tool.status}</span></>;
              return tool.href ? <Link key={tool.label} href={tool.href} className={styles.tool}>{content}</Link> : <div key={tool.label} className={`${styles.tool} ${styles.toolUnavailable}`} aria-disabled="true">{content}</div>;
            })}
          </div>
        </section>
      ) : null}
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="suite-functions"><h2 id="suite-functions">Available functions</h2><div className={styles.functions}>{functions.map((item) => <Link key={item.href} href={item.href} className={styles.function}><strong>{item.glyph} {item.label}</strong><span>{item.desc}</span></Link>)}</div></section>
        <aside className={styles.panel} aria-labelledby="suite-capabilities"><h2 id="suite-capabilities">Capability truth</h2><ul className={styles.capabilities}>{suite.capabilities.map((capability) => <li key={capability.label} className={styles.capability}><span>{capability.label}</span><span className={`${styles.status} ${capability.status === 'IMPLEMENTED' ? styles.implemented : capability.status === 'PARTIALLY IMPLEMENTED' ? styles.partial : ''}`}>{capability.status}</span></li>)}</ul></aside>
      </div>
    </div>
  );
}
