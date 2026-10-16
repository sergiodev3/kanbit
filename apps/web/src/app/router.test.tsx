import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, meFixture, mockApi, renderRoutes, unauthenticated } from '../test/utils';
import { ME_QUERY_KEY } from '../features/auth/auth.api';
import { routes } from './router';

// UpdatePrompt imports `virtual:pwa-register/react`, which exists only under the PWA plugin (not loaded in tests).
vi.mock('../shared/pwa/UpdatePrompt', () => ({ UpdatePrompt: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
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

    renderRoutes(routes, ['/teacher']);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo cerrar la sesión/)).not.toBeInTheDocument();
  });

  it('notes that the server was not reached when logout fails offline', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': () => {
        throw new TypeError('Failed to fetch');
      },
    });

    renderRoutes(routes, ['/teacher']);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByText(/no se pudo avisar al servidor/)).toBeInTheDocument();
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
