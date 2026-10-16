import type { MeResponse } from '@kanbit/shared';
import { screen } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, meFixture, mockApi, renderRoutes } from '../../test/utils';
import { TeamHomePage } from './TeamHomePage';

const routes: RouteObject[] = [{ path: '/team', Component: TeamHomePage }];

const withTeam = (isModerator: boolean): MeResponse => ({
  ...meFixture('STUDENT'),
  memberships: [{ groupId: 'g1', groupName: 'Grupo A', teamId: 't1', teamName: 'Equipo Rojo', isModerator }],
});

const projects = [{ id: 'p1', teamId: 't1', name: 'App de tareas', updatedAt: '2026-10-15T15:00:00.000Z' }];

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

  it('shows the moderator their team and an editable projects panel', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, withTeam(true)),
      'GET /teams/t1/projects': () => jsonResponse(200, projects),
    });

    renderRoutes(routes, ['/team']);

    expect(await screen.findByRole('heading', { name: 'Equipo Rojo' })).toBeInTheDocument();
    expect(screen.getByText(/Eres moderador/)).toBeInTheDocument();
    expect(await screen.findByText('App de tareas')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del nuevo proyecto')).toBeInTheDocument();
  });

  it('shows a plain member the projects read-only', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, withTeam(false)),
      'GET /teams/t1/projects': () => jsonResponse(200, projects),
    });

    renderRoutes(routes, ['/team']);

    expect(await screen.findByText('App de tareas')).toBeInTheDocument();
    expect(screen.queryByText(/Eres moderador/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre del nuevo proyecto')).not.toBeInTheDocument();
  });
});
