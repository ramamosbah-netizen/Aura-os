'use client';

import { useEffect } from 'react';
import { ensureTab } from '@/lib/tabs';

/** Keeps a workspace's main tab present without changing its position. */
export default function AuraTabAnchor({ href, title, type = 'Workspace', tabKey }: { href: string; title: string; type?: string; tabKey?: string }) {
  useEffect(() => ensureTab({ href, title, type, key: tabKey }), [href, title, type, tabKey]);
  return null;
}
