import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, meFixture, mockApi, renderRoutes, requestBody, unauthenticated } from '../../test/utils';
import { LoginPage } from './LoginPage';

const routes: RouteObject[] = [
  { path: '/login', Component: LoginPage },
  { path: '/teacher', element: <p>Teacher home</p> },
  { path: '/team', element: <p>Team home</p> },
  { path: '/profile', element: <p>Profile page</p> },
];

function fillAndSubmit(username: string, password: string) {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it.each([
    ['TEACHER', 'Teacher home'],
    ['STUDENT', 'Team home'],
  ] as const)('logs a %s in and opens their home', async (role, home) => {
    const fetchMock = mockApi({
      'GET /auth/me': unauthenticated,
      'POST /auth/login': () => jsonResponse(200, meFixture(role)),
    });

    renderRoutes(routes, ['/login']);
    fillAndSubmit('  Ana ', 'secreto123');

    expect(await screen.findByText(home)).toBeInTheDocument();
    expect(requestBody(fetchMock, 'POST /auth/login')).toEqual({ username: 'ana', password: 'secreto123' });
  });

  it('returns to the page the user originally asked for', async () => {
    mockApi({
      'GET /auth/me': unauthenticated,
      'POST /auth/login': () => jsonResponse(200, meFixture('STUDENT')),
    });

    renderRoutes(routes, [{ pathname: '/login', state: { from: '/profile' } }]);
    fillAndSubmit('a001', 'secreto123');

    expect(await screen.findByText('Profile page')).toBeInTheDocument();
  });

  it('shows a Spanish message for invalid credentials', async () => {
    mockApi({
      'GET /auth/me': unauthenticated,
      'POST /auth/login': () => errorResponse(401, 'INVALID_CREDENTIALS'),
    });

    const { router } = renderRoutes(routes, ['/login']);
    fillAndSubmit('ana', 'equivocada');

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('flags empty fields without calling the API', async () => {
    const fetchMock = mockApi({ 'GET /auth/me': unauthenticated });

    renderRoutes(routes, ['/login']);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe tu usuario');
    expect(screen.getByLabelText('Usuario')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops an earlier server error when the form fails client-side validation', async () => {
    mockApi({
      'GET /auth/me': unauthenticated,
      'POST /auth/login': () => errorResponse(401, 'INVALID_CREDENTIALS'),
    });

    renderRoutes(routes, ['/login']);
    fillAndSubmit('ana', 'equivocada');
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.');

    fillAndSubmit('', 'equivocada');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu usuario'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('Usuario o contraseña incorrectos.');
  });
});
