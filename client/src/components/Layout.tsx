import { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHealth } from '../api/client';
import { cx } from './ui';
import { ErrorBoundary } from './ErrorBoundary';

const appNav = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Analyze', path: '/analyze' },
  { label: 'Resumes', path: '/resumes' },
  { label: 'Applications', path: '/applications' },
  { label: 'Research', path: '/research' },
  { label: 'Profile', path: '/profile' },
];

export const Logo = () => (
  <img
    src="/logo.png"
    alt="RESUMEFIT"
    className="block h-auto w-[150px] max-w-full shrink-0 object-contain sm:w-[184px]"
  />
);

export const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dbMode, setDbMode] = useState<string | null>(null);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    getHealth()
      .then((health) => setDbMode(health.database.connected ? health.database.mode : 'unavailable'))
      .catch(() => setDbMode('unavailable'));
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f7fc] text-ink">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-white/85 backdrop-blur-xl supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link to={user ? '/dashboard' : '/'} className="focus-ring rounded-md" aria-label="RESUMEFIT home">
              <Logo />
            </Link>
            {user && (
              <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
                {appNav.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => cx('focus-ring rounded-md px-2.5 py-1.5 text-[12px] font-medium uppercase tracking-[0.12em] transition', isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-3 hover:bg-brand-50 hover:text-brand-700')}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={logout}
                  className="focus-ring hidden items-center gap-2 rounded-md border border-brand-100 bg-white px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-brand-700 shadow-sm transition hover:bg-brand-50 sm:inline-flex"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="size-3.5" />
                  Logout
                </button>
                <button type="button" onClick={() => setMenuOpen((open) => !open)} className="focus-ring rounded-md p-2 text-ink-2 lg:hidden" aria-label="Menu" aria-expanded={menuOpen}>
                  {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="focus-ring rounded-md px-2 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-2 transition hover:text-ink sm:px-4 sm:text-[11px] sm:tracking-[0.12em]">
                  Sign in
                </Link>
                <Link to="/register" className="focus-ring rounded-md bg-brand-600 px-2 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-white shadow-sm transition hover:bg-brand-700 sm:px-4 sm:text-[11px] sm:tracking-[0.12em]">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
        {user && menuOpen && (
          <nav className="border-t border-line bg-white px-4 py-3 lg:hidden" aria-label="Mobile navigation">
            {appNav.map((item) => (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => cx('block rounded-md px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-brand-50 hover:text-brand-700')}>
                {item.label}
              </NavLink>
            ))}
            <button type="button" onClick={logout} className="mt-2 block w-full rounded-md border border-line bg-white px-3 py-2 text-left text-sm font-medium text-ink-2 hover:bg-brand-50">
              Logout
            </button>
          </nav>
        )}
      </header>

      {dbMode && dbMode !== 'mongodb' && (
        <div className={cx('border-b px-4 py-1.5 text-center text-xs', dbMode === 'unavailable' ? 'border-bad-line bg-bad-bg text-bad' : 'border-warn-line bg-warn-bg text-warn')}>
          {dbMode === 'unavailable'
            ? 'Database unavailable — sign-in and saved data are disabled until MONGO_URI is configured.'
            : 'Demo mode — data is stored in an in-memory database and is lost when the server restarts.'}
        </div>
      )}

      <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-4 py-6 text-[11px] uppercase tracking-[0.12em] text-ink-4 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>RESUMEFIT AI · deterministic, explainable resume scoring</span>
          <span>Scores are estimates to guide improvement, not hiring decisions.</span>
        </div>
      </footer>
    </div>
  );
};
