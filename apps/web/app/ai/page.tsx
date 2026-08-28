import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * AI is a capability, not a competing destination. Keep old bookmarks and contextual "Ask AURA"
 * links working, while the governed business view lives in Intelligence and platform controls live
 * in /admin/ai. The persistent AI dock remains available on every authenticated page.
 */
export default function LegacyAiPage(): never {
  permanentRedirect('/intelligence');
}
