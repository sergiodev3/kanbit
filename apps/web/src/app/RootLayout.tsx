import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useMe } from '../features/auth/auth.api';
import { errorMessage } from '../lib/error-messages';
import { InstallButton } from '../shared/pwa/InstallButton';
import { IosInstallGuide } from '../shared/pwa/IosInstallGuide';
import { OfflineBanner } from '../shared/pwa/OfflineBanner';
import { UpdatePrompt } from '../shared/pwa/UpdatePrompt';

const headerButton =
  'rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-white';

export function RootLayout() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const signOut = () => logout.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) });

  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner />
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-brand-600 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <Link
          to="/"
          className="rounded text-lg font-bold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Kanbit
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <InstallButton />
          {me.data && (
            <>
              <span className="max-w-32 truncate text-sm sm:max-w-48">{me.data.user.name}</span>
              <NavLink
                to="/profile"
                className={({ isActive }) => `${headerButton} ${isActive ? 'bg-brand-700' : 'hover:bg-brand-700'}`}
              >
                Perfil
              </NavLink>
              <button
                type="button"
                onClick={signOut}
                disabled={logout.isPending}
                className={`${headerButton} bg-white text-brand-700 hover:bg-brand-50 disabled:opacity-60`}
              >
                Cerrar sesión
              </button>
            </>
          )}
        </div>
      </header>
      {logout.isError && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-center text-sm font-semibold text-red-900">
          No se pudo cerrar la sesión. {errorMessage(logout.error)}
        </p>
      )}
      <main className="mx-auto w-full max-w-xl flex-1 p-4">
        <IosInstallGuide />
        <Outlet />
      </main>
      <UpdatePrompt />
    </div>
  );
}
