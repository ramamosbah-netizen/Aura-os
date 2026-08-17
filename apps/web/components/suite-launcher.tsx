import Link from 'next/link';
import type { AuraSuite } from '@/lib/suites';
import { suiteFunctions } from '@/lib/suites';
import styles from './suite-launcher.module.css';

export default function SuiteLauncher({ suites }: { suites: AuraSuite[] }) {
  return (
    <div className={styles.grid} data-testid="suite-launcher">
      {suites.map((suite) => (
        <Link key={suite.id} href={`/suites/${suite.id}`} className={styles.card}>
          <span className={styles.glyph} aria-hidden>{suite.glyph}</span>
          <span>
            <strong className={styles.name}>{suite.name}</strong>
            <span className={styles.copy}>{suite.description}</span>
            <span className={styles.meta}>{suiteFunctions(suite).length} available functions</span>
          </span>
          <span className={styles.arrow} aria-hidden>→</span>
        </Link>
      ))}
    </div>
  );
}
