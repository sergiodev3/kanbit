import type { GroupDetailResponse, GroupResponse, TeamResponse } from '@kanbit/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoutes, requestBody } from '../../test/utils';
import { GroupDetailPage } from './GroupDetailPage';

const routes: RouteObject[] = [{ path: '/teacher/groups/:groupId', Component: GroupDetailPage }];

const group: GroupResponse = {
  id: 'g1',
  name: 'Programación Web 5A',
  accessCode: 'ABC123',
  accessOpen: true,
  updatedAt: '2026-10-15T15:00:00.000Z',
};

const detail: GroupDetailResponse = {
  ...group,
  students: [
    { id: 's1', name: 'Ana López', username: 'a001', teamId: 't1' },
    { id: 's2', name: 'Beto Ruiz', username: 'a002', teamId: null },
  ],
  teams: [{ id: 't1', name: 'Equipo Rojo', moderatorId: 's1', memberCount: 1 }],
};

const teams: TeamResponse[] = [
  {
    id: 't1',
    groupId: 'g1',
    name: 'Equipo Rojo',
    moderatorId: 's1',
    updatedAt: '2026-10-15T15:00:00.000Z',
    members: [{ userId: 's1', name: 'Ana López', username: 'a001', isModerator: true, rowOrder: 0 }],
  },
];

const baseHandlers = {
  'GET /groups/g1': () => jsonResponse(200, detail),
  'GET /groups/g1/teams': () => jsonResponse(200, teams),
  'GET /teams/t1/projects': () => jsonResponse(200, []),
};

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const openPage = () => renderRoutes(routes, ['/teacher/groups/g1']);

describe('GroupDetailPage', () => {
  it('shows the access code and copies the registration link', async () => {
    mockApi(baseHandlers);

    openPage();

    expect(await screen.findByRole('heading', { name: 'Programación Web 5A' })).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    const link = `${window.location.origin}/register?code=ABC123`;
    expect(screen.getByText(link)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
    expect(await screen.findByText('Copiado.')).toBeInTheDocument();
  });

  it('lists students with their team and an unassigned section', async () => {
    mockApi(baseHandlers);

    openPage();

    const unassigned = await screen.findByRole('region', { name: /Sin equipo/ });
    expect(within(unassigned).getByText('Beto Ruiz')).toBeInTheDocument();
    const assigned = screen.getByRole('region', { name: /Con equipo/ });
    expect(within(assigned).getByText('Ana López')).toBeInTheDocument();
    expect(within(assigned).getByText('Equipo Rojo')).toBeInTheDocument();
  });

  it('links each team to its read-only board', async () => {
    mockApi(baseHandlers);

    openPage();

    const team = await screen.findByRole('article', { name: 'Equipo Rojo' });
    expect(within(team).getByRole('link', { name: 'Ver tablero de Equipo Rojo' })).toHaveAttribute(
      'href',
      '/teacher/teams/t1/board',
    );
  });

  it('closes registration with the switch', async () => {
    const fetchMock = mockApi({
      ...baseHandlers,
      'PATCH /groups/g1': () => jsonResponse(200, { ...group, accessOpen: false }),
    });

    openPage();
    const toggle = await screen.findByRole('switch', { name: 'Registro abierto' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(requestBody(fetchMock, 'PATCH /groups/g1')).toEqual({ accessOpen: false });
    expect(screen.getByText(/El registro está cerrado/)).toBeInTheDocument();
  });

  it('regenerates the code only after confirming in the app', async () => {
    const fetchMock = mockApi({
      ...baseHandlers,
      'POST /groups/g1/access-code/regenerate': () => jsonResponse(200, { ...group, accessCode: 'NEW999' }),
    });

    openPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerar código' }));

    const dialog = screen.getByRole('dialog', { name: '¿Regenerar el código de acceso?' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('regenerate'), expect.anything());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerar' }));

    expect(await screen.findByText('NEW999')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a reset temporary password once', async () => {
    const fetchMock = mockApi({
      ...baseHandlers,
      'POST /users/s2/reset-password': () => jsonResponse(200, { temporaryPassword: 'temp-9xk2' }),
    });

    openPage();
    await screen.findByText('Beto Ruiz');
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña de Beto Ruiz' }));
    const dialog = screen.getByRole('dialog', { name: '¿Restablecer la contraseña de Beto Ruiz?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restablecer' }));

    expect(await within(dialog).findByText('temp-9xk2')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar contraseña' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('temp-9xk2'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Listo' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('temp-9xk2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña de Beto Ruiz' }));
    expect(screen.queryByText('temp-9xk2')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/reset-password'))).toHaveLength(1);
  });
});
