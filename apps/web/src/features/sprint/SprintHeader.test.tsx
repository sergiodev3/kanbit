import type { BoardResponse } from '@kanbit/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/query-client';
import { boardFixture, MODERATOR_ID, openSprintBoardFixture, STUDENT_ID } from '../../test/board-fixtures';
import { errorResponse, jsonResponse, mockApi } from '../../test/utils';
import { viewerOf } from '../board/board-model';
import { SprintHeader } from './SprintHeader';

function renderHeader(board: BoardResponse, viewerId: string | null, { online = true } = {}) {
  const viewer = viewerId ? viewerOf(board, viewerId) : null;
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SprintHeader board={board} viewer={viewer} online={online} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SprintHeader: no open sprint', () => {
  it('lets the moderator start the week sprint', () => {
    renderHeader(boardFixture(), MODERATOR_ID);

    expect(screen.getByText('Sin sprint abierto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sprint de la semana' })).toBeEnabled();
  });

  it('shows members the state without actions', () => {
    renderHeader(boardFixture(), STUDENT_ID);

    expect(screen.getByText('Sin sprint abierto')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('SprintHeader: open sprint', () => {
  it('shows the sprint number, its Monday–Friday dates and the goal', () => {
    renderHeader(openSprintBoardFixture(), STUDENT_ID);

    expect(screen.getByText('Sprint 3 · lun 19 – vie 23 oct')).toBeInTheDocument();
    expect(screen.getByText('Meta: Terminar el login')).toBeInTheDocument();
    expect(screen.queryByText('Sin sprint abierto')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names both months when the week spans two', () => {
    const board = openSprintBoardFixture();
    const sprint = board.sprint && { ...board.sprint, startDate: '2026-09-28', endDate: '2026-10-02' };

    renderHeader({ ...board, sprint }, null);

    expect(screen.getByText('Sprint 3 · lun 28 sep – vie 2 oct')).toBeInTheDocument();
  });

  it('gives the teacher information only', () => {
    renderHeader(openSprintBoardFixture(), null);

    expect(screen.getByText(/Sprint 3/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('SprintHeader: moderator actions on the open sprint', () => {
  it('validates every pending card of the sprint at once', async () => {
    const fetchMock = mockApi({
      'POST /teams/t1/cards/validate-all': () => jsonResponse(200, { validatedIds: ['cmine', 'cother'] }),
    });
    renderHeader(openSprintBoardFixture(), MODERATOR_ID);

    // cmine and cother wait in Por hacer; cmod (validated) and the Backlog cards do not count.
    fireEvent.click(screen.getByRole('button', { name: 'Validar todas (2)' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se validaron 2 tarjetas.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('disables "Validar todas" when nothing waits for validation', () => {
    const board = openSprintBoardFixture();
    const cards = board.cards.map((card) => ({ ...card, validated: card.status !== 'BACKLOG' }));

    renderHeader({ ...board, cards }, MODERATOR_ID);

    expect(screen.getByRole('button', { name: 'Validar todas (0)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar sprint' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Iniciar sprint de la semana' })).not.toBeInTheDocument();
  });

  it('explains a failed "Validar todas"', async () => {
    mockApi({ 'POST /teams/t1/cards/validate-all': () => errorResponse(409, 'NO_OPEN_SPRINT') });
    renderHeader(openSprintBoardFixture(), MODERATOR_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Validar todas (2)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay un sprint abierto.');
  });

  it('disables every sprint action while offline', () => {
    renderHeader(openSprintBoardFixture(), MODERATOR_ID, { online: false });

    expect(screen.getByRole('button', { name: 'Validar todas (2)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar sprint' })).toBeDisabled();
  });

  it('disables starting a sprint while offline', () => {
    renderHeader(boardFixture(), MODERATOR_ID, { online: false });

    expect(screen.getByRole('button', { name: 'Iniciar sprint de la semana' })).toBeDisabled();
  });
});

describe('SprintHeader: dialogs', () => {
  it('opens and cancels the start dialog', () => {
    renderHeader(boardFixture(), MODERATOR_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sprint de la semana' }));
    const dialog = screen.getByRole('dialog', { name: 'Iniciar sprint de la semana' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms the close with the number of unfinished cards, then closes the sprint', async () => {
    const fetchMock = mockApi({
      'POST /sprints/s1/close': () => jsonResponse(200, { sprint: {}, returnedCardIds: ['cmine', 'cmod', 'cother'] }),
    });
    renderHeader(openSprintBoardFixture(), MODERATOR_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sprint' }));
    const dialog = screen.getByRole('dialog', { name: '¿Cerrar el sprint 3?' });
    // cmine, cother (Por hacer) and cmod (En marcha) return; cdone (Terminado) and the Backlog cards do not count.
    expect(dialog).toHaveTextContent(
      '3 tarjetas sin terminar regresarán al Backlog con su responsable; las terminadas se archivan con el sprint.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar sprint' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
