import { ArrowLeft, ArrowRight, ShieldCheck, Star } from 'lucide-react';
import { currentUser, getJson } from '@/lib/api';
import AuraTabLink from '@/components/aura-tab-link';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import styles from '@/components/my-work-center.module.css';

export const dynamic = 'force-dynamic';

interface SavedView {
  id: string;
  userId: string | null;
  label: string;
  path: string;
  query: string;
  createdAt: string;
}

export default async function MyFavoritesPage() {
  const [user, views] = await Promise.all([currentUser(), getJson<SavedView[]>('/api/views')]);
  const favorites = (views ?? []).filter((view) => !!user?.sub && view.userId === user.sub);

  return (
    <main className={styles.page} data-testid="my-favorites-page">
      <AuraTabAnchor href="/my-work/favorites" title="Favorites" type="My Work" />
      <AuraTabLink href="/my-work" tabTitle="My Work" tabType="Workspace" className={styles.back}><ArrowLeft aria-hidden />My Work</AuraTabLink>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>MY WORK / FAVORITES</p><h1>Favorites</h1><p>The functions, filtered work lists and pages you saved for quick access.</p></div>
        <AuraTabLink href="/suites" tabTitle="Suites" tabType="Workspace" className={styles.heroAction}>Browse functions <ArrowRight aria-hidden /></AuraTabLink>
      </header>

      {views === null ? <p className={styles.empty}>The saved-view source is currently unavailable.</p> : favorites.length === 0 ? (
        <section className={styles.section}><p className={styles.empty}>You have no personal favorites yet. Use “Save view” on a supported list page, then it will appear here.</p></section>
      ) : (
        <section className={styles.favoriteGrid} aria-label="My favorite pages">
          {favorites.map((favorite) => {
            const href = `${favorite.path}${favorite.query ? `?${favorite.query}` : ''}`;
            return <AuraTabLink key={favorite.id} href={href} tabTitle={favorite.label} tabType="Favorite" className={styles.favorite}><Star aria-hidden /><strong>{favorite.label}</strong><small>{href}</small></AuraTabLink>;
          })}
        </section>
      )}
      <p className={styles.truth}><ShieldCheck aria-hidden /><span>Favorites are filtered to the signed-in user. They store navigation and filters only; they do not copy the underlying business records.</span></p>
    </main>
  );
}
