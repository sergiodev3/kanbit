import type { MeResponse } from '@kanbit/shared';
import { screen, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardFixture, MODERATOR_ID, STUDENT_ID } from '../../test/board-fixtures';
import { jsonResponse, meFixture, mockApi, renderRoutes } from '../../test/utils';
import { TeamHomePage } from './TeamHomePage';

const routes: RouteObject[] = [{ path: '/team', Component: TeamHomePage }];

const withTeam = (isModerator: boolean): MeResponse => ({
  ...meFixture('STUDENT', { id: isModerator ? MODERATOR_ID : STUDENT_ID }),
  memberships: [{ groupId: 'g1', groupName: 'Grupo A', teamId: 't1', teamName: 'Equipo Rojo', isModerator }],
});

const projects = [{ id: 'p1', teamId: 't1', name: 'App de tareas', updatedAt: '2026-10-15T15:00:00.000Z' }];

const teamHandlers = (isModerator: boolean) => ({
  'GET /auth/me': () => jsonResponse(200, withTeam(isModerator)),
  'GET /teams/t1/board': () => jsonResponse(200, boardFixture()),
  'GET /teams/t1/projects': () => jsonResponse(200, projects),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TeamHomePage', () => {
  it('tells a student without a team to wait for the teacher', async () => {
    mockApi({ 'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT')) });

    renderRoutes(routes, ['/team']);

    expect(await screen.findByText('Tu docente todavía no te asigna a un equipo.')).toBeInTheDocument();
    expect(screen.getByText('Grupo A')).toBeInTheDocument();
  });

  it('shows the team board to a member', async () => {
    mockApi(teamHandlers(false));

    renderRoutes(routes, ['/team']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Equipo Rojo' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Luis Alumno · Por hacer' })).toHaveTextContent('Login con JWT');
  });

  it('shows the moderator an editable projects panel next to the board', async () => {
    mockApi(teamHandlers(true));

    renderRoutes(routes, ['/team']);

    expect(await screen.findByText(/Eres moderador/)).toBeInTheDocument();
    const projectsPanel = await screen.findByRole('region', { name: 'Proyectos' });
    expect(await within(projectsPanel).findByText('App de tareas')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del nuevo proyecto')).toBeInTheDocument();
  });

  it('shows a plain member the projects read-only', async () => {
    mockApi(teamHandlers(false));

    renderRoutes(routes, ['/team']);

    const projectsPanel = await screen.findByRole('region', { name: 'Proyectos' });
    expect(await within(projectsPanel).findByText('App de tareas')).toBeInTheDocument();
    expect(screen.queryByText(/Eres moderador/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre del nuevo proyecto')).not.toBeInTheDocument();
  });
});
