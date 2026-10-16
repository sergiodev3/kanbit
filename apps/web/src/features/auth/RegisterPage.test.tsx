import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, meFixture, mockApi, renderRoutes, requestBody, unauthenticated } from '../../test/utils';
import { RegisterPage } from './RegisterPage';

const routes: RouteObject[] = [
  { path: '/register', Component: RegisterPage },
  { path: '/team', element: <p>Team home</p> },
];

function fill(values: { code?: string; name: string; username: string; password: string; confirm: string }) {
  if (values.code !== undefined) {
    fireEvent.change(screen.getByLabelText('Código de grupo'), { target: { value: values.code } });
  }
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: values.name } });
  fireEvent.change(screen.getByLabelText('Matrícula o usuario'), { target: { value: values.username } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: values.password } });
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: values.confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterPage', () => {
  it('prefills the group code from the share link', () => {
    mockApi({ 'GET /auth/me': unauthenticated });

    renderRoutes(routes, ['/register?code=abc123']);

    expect(screen.getByLabelText('Código de grupo')).toHaveValue('ABC123');
  });

  it('registers the student and opens their team home', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': unauthenticated,
      'POST /auth/register': () => jsonResponse(201, meFixture('STUDENT')),
    });

    renderRoutes(routes, ['/register?code=ABC123']);
    fill({ name: ' Luis Pérez ', username: 'A001', password: 'secreto123', confirm: 'secreto123' });

    expect(await screen.findByText('Team home')).toBeInTheDocument();
    expect(requestBody(fetchMock, 'POST /auth/register')).toEqual({
      accessCode: 'ABC123',
      name: 'Luis Pérez',
      username: 'a001',
      password: 'secreto123',
    });
  });

  it('blocks submission when the passwords do not match', async () => {
    const fetchMock = mockApi({ 'GET /auth/me': unauthenticated });

    renderRoutes(routes, ['/register?code=ABC123']);
    fill({ name: 'Luis', username: 'a001', password: 'secreto123', confirm: 'secreto124' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Las contraseñas no coinciden.');
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('shows a Spanish message when the username is taken', async () => {
    mockApi({
      'GET /auth/me': unauthenticated,
      'POST /auth/register': () => errorResponse(409, 'USERNAME_TAKEN'),
    });

    renderRoutes(routes, ['/register?code=ABC123']);
    fill({ name: 'Luis', username: 'a001', password: 'secreto123', confirm: 'secreto123' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Ese usuario ya está registrado.');
  });

  it('drops an earlier server error when the form fails client-side validation', async () => {
    mockApi({
      'GET /auth/me': unauthenticated,
      'POST /auth/register': () => errorResponse(409, 'USERNAME_TAKEN'),
    });

    renderRoutes(routes, ['/register?code=ABC123']);
    fill({ name: 'Luis', username: 'a001', password: 'secreto123', confirm: 'secreto123' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese usuario ya está registrado.');

    fill({ name: 'Luis', username: 'a002', password: 'secreto123', confirm: 'secreto124' });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Las contraseñas no coinciden.'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('Ese usuario ya está registrado.');
  });
});
