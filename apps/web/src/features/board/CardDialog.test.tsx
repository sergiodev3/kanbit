import { cuid2Id, type BoardResponse } from '@kanbit/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/query-client';
import {
  boardFixture,
  cardFixture,
  MODERATOR_ID,
  openSprintBoardFixture,
  SPRINT_ID,
  STUDENT_ID,
} from '../../test/board-fixtures';
import { errorResponse, jsonResponse, meFixture, mockApi, renderRoutes, requestBody } from '../../test/utils';
import { buildRows, viewerOf } from './board-model';
import { BoardPage } from './BoardPage';
import { CardDialog, type BoardContext } from './CardDialog';

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

const optionLabels = (select: HTMLElement) => within(select).getAllByRole('option').map((option) => option.textContent);

/** The open-sprint board with the student's Por hacer card (`cmine`) already validated by the moderator. */
function validatedMineBoard(): BoardResponse {
  const board = openSprintBoardFixture();
  return {
    ...board,
    cards: board.cards.map((card) => (card.id === 'cmine' ? { ...card, validated: true, validatedById: MODERATOR_ID } : card)),
  };
}

const SPRINT_HINT = 'Inicia un sprint para sacar tarjetas del Backlog.';
const VALIDATION_HINT = 'El moderador debe validar la tarjeta para pasarla a En marcha.';

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
    // The save button sits after "Mover a", outside the form, and submits it through its `form` attribute.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

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
    const board = validatedMineBoard();
    board.cards.push(cardFixture({ id: 'cdoing', status: 'DOING', assigneeId: STUDENT_ID, position: 'a5', sprintId: SPRINT_ID }));
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
    const fetchMock = setup(
      { 'POST /cards/cfree1/move': () => jsonResponse(200, cardFixture({ id: 'cfree1' })) },
      openSprintBoardFixture(),
    );

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

  it('opens prefilled with a drag target and asks for the missing fields first', async () => {
    const fetchMock = mockApi({ 'POST /cards/cfree1/move': () => jsonResponse(200, cardFixture({ id: 'cfree1' })) });
    const board = openSprintBoardFixture();
    const card = board.cards.find((candidate) => candidate.id === 'cfree1');
    if (!card) throw new Error('fixture');
    const context: BoardContext = { board, rows: buildRows(board), viewer: viewerOf(board, STUDENT_ID), online: true };
    const onClose = vi.fn();

    render(
      <QueryClientProvider client={createQueryClient()}>
        <CardDialog context={context} card={card} moveTarget={{ status: 'TODO', assigneeId: STUDENT_ID }} onClose={onClose} />
      </QueryClientProvider>,
    );

    const form = screen.getByRole('form', { name: 'Mover a' });
    expect(within(form).getByLabelText('Columna')).toHaveValue('TODO');
    expect(within(form).getByLabelText('Fila')).toHaveValue(STUDENT_ID);
    expect(within(form).getByText(/completa el día estimado y el criterio de terminado/)).toBeInTheDocument();
    // The move section comes first, so the dialog's initial focus lands on it.
    expect(within(form).getByLabelText('Columna')).toHaveFocus();

    change(within(form).getByLabelText(/Día estimado/), 'MON');
    change(within(form).getByLabelText(/Criterio de terminado/), 'Logo aprobado');
    fireEvent.click(within(form).getByRole('button', { name: 'Mover' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requestBody(fetchMock, 'POST /cards/cfree1/move')).toMatchObject({
      status: 'TODO',
      assigneeId: STUDENT_ID,
      dueWeekday: 'MON',
      doneCriteria: 'Logo aprobado',
    });
  });

  it.each([
    ['FORBIDDEN', 403, 'No tienes permiso para realizar esta acción.'],
    ['CARD_INCOMPLETE', 400, 'Para salir del Backlog la tarjeta necesita responsable'],
    ['CARD_CONFLICT', 409, 'se recargó el tablero'],
  ])('shows the %s error in Spanish', async (code, status, message) => {
    setup({ 'POST /cards/cmine/move': () => errorResponse(status, code) }, validatedMineBoard());

    const dialog = await openCard('Login con JWT');
    const form = within(dialog).getByRole('form', { name: 'Mover a' });
    change(within(form).getByLabelText('Columna'), 'DONE');
    fireEvent.click(within(form).getByRole('button', { name: 'Mover' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(message);
  });

  it('offers every column for a validated sprint card, without hints', async () => {
    setup({}, validatedMineBoard());

    const form = within(await openCard('Login con JWT')).getByRole('form', { name: 'Mover a' });

    expect(optionLabels(within(form).getByLabelText('Columna'))).toEqual(['Backlog', 'Por hacer', 'En marcha', 'Terminado']);
    expect(within(form).queryByText(SPRINT_HINT)).not.toBeInTheDocument();
    expect(within(form).queryByText(VALIDATION_HINT)).not.toBeInTheDocument();
  });

  it('hides En marcha and Terminado until the moderator validates the card, and says why', async () => {
    setup({}, openSprintBoardFixture());

    const form = within(await openCard('Login con JWT')).getByRole('form', { name: 'Mover a' });

    const columns = within(form).getByLabelText('Columna');
    expect(optionLabels(columns)).toEqual(['Backlog', 'Por hacer']);
    expect(columns).toHaveAccessibleDescription(VALIDATION_HINT);
    expect(within(form).queryByText(SPRINT_HINT)).not.toBeInTheDocument();
  });

  it('keeps a backlog card in the backlog while no sprint is open, and says why', async () => {
    setup();

    const form = within(await openCard('Diseñar logo')).getByRole('form', { name: 'Mover a' });

    const columns = within(form).getByLabelText('Columna');
    expect(optionLabels(columns)).toEqual(['Backlog']);
    expect(columns).toHaveAccessibleDescription(SPRINT_HINT);
  });

  it('only offers the backlog to a card outside it that has no sprint while none is open', async () => {
    const fetchMock = setup({ 'POST /cards/cmine/move': () => jsonResponse(200, cardFixture({ id: 'cmine' })) });

    const form = within(await openCard('Login con JWT')).getByRole('form', { name: 'Mover a' });

    const columns = within(form).getByLabelText('Columna');
    expect(optionLabels(columns)).toEqual(['Backlog']);
    expect(columns).toHaveValue('BACKLOG');
    expect(within(form).getByText(SPRINT_HINT)).toBeInTheDocument();

    fireEvent.click(within(form).getByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestBody(fetchMock, 'POST /cards/cmine/move')).toMatchObject({ status: 'BACKLOG', assigneeId: STUDENT_ID });
  });
});

describe('CardDialog: "Validar"', () => {
  function renderCard(cardId: string, { viewerId = MODERATOR_ID, online = true } = {}) {
    const board = openSprintBoardFixture();
    const card = board.cards.find((candidate) => candidate.id === cardId);
    if (!card) throw new Error('fixture');
    const context: BoardContext = { board, rows: buildRows(board), viewer: viewerOf(board, viewerId), online };
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <CardDialog context={context} card={card} onClose={onClose} />
      </QueryClientProvider>,
    );
    return { onClose, dialog: screen.getByRole('dialog', { name: card.title }) };
  }

  it('lets the moderator validate a Por hacer card with expectedUpdatedAt', async () => {
    const fetchMock = mockApi({
      'POST /cards/cmine/validate': () => jsonResponse(200, cardFixture({ id: 'cmine', status: 'TODO', validated: true })),
    });
    const { dialog, onClose } = renderCard('cmine');

    expect(within(dialog).getByText('Por validar')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Validar' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requestBody(fetchMock, 'POST /cards/cmine/validate')).toEqual({ expectedUpdatedAt: STAMP });
  });

  it('shows a validated card as "Validada", without the button', () => {
    const { dialog } = renderCard('cmod');

    expect(within(dialog).getByText('Validada')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Validar' })).not.toBeInTheDocument();
  });

  it('offers no validation for a Backlog card', () => {
    const { dialog } = renderCard('cfree1');

    expect(within(dialog).queryByRole('button', { name: 'Validar' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Por validar')).not.toBeInTheDocument();
  });

  it('is moderator-only: members see the state but cannot validate', () => {
    const { dialog } = renderCard('cmine', { viewerId: STUDENT_ID });

    expect(within(dialog).getByText('Por validar')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Validar' })).not.toBeInTheDocument();
  });

  it('explains a card that already left Por hacer', async () => {
    mockApi({ 'POST /cards/cmine/validate': () => errorResponse(409, 'CARD_NOT_IN_TODO') });
    const { dialog, onClose } = renderCard('cmine');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Validar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Solo se pueden validar tarjetas que están en Por hacer.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cannot validate while offline', () => {
    const { dialog } = renderCard('cmine', { online: false });

    expect(within(dialog).getByRole('button', { name: 'Validar' })).toBeDisabled();
  });
});

describe('CardDialog: validated card and save button', () => {
  function renderCard(cardId: string, viewerId: string, board: BoardResponse = validatedMineBoard()) {
    const card = board.cards.find((candidate) => candidate.id === cardId);
    if (!card) throw new Error('fixture');
    const context: BoardContext = { board, rows: buildRows(board), viewer: viewerOf(board, viewerId), online: true };
    render(
      <QueryClientProvider client={createQueryClient()}>
        <CardDialog context={context} card={card} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    return screen.getByRole('dialog', { name: card.title });
  }

  it("shows the assignee a validated card's content read-only, and says the moderator edits it", () => {
    const dialog = renderCard('cmine', STUDENT_ID);

    expect(within(dialog).queryByRole('form', { name: 'Editar tarjeta' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Solo el moderador puede editar una tarjeta validada.')).toBeInTheDocument();
    expect(within(dialog).getByText('El usuario inicia sesión')).toBeInTheDocument();
    // The assignee keeps moving it.
    expect(within(dialog).getByRole('form', { name: 'Mover a' })).toBeInTheDocument();
  });

  it('keeps the edit form for the moderator on a validated card', () => {
    const dialog = renderCard('cmine', MODERATOR_ID);

    expect(within(dialog).getByRole('form', { name: 'Editar tarjeta' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Solo el moderador puede editar una tarjeta validada.')).not.toBeInTheDocument();
  });

  it('keeps the edit form for the assignee until the card is validated', () => {
    const dialog = renderCard('cmine', STUDENT_ID, openSprintBoardFixture());

    expect(within(dialog).getByRole('form', { name: 'Editar tarjeta' })).toBeInTheDocument();
  });

  it('puts "Guardar cambios" after "Mover a" and before "Eliminar"', () => {
    const dialog = renderCard('cmineb', STUDENT_ID, openSprintBoardFixture());
    const save = within(dialog).getByRole('button', { name: 'Guardar cambios' });
    const move = within(dialog).getByRole('form', { name: 'Mover a' });
    const remove = within(dialog).getByRole('button', { name: 'Eliminar tarjeta' });

    expect(move.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still saves from the relocated button', async () => {
    const fetchMock = mockApi({ 'PATCH /cards/cmine': () => jsonResponse(200, cardFixture({ id: 'cmine' })) });
    const dialog = renderCard('cmine', STUDENT_ID, openSprintBoardFixture());

    change(within(dialog).getByLabelText('Tarea'), 'Login con cookies');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(requestBody(fetchMock, 'PATCH /cards/cmine')).toMatchObject({ title: 'Login con cookies' }));
  });
});
