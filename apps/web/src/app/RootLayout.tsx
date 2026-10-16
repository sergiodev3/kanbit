import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useMe, usePendingLogoutRetry } from '../features/auth/auth.api';
import { isApiError } from '../lib/api';
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
  usePendingLogoutRetry();

  const signOut = () => logout.mutate(undefined, { onSettled: () => void navigate('/login', { replace: true }) });
  // A 401 means the session had already ended, so only other failures are worth a notice: the
  // logout stays pending and is retried. The notice hides as soon as someone signs back in.
  const logoutUnconfirmed = logout.isError && !isApiError(logout.error, 'UNAUTHENTICATED') && !me.data;

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
      {logoutUnconfirmed && (
        <p role="status" className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Cerraste sesión en este dispositivo. La sesión se cerrará por completo en el servidor cuando vuelva la
          conexión.
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
