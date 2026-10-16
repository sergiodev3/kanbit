import { act, screen, waitFor } from '@testing-library/react';
import { useLocation, type RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, meFixture, mockApi, renderRoutes, unauthenticated } from '../../test/utils';
import { ME_QUERY_KEY } from './auth.api';
import { RequireAuth } from './RequireAuth';

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <p>Login from {from ?? 'nowhere'}</p>;
}

const routes: RouteObject[] = [
  { path: '/login', Component: LoginProbe },
  {
    element: <RequireAuth role="TEACHER" />,
    children: [{ path: '/teacher', element: <p>Teacher area</p> }],
  },
  {
    element: <RequireAuth role="STUDENT" />,
    children: [{ path: '/team', element: <p>Team area</p> }],
  },
  {
    element: <RequireAuth />,
    children: [{ path: '/profile', element: <p>Profile area</p> }],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireAuth', () => {
  it('redirects unauthenticated users to /login, remembering where they were going', async () => {
    mockApi({ 'GET /auth/me': unauthenticated });

    const { router } = renderRoutes(routes, ['/profile?tab=1']);

    expect(await screen.findByText('Login from /profile?tab=1')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('renders the protected page for a user with the required role', async () => {
    mockApi({ 'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')) });

    renderRoutes(routes, ['/teacher']);

    expect(await screen.findByText('Teacher area')).toBeInTheDocument();
  });

  it('sends a user with the wrong role to their own home', async () => {
    mockApi({ 'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT')) });

    const { router } = renderRoutes(routes, ['/teacher']);

    expect(await screen.findByText('Team area')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/team'));
  });

  it('keeps the protected page when a background session refetch fails', async () => {
    let online = true;
    mockApi({
      'GET /auth/me': () => {
        if (online) return jsonResponse(200, meFixture('TEACHER'));
        throw new TypeError('Failed to fetch');
      },
    });

    const { client } = renderRoutes(routes, ['/teacher']);
    expect(await screen.findByText('Teacher area')).toBeInTheDocument();

    online = false;
    await act(async () => {
      await client.refetchQueries({ queryKey: ME_QUERY_KEY });
      // Let TanStack Query's batched notifications re-render the observers.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(client.getQueryState(ME_QUERY_KEY)?.status).toBe('error');
    expect(screen.getByText('Teacher area')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a retry option when the session cannot be loaded at all', async () => {
    mockApi({
      'GET /auth/me': () => {
        throw new TypeError('Failed to fetch');
      },
    });

    renderRoutes(routes, ['/teacher']);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('shows a loading state while the session is being checked', () => {
    mockApi({ 'GET /auth/me': () => new Promise<Response>(() => undefined) });

    renderRoutes(routes, ['/profile']);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
  });
});
