import { fireEvent, screen } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, meFixture, mockApi, renderRoutes, requestBody } from '../../test/utils';
import { ProfilePage } from './ProfilePage';

const routes: RouteObject[] = [{ path: '/profile', Component: ProfilePage }];

async function changePassword(current: string, next: string, confirm: string) {
  fireEvent.change(await screen.findByLabelText('Contraseña actual'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProfilePage', () => {
  it('shows the user and their group', async () => {
    mockApi({ 'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT')) });

    renderRoutes(routes, ['/profile']);

    expect(await screen.findByText('Luis Alumno')).toBeInTheDocument();
    expect(screen.getByText('a001')).toBeInTheDocument();
    expect(screen.getByText('Grupo A')).toBeInTheDocument();
  });

  it('changes the password and confirms it', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT')),
      'POST /auth/change-password': () => new Response(null, { status: 204 }),
    });

    renderRoutes(routes, ['/profile']);
    await changePassword('secreto123', 'nuevo-secreto', 'nuevo-secreto');

    expect(await screen.findByText('Contraseña actualizada.')).toBeInTheDocument();
    expect(requestBody(fetchMock, 'POST /auth/change-password')).toEqual({
      currentPassword: 'secreto123',
      newPassword: 'nuevo-secreto',
    });
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('');
  });

  it('shows a Spanish message when the current password is wrong', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/change-password': () => errorResponse(400, 'INVALID_CURRENT_PASSWORD'),
    });

    renderRoutes(routes, ['/profile']);
    await changePassword('equivocada', 'nuevo-secreto', 'nuevo-secreto');

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta.');
  });

  it('rejects a new password equal to the current one', async () => {
    mockApi({ 'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')) });

    renderRoutes(routes, ['/profile']);
    await changePassword('secreto123', 'secreto123', 'secreto123');

    expect(await screen.findByRole('alert')).toHaveTextContent('La nueva contraseña debe ser distinta de la actual.');
  });
});
