'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Campaigns', href: '/campaigns' },
  { label: 'Subreddits', href: '/subreddits' },
  { label: 'Runs', href: '/runs' },
  { label: 'Injections', href: '/injections' },
];

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(href) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-gray-900 text-white shrink-0">
      <div className="px-5 py-5 border-b border-gray-700">
        <span className="text-lg font-bold tracking-tight">Amplify</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_LINKS.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive(href)
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700">
        <Link
          href="/campaigns/new"
          className="flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          + New Campaign
        </Link>
      </div>
    </aside>
  );
}
