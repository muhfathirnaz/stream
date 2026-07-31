'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { label: 'Dashboard',    icon: '⊞', href: '/' },
  { label: 'Live Streams', icon: '◉', href: '/streams' },
  { label: 'Media Pool',   icon: '🎵', href: '/media-pool' },
  { label: 'Generator',    icon: '✨', href: '/generator' },
  { label: 'OAuth Tool',   icon: '🔑', href: '/oauth-helper' },
  { label: 'Render Karaoke', icon: '🎤', href: '/render' },
  { label: 'YT Upload', icon: '📺', href: '/youtube-upload' },
];

/**
 * Absolute URLs + window.location.assign force a full browser navigation
 * out of the Command Center Next.js router. Relative /recap/manga is
 * same-origin and soft-routes inside this app → 404.
 */
const recapItems = [
  { label: 'Recap Manga', icon: '📖', path: '/recap/manga' },
  { label: 'Recap Novel', icon: '📚', path: '/recap/novel' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <svg viewBox="0 0 24 24" fill="white" width="14" height="14">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <span className="sidebar-logo-text">Command Center</span>
      </div>
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${active ? 'sidebar-item--active' : ''}`}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
              {active && <span className="sidebar-item-dot" />}
            </Link>
          );
        })}
        <div className="sidebar-section-label" style={{ marginTop: 12 }}>Recap</div>
        {recapItems.map((item) => (
          <a
            key={item.path}
            href={`https://aksarastream.ddns.net${item.path}`}
            className="sidebar-item"
            // full document load — do not let Next intercept
            target="_self"
            rel="noopener"
            onClick={(e) => {
              e.preventDefault();
              window.location.assign(`https://aksarastream.ddns.net${item.path}`);
            }}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-footer-status">
          <div className="sidebar-footer-dot" />
          <span>VPS Online</span>
        </div>
      </div>
    </aside>
  );
}
