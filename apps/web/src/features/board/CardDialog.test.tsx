import { cuid2Id, type BoardResponse } from '@kanbit/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardFixture, cardFixture, STUDENT_ID } from '../../test/board-fixtures';
import { errorResponse, jsonResponse, meFixture, mockApi, renderRoutes, requestBody } from '../../test/utils';
import { BoardPage } from './BoardPage';

const routes: RouteObject[] = [{ path: '/team', element: <BoardPage teamId="t1" /> }];
const STAMP = '2026-10-16T15:00:00.000Z';

type Handler = (init: RequestInit) => Response | Promise<Response>;

function setup(handlers: Record<string, Handler> = {}, board: BoardResponse = boardFixture()) {
  const fetchMock = mockApi({
    'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT')),
    'GET /teams/t1/board': () => jsonResponse(200, board),
    ...handlers,
  });
  renderRoutes(routes, ['/team']);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && String(input).endsWith(path));

const bodies = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string): unknown[] =>
  calls(fetchMock, method, path).map(([, init]) => JSON.parse(String(init?.body)) as unknown);

async function openCard(title: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(title) }));
  return screen.getByRole('dialog', { name: title });
}

const change = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CardDialog: create', () => {
  it('creates a backlog card with a client id and the form fields', async () => {
    const fetchMock = setup({ 'POST /teams/t1/cards': () => jsonResponse(201, cardFixture({ id: 'cnew' })) });

    fireEvent.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva tarjeta' });
    change(within(dialog).getByLabelText('Proyecto'), 'p2');
    change(within(dialog).getByLabelText('Tarea'), '  Página de contacto ');
    change(within(dialog).getByLabelText(/Criterio de terminado/), 'Se envía el formulario');
    change(within(dialog).getByLabelText(/Día estimado/), 'THU');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear tarjeta' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const body = requestBody(fetchMock, 'POST /teams/t1/cards') as Record<string, unknown>;
    expect(body).toEqual({
      id: expect.any(String),
      projectId: 'p2',
      title: 'Página de contacto',
      doneCriteria: 'Se envía el formulario',
      dueWeekday: 'THU',
    });
    expect(cuid2Id.safeParse(body.id).success).toBe(true);
    await waitFor(() => expect(calls(fetchMock, 'GET', '/teams/t1/board')).toHaveLength(2));
  });

  it('asks for the task before sending anything', async () => {
    const fetchMock = setup();

    fireEvent.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva tarjeta' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear tarjeta' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escribe la tarea.');
    expect(calls(fetchMock, 'POST', '/teams/t1/cards')).toHaveLength(0);
  });

  it('re-sends the same id when retrying after a network failure', async () => {
    let attempt = 0;
    const fetchMock = setup({
      'POST /teams/t1/cards': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return jsonResponse(200, cardFixture({ id: 'cnew' }));
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva tarjeta' });
    change(within(dialog).getByLabelText('Tarea'), 'Página de contacto');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear tarjeta' }));
    expect(await within(dialog).findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear tarjeta' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [first, second] = bodies(fetchMock, 'POST', '/teams/t1/cards') as { id: string }[];
    expect(second?.id).toBe(first?.id);
  });
});

describe('CardDialog: edit and delete', () => {
  it('saves edits with expectedUpdatedAt', async () => {
    const fetchMock = setup({ 'PATCH /cards/cmine': () => jsonResponse(200, cardFixture({ id: 'cmine' })) });

    const dialog = await openCard('Login con JWT');
    const form = within(dialog).getByRole('form', { name: 'Editar tarjeta' });
    change(within(form).getByLabelText('Tarea'), 'Login con cookies');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestBody(fetchMock, 'PATCH /cards/cmine')).toEqual({
      title: 'Login con cookies',
      projectId: 'p1',
      doneCriteria: 'El usuario inicia sesión',
      dueWeekday: 'TUE',
      expectedUpdatedAt: STAMP,
    });
  });

  it('explains a conflict and reloads the board', async () => {
    const fetchMock = setup({ 'PATCH /cards/cmine': () => errorResponse(409, 'CARD_CONFLICT') });

    const dialog = await openCard('Login con JWT');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/La tarjeta cambió.*se recargó el tablero/);
    await waitFor(() => expect(calls(fetchMock, 'GET', '/teams/t1/board')).toHaveLength(2));
  });

  it('deletes a backlog card after an in-app confirmation', async () => {
    const fetchMock = setup({ 'DELETE /cards/cmineb': () => new Response(null, { status: 204 }) });

    const dialog = await openCard('Pruebas de API');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar tarjeta' }));
    const confirm = screen.getByRole('dialog', { name: '¿Eliminar la tarjeta?' });
    expect(calls(fetchMock, 'DELETE', '/cards/cmineb')).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls(fetchMock, 'DELETE', '/cards/cmineb')).toHaveLength(1);
  });

  it('offers delete only in the backlog', async () => {
    setup();

    const dialog = await openCard('Login con JWT');

    expect(within(dialog).queryByRole('button', { name: 'Eliminar tarjeta' })).not.toBeInTheDocument();
  });

  it("shows another member's card read-only", async () => {
    setup();

    const dialog = await openCard('Pantalla de tablero');

    expect(within(dialog).getByText('Se ve el tablero')).toBeInTheDocument();
    expect(within(dialog).queryByRole('form')).not.toBeInTheDocument();
  });
});

