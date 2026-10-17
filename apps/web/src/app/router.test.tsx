import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardFixture } from '../test/board-fixtures';
import { jsonResponse, meFixture, mockApi, renderRoutes, unauthenticated } from '../test/utils';
import { ME_QUERY_KEY } from '../features/auth/auth.api';
import { clearPendingLogout, hasPendingLogout } from '../features/auth/pending-logout';
import { routes } from './router';

// UpdatePrompt imports `virtual:pwa-register/react`, which exists only under the PWA plugin (not loaded in tests).
vi.mock('../shared/pwa/UpdatePrompt', () => ({ UpdatePrompt: () => null }));

const OFFLINE_LOGOUT_NOTICE = /se cerrará por completo en el servidor cuando vuelva la conexión/;

const networkError = (): Response => {
  throw new TypeError('Failed to fetch');
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearPendingLogout();
  localStorage.clear();
  onlineManager.setOnline(true);
});

describe('app routes', () => {
  it.each([
    ['TEACHER', '/teacher'],
    ['STUDENT', '/team'],
  ] as const)('sends a %s from / to %s', async (role, home) => {
    mockApi({ 'GET /auth/me': () => jsonResponse(200, meFixture(role)) });

    const { router } = renderRoutes(routes, ['/']);

    await waitFor(() => expect(router.state.location.pathname).toBe(home));
  });

  it('sends visitors from / to the login page', async () => {
    mockApi({ 'GET /auth/me': unauthenticated });

    const { router } = renderRoutes(routes, ['/']);

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows the user in the header and logs out to the login page', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    });

    const { router } = renderRoutes(routes, ['/teacher']);

    expect(await screen.findByText('Ana Docente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/profile');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByText('Ana Docente')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({ method: 'POST' }));
  });

  it.each([
    ['answers 401 because the session already expired', () => unauthenticated()],
    [
      'fails with a network error',
      (): Response => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ] as const)('still logs out locally when the logout request %s', async (_case, logoutHandler) => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': logoutHandler,
    });

    const { router, client } = renderRoutes(routes, ['/teacher']);
    expect(await screen.findByText('Ana Docente')).toBeInTheDocument();
    client.setQueryData(['groups'], [{ id: 'g1' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.queryByText('Ana Docente')).not.toBeInTheDocument();
    expect(client.getQueryData(['groups'])).toBeUndefined();
    expect(client.getQueryData(ME_QUERY_KEY)).toBeNull();
  });

  it('does not report a failure when logout answers 401', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': unauthenticated,
    });

    const { router } = renderRoutes(routes, ['/teacher']);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.queryByText(OFFLINE_LOGOUT_NOTICE)).not.toBeInTheDocument();
    expect(hasPendingLogout()).toBe(false);
  });

  it('notes that the server will be told when the connection returns after an offline logout', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': networkError,
    });

    renderRoutes(routes, ['/teacher']);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByText(OFFLINE_LOGOUT_NOTICE)).toBeInTheDocument();
    expect(screen.getByText(/Cerraste sesión en este dispositivo/)).toBeInTheDocument();
  });

  it('keeps a shared device signed out when /auth/me still accepts the old cookie after an offline logout', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': networkError,
    });

    const { router, client } = renderRoutes(routes, ['/teacher']);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(hasPendingLogout()).toBe(true);

    // Window focus / reconnect refetches the session while the server still holds the cookie.
    await act(() => client.refetchQueries({ queryKey: ME_QUERY_KEY }));

    expect(client.getQueryData(ME_QUERY_KEY)).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByText('Ana Docente')).not.toBeInTheDocument();
    expect(hasPendingLogout()).toBe(true);
  });

  it('finishes the pending logout on the server when the browser comes back online', async () => {
    let logoutHandler: () => Response = networkError;
    const fetchMock = mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': () => logoutHandler(),
    });

    renderRoutes(routes, ['/teacher']);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(hasPendingLogout()).toBe(true);

    logoutHandler = () => new Response(null, { status: 204 });
    act(() => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });

    await waitFor(() => expect(hasPendingLogout()).toBe(false));
    const logoutCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/logout'));
    expect(logoutCalls).toHaveLength(2);
  });

  it('opens a group detail for teachers only', async () => {
    mockApi({ 'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT')) });

    const { router } = renderRoutes(routes, ['/teacher/groups/g1']);

    await waitFor(() => expect(router.state.location.pathname).toBe('/team'));
  });

  it('opens a team board read-only for the teacher, with a way back to the group', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'GET /teams/t1/board': () => jsonResponse(200, boardFixture()),
    });

    renderRoutes(routes, ['/teacher/teams/t1/board']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Equipo Rojo' })).toBeInTheDocument();
    expect(screen.getByText('Solo lectura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva tarjeta' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Volver al grupo' })).toHaveAttribute('href', '/teacher/groups/g1');
  });

  it('keeps students out of the teacher board route', async () => {
    mockApi({ 'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT')) });

    const { router } = renderRoutes(routes, ['/teacher/teams/t1/board']);

    await waitFor(() => expect(router.state.location.pathname).toBe('/team'));
  });

  it('keeps the service status page public', async () => {
    mockApi({
      'GET /auth/me': unauthenticated,
      'GET /health': () => jsonResponse(200, { status: 'ok', db: 'ok', version: '0.1.0', time: '2026-10-15T15:00:00.000Z' }),
    });

    renderRoutes(routes, ['/status']);

    expect(await screen.findByRole('heading', { name: 'Estado del servicio' })).toBeInTheDocument();
  });
});
