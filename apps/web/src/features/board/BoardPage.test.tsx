import type { BoardResponse } from '@kanbit/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  boardFixture,
  cardFixture,
  MODERATOR_ID,
  openSprintBoardFixture,
  SPRINT_ID,
  STUDENT_ID,
} from '../../test/board-fixtures';
import { jsonResponse, meFixture, mockApi, renderRoutes, stubMatchMedia } from '../../test/utils';
import { BoardPage } from './BoardPage';

const studentRoutes: RouteObject[] = [{ path: '/team', element: <BoardPage teamId="t1" /> }];
const teacherRoutes: RouteObject[] = [{ path: '/board', element: <BoardPage teamId="t1" readOnly /> }];

function mockBoard(board: BoardResponse = boardFixture(), role: 'STUDENT' | 'TEACHER' = 'STUDENT') {
  return mockApi({
    'GET /auth/me': () => jsonResponse(200, meFixture(role)),
    'GET /teams/t1/board': () => jsonResponse(200, board),
  });
}

const cell = (name: string) => screen.getByRole('group', { name });
const cardTitles = (element: HTMLElement) =>
  within(element)
    .queryAllByRole('listitem')
    .map((item) => item.querySelector('[data-card-title]')?.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('BoardPage', () => {
  it('renders the rows × columns grid with sorted cells', async () => {
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Equipo Rojo' })).toBeInTheDocument();
    expect(screen.getByText('Sin sprint abierto')).toBeInTheDocument();
    expect(cardTitles(cell('Sin asignar · Backlog'))).toEqual(['Escribir README', 'Diseñar logo']);
    expect(cardTitles(cell('Luis Alumno · Por hacer'))).toEqual(['Login con JWT']);
    expect(cardTitles(cell('Ana López · En marcha'))).toEqual(['Pantalla de tablero']);
    expect(cardTitles(cell('Carla Díaz · Terminado'))).toEqual([]);
    for (const label of ['Backlog', 'Por hacer', 'En marcha', 'Terminado']) {
      expect(screen.getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
  });

  it('shows the card details on the tile', async () => {
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    const tile = await screen.findByRole('button', { name: /Login con JWT/ });
    expect(tile).toHaveTextContent('App de tareas');
    expect(tile).toHaveTextContent('El usuario inicia sesión');
    expect(tile).toHaveTextContent('Martes');
    expect(tile).toHaveTextContent('Luis Alumno');
  });

  it('marks pending validation, due today and overdue cards from the server day, with visible labels', async () => {
    // Tuesday of the sprint week: Monday cards are late, Tuesday cards are due today.
    const board = openSprintBoardFixture({ today: { date: '2026-10-20', weekday: 'TUE' } });
    board.cards.push(
      cardFixture({
        id: 'clate',
        title: 'Modelo de datos',
        status: 'DOING',
        sprintId: SPRINT_ID,
        assigneeId: STUDENT_ID,
        doneCriteria: 'Migración aplicada',
        dueWeekday: 'MON',
        validated: true,
        validatedById: MODERATOR_ID,
      }),
    );
    mockBoard(board);

    renderRoutes(studentRoutes, ['/team']);

    const dueToday = await screen.findByRole('button', { name: /Login con JWT/ });
    expect(dueToday).toHaveAccessibleName(/Por validar/);
    expect(dueToday).toHaveAccessibleName(/Vence hoy/);
    expect(dueToday).not.toHaveAccessibleName(/Atrasada/);
    expect(dueToday).toHaveClass('border-dashed');

    const late = screen.getByRole('button', { name: /Modelo de datos/ });
    expect(late).toHaveAccessibleName(/Atrasada/);
    expect(late).not.toHaveAccessibleName(/Por validar|Vence hoy/);
    expect(late).not.toHaveClass('border-dashed');

    // Wednesday's card is not due yet; finished and Backlog cards never get a state.
    for (const title of ['Pantalla de tablero', 'Configurar CI', 'Diseñar logo', 'Pruebas de API']) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).not.toHaveAccessibleName(
        /Por validar|Vence hoy|Atrasada/,
      );
    }
  });

  it('shows the open sprint in the header', async () => {
    mockBoard(
      boardFixture({
        sprint: {
          id: 's1',
          number: 3,
          startDate: '2026-10-19',
          endDate: '2026-10-23',
          goal: 'Terminar el login',
          status: 'OPEN',
          updatedAt: '2026-10-16T15:00:00.000Z',
        },
      }),
    );

    renderRoutes(studentRoutes, ['/team']);

    expect(await screen.findByText(/Sprint 3/)).toBeInTheDocument();
    expect(screen.getByText(/Terminar el login/)).toBeInTheDocument();
    expect(screen.queryByText('Sin sprint abierto')).not.toBeInTheDocument();
  });

  it('filters to the viewer row with "Solo mis tarjetas"', async () => {
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    const toggle = await screen.findByRole('checkbox', { name: 'Solo mis tarjetas' });
    fireEvent.click(toggle);

    expect(screen.getByText('Login con JWT')).toBeInTheDocument();
    expect(screen.queryByText('Pantalla de tablero')).not.toBeInTheDocument();
    expect(screen.queryByText('Diseñar logo')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Pantalla de tablero')).toBeInTheDocument();
  });

  it('offers the moderator the sprint controls in the header', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT', { id: MODERATOR_ID })),
      'GET /teams/t1/board': () => jsonResponse(200, boardFixture()),
    });

    renderRoutes(studentRoutes, ['/team']);

    expect(await screen.findByRole('button', { name: 'Iniciar sprint de la semana' })).toBeEnabled();
  });

  it('offers "Nueva tarjeta" to members', async () => {
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    expect(await screen.findByRole('button', { name: 'Nueva tarjeta' })).toBeEnabled();
  });

  it('is read-only for the teacher: no create, no filter, no forms in the card dialog', async () => {
    mockBoard(boardFixture(), 'TEACHER');

    renderRoutes(teacherRoutes, ['/board']);

    fireEvent.click(await screen.findByRole('button', { name: /Login con JWT/ }));
    const dialog = screen.getByRole('dialog', { name: 'Login con JWT' });
    expect(within(dialog).getByText('El usuario inicia sesión')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Mover' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva tarjeta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Solo mis tarjetas' })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
  });

  it('disables writes while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    expect(await screen.findByRole('button', { name: 'Nueva tarjeta' })).toBeDisabled();
    expect(screen.getByText(/Sin conexión: no puedes crear, editar ni mover tarjetas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Login con JWT/ }));
    const dialog = screen.getByRole('dialog', { name: 'Login con JWT' });
    expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Mover' })).toBeDisabled();
  });

  it('shows one row per tab on narrow screens, starting with the viewer row', async () => {
    stubMatchMedia(true);
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    const mine = await screen.findByRole('tab', { name: 'Luis Alumno' });
    expect(mine).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Sin asignar',
      'Ana López',
      'Luis Alumno',
      'Carla Díaz',
    ]);
    expect(cardTitles(cell('Luis Alumno · Por hacer'))).toEqual(['Login con JWT']);
    expect(screen.queryByRole('group', { name: 'Sin asignar · Backlog' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Sin asignar' }));
    expect(cardTitles(cell('Sin asignar · Backlog'))).toEqual(['Escribir README', 'Diseñar logo']);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sin asignar' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Ana López' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Ana López' })).toHaveFocus();
  });

  it('marks the moderator row', async () => {
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    expect(await screen.findByRole('rowheader', { name: /Ana López.*moderador/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Luis Alumno' })).toBeInTheDocument();
  });

  it('offers a drag handle only on the cards the viewer may move', async () => {
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    await screen.findByText('Login con JWT');
    const handles = screen.getAllByRole('button', { name: 'Arrastrar tarjeta' });
    expect(handles.map((handle) => handle.closest('li')?.querySelector('[data-card-title]')?.textContent).sort()).toEqual(
      ['Diseñar logo', 'Escribir README', 'Login con JWT', 'Pruebas de API'],
    );
    expect(handles[0]).toHaveAccessibleDescription(/Para tomar una tarjeta/);
  });

  it('picks a card up from the keyboard and cancels with Escape, announcing in Spanish', async () => {
    const fetchMock = mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    await screen.findByText('Login con JWT');
    const handle = within(cell('Luis Alumno · Por hacer')).getByRole('button', { name: 'Arrastrar tarjeta' });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });

    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });

    expect(await screen.findByText('Se canceló el movimiento de «Login con JWT».')).toBeInTheDocument();
    expect(handle).not.toHaveAttribute('aria-pressed', 'true');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('offers a drag handle on every card to the moderator', async () => {
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT', { id: 'mod1', name: 'Ana López' })),
      'GET /teams/t1/board': () => jsonResponse(200, boardFixture()),
    });

    renderRoutes(studentRoutes, ['/team']);

    await screen.findByText('Login con JWT');
    expect(screen.getAllByRole('button', { name: 'Arrastrar tarjeta' })).toHaveLength(6);
  });

  it('has no drag handles in the read-only teacher view', async () => {
    mockBoard(boardFixture(), 'TEACHER');

    renderRoutes(teacherRoutes, ['/board']);

    await screen.findByText('Login con JWT');
    expect(screen.queryByRole('button', { name: 'Arrastrar tarjeta' })).not.toBeInTheDocument();
  });

  it('has no drag handles while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockBoard();

    renderRoutes(studentRoutes, ['/team']);

    await screen.findByText('Login con JWT');
    expect(screen.queryByRole('button', { name: 'Arrastrar tarjeta' })).not.toBeInTheDocument();
  });

  it('polls the board every 10 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockBoard();
    const boardCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/teams/t1/board'));

    renderRoutes(studentRoutes, ['/team']);
    await screen.findByText('Login con JWT');
    expect(boardCalls()).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    await waitFor(() => expect(boardCalls()).toHaveLength(2));
  });
});
