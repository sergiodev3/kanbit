import { Navigate } from 'react-router';
import { homePathFor, useMe } from './auth.api';

/** `/` sends each role to its own home; rendered inside `RequireAuth`, so the session is loaded. */
export function HomeRedirect() {
  const me = useMe();
  return me.data ? <Navigate to={homePathFor(me.data.user.role)} replace /> : null;
}