describe('CardDialog: "Mover a"', () => {
  it('moves an own card to the end of the target cell', async () => {
    const board = boardFixture();
    board.cards.push(cardFixture({ id: 'cdoing', status: 'DOING', assigneeId: STUDENT_ID, position: 'a5' }));
    const fetchMock = setup({ 'POST /cards/cmine/move': () => jsonResponse(200, cardFixture({ id: 'cmine' })) }, board);

    const dialog = await openCard('Login con JWT');
    const form = within(dialog).getByRole('form', { name: 'Mover a' });
    change(within(form).getByLabelText('Columna'), 'DOING');
    const rowOptions = within(within(form).getByLabelText('Fila')).getAllByRole('option');
    expect(rowOptions.map((option) => option.textContent)).toEqual(['Luis Alumno']);
    fireEvent.click(within(form).getByRole('button', { name: 'Mover' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestBody(fetchMock, 'POST /cards/cmine/move')).toEqual({
      status: 'DOING',
      assigneeId: STUDENT_ID,
      position: 'a6',
      dueWeekday: 'TUE',
      doneCriteria: 'El usuario inicia sesión',
      expectedUpdatedAt: STAMP,
    });
  });

  it('requires the day and done criterion to take a card out of the backlog', async () => {
    const fetchMock = setup({ 'POST /cards/cfree1/move': () => jsonResponse(200, cardFixture({ id: 'cfree1' })) });

    const dialog = await openCard('Diseñar logo');
    const form = within(dialog).getByRole('form', { name: 'Mover a' });
    change(within(form).getByLabelText('Columna'), 'TODO');
    fireEvent.click(within(form).getByRole('button', { name: 'Mover' }));

    expect(within(form).getByRole('alert')).toHaveTextContent(/Elige el día estimado/);
    expect(within(form).getByRole('alert')).toHaveTextContent(/Escribe el criterio de terminado/);
    expect(calls(fetchMock, 'POST', '/cards/cfree1/move')).toHaveLength(0);

    change(within(form).getByLabelText(/Día estimado/), 'FRI');
    change(within(form).getByLabelText(/Criterio de terminado/), 'Logo aprobado');
    fireEvent.click(within(form).getByRole('button', { name: 'Mover' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestBody(fetchMock, 'POST /cards/cfree1/move')).toEqual({
      status: 'TODO',
      assigneeId: STUDENT_ID,
      position: 'a1',
      dueWeekday: 'FRI',
      doneCriteria: 'Logo aprobado',
      expectedUpdatedAt: STAMP,
    });
  });

  it('can send an own card back to the unassigned backlog', async () => {
    const fetchMock = setup({ 'POST /cards/cmine/move': () => jsonResponse(200, cardFixture({ id: 'cmine' })) });

    const dialog = await openCard('Login con JWT');
    const form = within(dialog).getByRole('form', { name: 'Mover a' });
    change(within(form).getByLabelText('Columna'), 'BACKLOG');
    change(within(form).getByLabelText('Fila'), 'unassigned');
    fireEvent.click(within(form).getByRole('button', { name: 'Mover' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestBody(fetchMock, 'POST /cards/cmine/move')).toEqual({
      status: 'BACKLOG',
      assigneeId: null,
      position: 'a2',
      expectedUpdatedAt: STAMP,
    });
  });

  it.each([
    ['FORBIDDEN', 403, 'No tienes permiso para realizar esta acción.'],
    ['CARD_INCOMPLETE', 400, 'Para salir del Backlog la tarjeta necesita responsable'],
    ['CARD_CONFLICT', 409, 'se recargó el tablero'],
  ])('shows the %s error in Spanish', async (code, status, message) => {
    setup({ 'POST /cards/cmine/move': () => errorResponse(status, code) });

    const dialog = await openCard('Login con JWT');
    const form = within(dialog).getByRole('form', { name: 'Mover a' });
    change(within(form).getByLabelText('Columna'), 'DONE');
    fireEvent.click(within(form).getByRole('button', { name: 'Mover' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(message);
  });
});
