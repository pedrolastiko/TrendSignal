import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Tags, Rss, Menu, X } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';

const navItems = [
  { to: '/', icon: LayoutDashboard, key: 'dashboard' as const },
  { to: '/trends', icon: TrendingUp, key: 'trends' as const },
  { to: '/keywords', icon: Tags, key: 'keywords' as const },
  { to: '/sources', icon: Rss, key: 'sources' as const },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="flex flex-col gap-1" aria-label={t.nav.dashboard}>
      {navItems.map(({ to, icon: Icon, key }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-primary text-white' : 'text-ink hover:bg-surface'
            }`
          }
        >
          <Icon size={18} aria-hidden="true" />
          {t.nav[key]}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-white"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:hidden">
        <span className="text-lg font-semibold text-primary">{t.app.name}</span>
        <button
          type="button"
          className="rounded-control border border-border p-2"
          aria-label={t.common.menu}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-lg font-semibold text-primary">{t.app.name}</span>
              <button
                type="button"
                className="rounded-control border border-border p-2"
                aria-label={t.common.close}
                onClick={() => setDrawerOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <NavList onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-white p-4 lg:flex">
          <div className="mb-6 px-2">
            <p className="text-lg font-semibold text-primary">{t.app.name}</p>
            <p className="text-xs text-muted">{t.app.tagline}</p>
          </div>
          <NavList />
        </aside>
        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
          <footer className="mt-10 border-t border-border pt-4 text-xs text-muted">
            {t.attribution}
          </footer>
        </main>
      </div>
    </div>
  );
}
