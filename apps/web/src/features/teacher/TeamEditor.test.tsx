import type { GroupStudent, TeamResponse, TeamSummary } from '@kanbit/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, mockApi, renderRoutes, requestBody } from '../../test/utils';
import { TeamEditor } from './TeamEditor';

const students: GroupStudent[] = [
  { id: 's1', name: 'Ana López', username: 'a001', teamId: 't1' },
  { id: 's2', name: 'Beto Ruiz', username: 'a002', teamId: null },
  { id: 's3', name: 'Carla Méndez', username: 'a003', teamId: 't2' },
];

const teams: TeamSummary[] = [
  { id: 't1', name: 'Equipo Rojo', moderatorId: 's1', memberCount: 1 },
  { id: 't2', name: 'Equipo Azul', moderatorId: 's3', memberCount: 1 },
];

const member = (userId: string, name: string, rowOrder: number, isModerator = false) => ({
  userId,
  name,
  username: students.find((student) => student.id === userId)?.username ?? '',
  isModerator,
  rowOrder,
});

const team: TeamResponse = {
  id: 't1',
  groupId: 'g1',
  name: 'Equipo Rojo',
  moderatorId: 's1',
  updatedAt: '2026-10-15T15:00:00.000Z',
  members: [member('s1', 'Ana López', 0, true)],
};

const renderEditor = () =>
  renderRoutes([{ path: '/', element: <TeamEditor groupId="g1" team={team} students={students} teams={teams} /> }]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TeamEditor', () => {
  it('saves the selected members in order, moving a student from another team', async () => {
    const fetchMock = mockApi({
      'GET /teams/t1/projects': () => jsonResponse(200, []),
      'PUT /teams/t1/members': () =>
        jsonResponse(200, {
          ...team,
          members: [member('s1', 'Ana López', 0, true), member('s3', 'Carla Méndez', 1), member('s2', 'Beto Ruiz', 2)],
        }),
    });

    renderEditor();
    expect(screen.getByText(/se moverá a este equipo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Carla Méndez (en Equipo Azul)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Beto Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar integrantes' }));

    expect(await screen.findByText('Equipo guardado.')).toBeInTheDocument();
    expect(requestBody(fetchMock, 'PUT /teams/t1/members')).toEqual({ userIds: ['s1', 's3', 's2'] });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/moderator'), expect.anything());
  });

  it('designates a new moderator after saving the members', async () => {
    const saved = { ...team, members: [member('s1', 'Ana López', 0, true), member('s2', 'Beto Ruiz', 1)] };
    const fetchMock = mockApi({
      'GET /teams/t1/projects': () => jsonResponse(200, []),
      'PUT /teams/t1/members': () => jsonResponse(200, saved),
      'PATCH /teams/t1/moderator': () =>
        jsonResponse(200, { ...saved, moderatorId: 's2', members: [member('s1', 'Ana López', 0), member('s2', 'Beto Ruiz', 1, true)] }),
    });

    renderEditor();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Beto Ruiz' }));
    const moderator = screen.getByRole('group', { name: 'Moderador' });
    expect(within(moderator).getByRole('radio', { name: 'Ana López' })).toBeChecked();
    fireEvent.click(within(moderator).getByRole('radio', { name: 'Beto Ruiz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar integrantes' }));

    await waitFor(() => expect(requestBody(fetchMock, 'PATCH /teams/t1/moderator')).toEqual({ userId: 's2' }));
    expect(requestBody(fetchMock, 'PUT /teams/t1/members')).toEqual({ userIds: ['s1', 's2'] });
  });

  it('explains why a team with cards cannot be deleted', async () => {
    mockApi({
      'GET /teams/t1/projects': () => jsonResponse(200, []),
      'DELETE /teams/t1': () => errorResponse(409, 'TEAM_HAS_CARDS'),
    });

    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar equipo' }));
    const dialog = screen.getByRole('dialog', { name: '¿Eliminar el equipo Equipo Rojo?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No se puede eliminar un equipo que ya tiene tarjetas.',
    );
  });
});
