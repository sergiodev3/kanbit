import type { BoardResponse } from '@kanbit/shared';
import { act, screen } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardFixture, openSprintBoardFixture, OTHER_ID, STUDENT_ID } from '../../test/board-fixtures';
import { jsonResponse, meFixture, mockApi, renderRoutes } from '../../test/utils';
import { resolveDrop, type DropOver } from './board-dnd';
import type { BoardDnd as RealBoardDnd } from './BoardDnd';
import { BoardPage } from './BoardPage';

type BoardDndProps = ComponentProps<typeof RealBoardDnd>;

// jsdom has no layout, so a real drag cannot land on a cell. The real BoardDnd still renders; the test only keeps
// its latest props to drop a card the way its `onDragEnd` does: through the real `resolveDrop`.
const latest = vi.hoisted(() => ({ props: null as BoardDndProps | null }));

vi.mock('./BoardDnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./BoardDnd')>();
  return {
    ...actual,
    BoardDnd: (props: BoardDndProps) => {
      latest.props = props;
      return createElement(actual.BoardDnd, props);
    },
  };
});

const routes: RouteObject[] = [{ path: '/team', element: <BoardPage teamId="t1" /> }];

async function renderBoard(board: BoardResponse) {
  mockApi({
    'GET /auth/me': () => jsonResponse(200, meFixture('STUDENT')),
    'GET /teams/t1/board': () => jsonResponse(200, board),
  });
  renderRoutes(routes, ['/team']);
  await screen.findByText('Login con JWT');
}

function drop(cardId: string, over: DropOver) {
  const props = latest.props;
  if (!props) throw new Error('BoardDnd not rendered');
  act(() => props.onDecision(resolveDrop(props.board, props.viewer, cardId, over)));
}

afterEach(() => {
  vi.unstubAllGlobals();
  latest.props = null;
});

describe('BoardPage: refused drops', () => {
  it('explains that a card cannot leave the backlog without an open sprint', async () => {
    await renderBoard(boardFixture());

    drop('cfree1', { assigneeId: STUDENT_ID, status: 'TODO', overCardId: null });

    expect(screen.getByText('No hay un sprint abierto. El moderador debe iniciar el sprint de la semana.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains that the moderator must validate a card before En marcha', async () => {
    await renderBoard(openSprintBoardFixture());

    drop('cmine', { assigneeId: STUDENT_ID, status: 'DOING', overCardId: null });

    expect(
      screen.getByText('La tarjeta debe estar validada por el moderador antes de pasar a En marcha o Terminado.'),
    ).toBeInTheDocument();
  });

  it('keeps the permission notice for cells the viewer may not use', async () => {
    await renderBoard(openSprintBoardFixture());

    drop('cmine', { assigneeId: OTHER_ID, status: 'TODO', overCardId: null });

    expect(screen.getByText('No puedes mover esta tarjeta a esa celda.')).toBeInTheDocument();
  });
});
