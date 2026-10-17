import { SPRINT_GOAL_MAX_LENGTH } from '@kanbit/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/query-client';
import { sprintFixture } from '../../test/board-fixtures';
import { errorResponse, jsonResponse, mockApi, requestBody } from '../../test/utils';
import { StartSprintDialog } from './StartSprintDialog';

function renderDialog({ online = true } = {}) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <StartSprintDialog teamId="t1" online={online} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Iniciar sprint de la semana' }) };
}

const goalInput = (dialog: HTMLElement) => within(dialog).getByLabelText('Meta del sprint');
const startButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Iniciar sprint' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StartSprintDialog', () => {
  it('explains the Monday–Friday dates and focuses the goal', () => {
    const { dialog } = renderDialog();

    expect(within(dialog).getByText(/de lunes a viernes de esta semana/)).toBeInTheDocument();
    expect(within(dialog).getByText(/sábado o domingo, será la semana siguiente/)).toBeInTheDocument();
    expect(goalInput(dialog)).toHaveFocus();
  });

  it('asks for the goal before sending anything', () => {
    const fetchMock = mockApi({});
    const { dialog } = renderDialog();

    fireEvent.change(goalInput(dialog), { target: { value: '   ' } });
    fireEvent.click(startButton(dialog));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escribe la meta del sprint.');
    expect(goalInput(dialog)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a goal over the limit', () => {
    const fetchMock = mockApi({});
    const { dialog } = renderDialog();

    fireEvent.change(goalInput(dialog), { target: { value: 'x'.repeat(SPRINT_GOAL_MAX_LENGTH + 1) } });
    fireEvent.click(startButton(dialog));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(`como máximo ${SPRINT_GOAL_MAX_LENGTH} caracteres`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts the sprint with the trimmed goal and closes', async () => {
    const fetchMock = mockApi({ 'POST /teams/t1/sprints': () => jsonResponse(201, { ...sprintFixture(), teamId: 't1' }) });
    const { dialog, onClose } = renderDialog();

    fireEvent.change(goalInput(dialog), { target: { value: '  Terminar el login ' } });
    fireEvent.click(startButton(dialog));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requestBody(fetchMock, 'POST /teams/t1/sprints')).toEqual({ goal: 'Terminar el login' });
  });

  it('explains that a sprint is already open', async () => {
    mockApi({ 'POST /teams/t1/sprints': () => errorResponse(409, 'SPRINT_ALREADY_OPEN') });
    const { dialog, onClose } = renderDialog();

    fireEvent.change(goalInput(dialog), { target: { value: 'Terminar el login' } });
    fireEvent.click(startButton(dialog));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ya hay un sprint abierto para este equipo.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cannot start while offline', () => {
    const { dialog } = renderDialog({ online: false });

    expect(startButton(dialog)).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Sin conexión');
  });
});
