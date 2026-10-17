import type { GroupResponse, GroupSummaryResponse } from '@kanbit/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoutes, requestBody } from '../../test/utils';
import { GroupsPage } from './GroupsPage';

const routes: RouteObject[] = [
  { path: '/teacher', Component: GroupsPage },
  { path: '/teacher/groups/:groupId', element: <p>Detalle del grupo</p> },
];

const groupA: GroupSummaryResponse = {
  id: 'g1',
  name: 'Programación Web 5A',
  accessCode: 'ABC123',
  accessOpen: true,
  teamCount: 2,
  studentCount: 9,
  updatedAt: '2026-10-15T15:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GroupsPage', () => {
  it('lists my groups with their team and student counts', async () => {
    mockApi({ 'GET /groups': () => jsonResponse(200, [groupA]) });

    renderRoutes(routes, ['/teacher']);

    const link = await screen.findByRole('link', { name: /Programación Web 5A/ });
    expect(link).toHaveAttribute('href', '/teacher/groups/g1');
    expect(within(link).getByText('2 equipos · 9 alumnos')).toBeInTheDocument();
    expect(within(link).getByText('Registro abierto')).toBeInTheDocument();
  });

  it('shows an empty state when there are no groups', async () => {
    mockApi({ 'GET /groups': () => jsonResponse(200, []) });

    renderRoutes(routes, ['/teacher']);

    expect(await screen.findByText(/Todavía no tienes grupos/)).toBeInTheDocument();
  });

  it('creates a group and opens it', async () => {
    const created: GroupResponse = {
      id: 'g2',
      name: 'Bases de datos 3B',
      accessCode: 'XYZ789',
      accessOpen: true,
      updatedAt: '2026-10-16T15:00:00.000Z',
    };
    const fetchMock = mockApi({
      'GET /groups': () => jsonResponse(200, [groupA]),
      'POST /groups': () => jsonResponse(201, created),
    });

    const { router } = renderRoutes(routes, ['/teacher']);
    fireEvent.change(await screen.findByLabelText('Nombre del grupo'), { target: { value: '  Bases de datos 3B ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear grupo' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/teacher/groups/g2'));
    expect(requestBody(fetchMock, 'POST /groups')).toEqual({ name: 'Bases de datos 3B' });
  });

  it('asks for a name before creating a group', async () => {
    const fetchMock = mockApi({ 'GET /groups': () => jsonResponse(200, []) });

    renderRoutes(routes, ['/teacher']);
    await screen.findByText(/Todavía no tienes grupos/);
    fireEvent.click(screen.getByRole('button', { name: 'Crear grupo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el nombre del grupo');
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/groups'), expect.objectContaining({ method: 'POST' }));
  });
});
