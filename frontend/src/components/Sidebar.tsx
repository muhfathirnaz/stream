
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
