import type { Role } from '@kanbit/shared';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { errorMessage } from '../../lib/error-messages';
import { homePathFor, useMe } from './auth.api';

/** Router state passed to `/login` so the user returns to the page they asked for. */
export interface LoginRedirectState {
  from?: string;
}

interface RequireAuthProps {
  /** When set, users with another role are sent to their own home. */
  role?: Role;
  children?: ReactNode;
}

export function RequireAuth({ role, children }: RequireAuthProps) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) {
    return (
      <p role="status" className="py-8 text-center text-slate-600">
        {me.fetchStatus === 'paused' ? 'Sin conexión. Conéctate para continuar.' : 'Cargando…'}
      </p>
    );
  }

  if (me.isError) {
    return (
      <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-4 text-red-900 ring-1 ring-red-200">
        <p>{errorMessage(me.error)}</p>
        <button
          type="button"
          onClick={() => void me.refetch()}
          className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!me.data) {
    const state: LoginRedirectState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={state} />;
  }

  if (role && me.data.user.role !== role) {
    return <Navigate to={homePathFor(me.data.user.role)} replace />;
  }

  return children ?? <Outlet />;
}
