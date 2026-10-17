import type { ProjectResponse } from '@kanbit/shared';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoutes, requestBody } from '../../test/utils';
import { ProjectsPanel } from './ProjectsPanel';

const project = (id: string, name: string): ProjectResponse => ({
  id,
  teamId: 't1',
  name,
  updatedAt: '2026-10-15T15:00:00.000Z',
});

const renderPanel = (canEdit: boolean) =>
  renderRoutes([{ path: '/', element: <ProjectsPanel teamId="t1" canEdit={canEdit} /> }]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProjectsPanel', () => {
  it('lets a moderator add a project', async () => {
    const projects = [project('p1', 'App de tareas')];
    const fetchMock = mockApi({
      'GET /teams/t1/projects': () => jsonResponse(200, projects),
      'POST /teams/t1/projects': () => {
        projects.push(project('p2', 'Sitio web'));
        return jsonResponse(201, projects[1]);
      },
    });

    renderPanel(true);
    expect(await screen.findByText('App de tareas')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre del nuevo proyecto'), { target: { value: 'Sitio web' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar proyecto' }));

    expect(await screen.findByText('Sitio web')).toBeInTheDocument();
    expect(requestBody(fetchMock, 'POST /teams/t1/projects')).toEqual({ name: 'Sitio web' });
    expect(screen.getByLabelText('Nombre del nuevo proyecto')).toHaveValue('');
  });

  it('renames a project', async () => {
    let current = project('p1', 'App de tareas');
    const fetchMock = mockApi({
      'GET /teams/t1/projects': () => jsonResponse(200, [current]),
      'PATCH /projects/p1': () => {
        current = project('p1', 'App de pendientes');
        return jsonResponse(200, current);
      },
    });

    renderPanel(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar nombre de App de tareas' }));
    fireEvent.change(screen.getByLabelText('Nombre del proyecto'), { target: { value: 'App de pendientes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(await screen.findByText('App de pendientes')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre del proyecto')).not.toBeInTheDocument();
    expect(requestBody(fetchMock, 'PATCH /projects/p1')).toEqual({ name: 'App de pendientes' });
  });

  it('shows plain members the list read-only', async () => {
    mockApi({ 'GET /teams/t1/projects': () => jsonResponse(200, [project('p1', 'App de tareas')]) });

    renderPanel(false);

    expect(await screen.findByText('App de tareas')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
