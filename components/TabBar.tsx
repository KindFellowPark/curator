'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// "Shelf" is the first tab's name, not an alias for the app. The app is Curator.
const TABS = [
  { href: '/shelf', label: 'Shelf' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/for-you', label: 'For you' },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={pathname === t.href ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
