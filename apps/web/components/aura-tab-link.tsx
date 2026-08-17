'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { openTab } from '@/lib/tabs';

type AuraTabLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
  tabTitle: string;
  tabType?: string;
  tabKey?: string;
};

/** Navigate in the current browser window while registering an AURA application tab. */
export default function AuraTabLink({ href, tabTitle, tabType = 'Workspace', tabKey, onClick, ...props }: AuraTabLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const currentHref = query ? `${pathname}?${query}` : pathname;
  const stableTabKey = tabKey ?? (href.startsWith('/my-work/tasks?task=') ? '/my-work/tasks' : undefined);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (!event.defaultPrevented && event.button === 0) openTab({ href, title: tabTitle, type: tabType, key: stableTabKey }, { afterHref: currentHref });
  }

  return <Link {...props} href={href} onClick={handleClick} />;
}
